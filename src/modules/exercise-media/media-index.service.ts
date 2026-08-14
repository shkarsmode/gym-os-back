import fs from "node:fs";
import path from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import {
    MEDIA_INDEX_MIN_ENTRIES,
    MEDIA_INDEX_REFRESH_MS,
    MEDIA_MATCH_COVERAGE_WEIGHT,
    MEDIA_MATCH_DICE_WEIGHT,
    MEDIA_MATCH_EQUIPMENT_BONUS,
    MEDIA_MATCH_EXACT_SLUG_BONUS,
    MEDIA_MATCH_MUSCLE_BONUS
} from "./media.constants";
import { fetchMediaIndexSnapshot } from "./media-sitemap";
import { MediaIndexEntry, MediaIndexSnapshot } from "./media.types";

export type MediaIndexSource = "sitemap" | "snapshot" | "none";

export interface ScoreTargets {
    // The full resolved English name plus every alias. Each is scored separately and the
    // entry keeps its best result, because users and the model disagree about which
    // spelling is canonical far more often than they disagree about the movement.
    phrases: string[];
    equipment: string;
    muscle: string;
}

export interface ScoredEntry<T> {
    entry: T;
    score: number;
    exactSlug: boolean;
    // Share of the entry's own tokens the query explains. Never part of `score` - it is
    // only a tiebreak, so "cable triceps extension" beats "cable lying triceps extension"
    // once the spec formula has already capped both at 1.
    specificity: number;
}

const STOPWORDS = new Set([
    "the", "a", "an", "and", "with", "for", "on", "in", "to", "of", "exercise", "gif", "вправа"
]);

const SYNONYMS: Record<string, string> = {
    db: "dumbbell",
    bb: "barbell",
    ez: "ezbar",
    kb: "kettlebell",
    bodyweight: "body",
    pulldown: "pull",
    pushdown: "push",
    overhand: "over",
    machines: "machine",
    dumbell: "dumbbell",
    dumbbells: "dumbbell",
    barbells: "barbell"
};

// Combining marks left over by NFKD decomposition, and everything that is neither a
// Latin alphanumeric nor a Cyrillic letter.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");
const NON_INDEXABLE = new RegExp("[^a-z0-9\\u0400-\\u04ff]+", "g");

// Cyrillic survives tokenization on purpose. Tier-1 slugs are Latin so it changes
// nothing there, but tier-0 catalog rows carry Ukrainian names, and letting the raw
// Ukrainian query match them directly is the single strongest signal we have for
// "this exercise is already in our own catalog".
export function tokenize(text: string): string[] {
    return String(text || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(COMBINING_MARKS, "")
        .replace(NON_INDEXABLE, " ")
        .split(" ")
        .filter(Boolean)
        .map((token) => SYNONYMS[token] || token)
        .map((token) => (token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token))
        .filter((token) => !STOPWORDS.has(token));
}

export function slugify(text: string): string {
    return String(text || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(COMBINING_MARKS, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function dice(left: Set<string>, right: Set<string>): number {
    if (!left.size || !right.size) {
        return 0;
    }
    let shared = 0;
    for (const token of left) {
        if (right.has(token)) {
            shared += 1;
        }
    }
    return (2 * shared) / (left.size + right.size);
}

function overlap(left: Set<string>, right: Set<string>): number {
    let shared = 0;
    for (const token of left) {
        if (right.has(token)) {
            shared += 1;
        }
    }
    return shared;
}

// The scoring core, exported so both tiers and the tests use exactly one implementation.
export function scoreTokens(
    queryTokens: Set<string>,
    entryTokens: Set<string>,
    targets: ScoreTargets
): { score: number; specificity: number } {
    if (!queryTokens.size || !entryTokens.size) {
        return { score: 0, specificity: 0 };
    }

    const shared = overlap(queryTokens, entryTokens);
    const base = dice(queryTokens, entryTokens);
    const coverage = shared / queryTokens.size;
    let score = MEDIA_MATCH_DICE_WEIGHT * base + MEDIA_MATCH_COVERAGE_WEIGHT * coverage;

    for (const token of tokenize(targets.equipment)) {
        if (entryTokens.has(token)) {
            score += MEDIA_MATCH_EQUIPMENT_BONUS;
            break;
        }
    }
    for (const token of tokenize(targets.muscle)) {
        if (entryTokens.has(token)) {
            score += MEDIA_MATCH_MUSCLE_BONUS;
            break;
        }
    }

    return { score, specificity: shared / entryTokens.size };
}

// Loads the committed snapshot synchronously, then keeps itself warm from the live
// sitemap without ever making a request wait for it.
@Injectable()
export class MediaIndexService {
    private readonly logger = new Logger(MediaIndexService.name);
    private entries: MediaIndexEntry[] = [];
    private tokensBySlug = new Map<string, Set<string>>();
    private source: MediaIndexSource = "none";
    private loadedAt = 0;
    private refreshing = false;

    all(): MediaIndexEntry[] {
        this.ensureLoaded();
        this.maybeRefresh();
        return this.entries;
    }

    size(): number {
        this.ensureLoaded();
        return this.entries.length;
    }

    indexSource(): MediaIndexSource {
        this.ensureLoaded();
        return this.source;
    }

    // Ranked matches over the whole index. Returns everything above the caller's
    // threshold; slicing and gif-vs-photo ordering belong to the assembler.
    search(targets: ScoreTargets, minScore: number): Array<ScoredEntry<MediaIndexEntry>> {
        const entries = this.all();
        if (!entries.length) {
            return [];
        }

        const queries = buildQueryTokenSets(targets.phrases);
        if (!queries.length) {
            return [];
        }

        const results: Array<ScoredEntry<MediaIndexEntry>> = [];
        for (const entry of entries) {
            const entryTokens = this.tokensFor(entry);
            let best = 0;
            let bestSpecificity = 0;
            let exactSlug = false;

            for (const query of queries) {
                const scored = scoreTokens(query.tokens, entryTokens, targets);
                let value = scored.score;
                if (query.slug && query.slug === entry.slug) {
                    exactSlug = true;
                    value += MEDIA_MATCH_EXACT_SLUG_BONUS;
                }
                value = Math.min(value, 1);
                if (value > best) {
                    best = value;
                    bestSpecificity = scored.specificity;
                }
            }

            if (best >= minScore) {
                results.push({ entry, score: best, exactSlug, specificity: bestSpecificity });
            }
        }

        return results.sort(compareScored);
    }

    private tokensFor(entry: MediaIndexEntry): Set<string> {
        let tokens = this.tokensBySlug.get(entry.slug);
        if (!tokens) {
            tokens = new Set(tokenize(entry.slug));
            this.tokensBySlug.set(entry.slug, tokens);
        }
        return tokens;
    }

    private ensureLoaded(): void {
        if (this.loadedAt) {
            return;
        }
        this.loadedAt = Date.now();
        const snapshot = readCommittedSnapshot();
        if (!snapshot) {
            // Rung 3 of the ladder: no index at all. The caller falls back to tier 0.
            this.logger.warn("fitnessprogramer snapshot is missing or unreadable, tier 1 disabled");
            this.source = "none";
            return;
        }
        this.adopt(snapshot, "snapshot");
    }

    private adopt(snapshot: MediaIndexSnapshot, source: MediaIndexSource): void {
        this.entries = snapshot.entries;
        this.tokensBySlug = new Map();
        this.source = source;
        this.loadedAt = Date.now();
    }

    // Fire-and-forget. An 858 ms sitemap fetch inside a cold lambda would be the single
    // largest latency component of the whole feature, and a day-old snapshot is a
    // perfectly good answer, so the current data is always returned immediately.
    private maybeRefresh(): void {
        if (this.refreshing || this.source === "sitemap") {
            return;
        }
        if (this.entries.length && Date.now() - this.loadedAt < MEDIA_INDEX_REFRESH_MS) {
            return;
        }
        this.refreshing = true;
        void fetchMediaIndexSnapshot()
            .then((snapshot) => {
                if (snapshot.count < MEDIA_INDEX_MIN_ENTRIES) {
                    // The site restructured its sitemap into something we misparse. Keep
                    // the previous data rather than replacing 1234 entries with garbage.
                    this.logger.warn(`sitemap refresh yielded only ${snapshot.count} entries, keeping previous index`);
                    return;
                }
                this.adopt(snapshot, "sitemap");
                this.logger.log(`media index refreshed from sitemap: ${snapshot.count} entries`);
            })
            .catch((error) => {
                this.logger.warn(`sitemap refresh failed: ${(error as Error).message}`);
            })
            .finally(() => {
                this.refreshing = false;
            });
    }
}

export interface QueryTokenSet {
    tokens: Set<string>;
    slug: string;
}

export function buildQueryTokenSets(phrases: string[]): QueryTokenSet[] {
    const seen = new Set<string>();
    const queries: QueryTokenSet[] = [];
    for (const phrase of phrases) {
        const tokens = tokenize(phrase);
        if (!tokens.length) {
            continue;
        }
        const key = [...tokens].sort().join(" ");
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        queries.push({ tokens: new Set(tokens), slug: slugify(phrase) });
    }
    return queries;
}

export function compareScored<T>(left: ScoredEntry<T>, right: ScoredEntry<T>): number {
    if (right.score !== left.score) {
        return right.score - left.score;
    }
    if (right.exactSlug !== left.exactSlug) {
        return right.exactSlug ? 1 : -1;
    }
    return right.specificity - left.specificity;
}

// require() with a literal path, so Vercel's file tracer statically sees the JSON and
// bundles it into the lambda; a computed path would silently ship without it and drop
// the whole feature to rung 3. The fs fallback covers layouts the tracer gets wrong.
function readCommittedSnapshot(): MediaIndexSnapshot | null {
    try {
        return validateSnapshot(require("../../../prisma/data/fitnessprogramer-index.json"));
    } catch {
        // Fall through to the filesystem.
    }

    const candidates = [
        path.join(__dirname, "..", "..", "..", "prisma", "data", "fitnessprogramer-index.json"),
        path.join(process.cwd(), "prisma", "data", "fitnessprogramer-index.json")
    ];
    for (const candidate of candidates) {
        try {
            return validateSnapshot(JSON.parse(fs.readFileSync(candidate, "utf8")));
        } catch {
            // Try the next candidate.
        }
    }
    return null;
}

function validateSnapshot(payload: unknown): MediaIndexSnapshot | null {
    const snapshot = payload as MediaIndexSnapshot;
    if (!snapshot || !Array.isArray(snapshot.entries) || !snapshot.entries.length) {
        return null;
    }
    return snapshot;
}

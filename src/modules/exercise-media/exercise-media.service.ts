import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
    MEDIA_CATALOG_CACHE_TTL_MS,
    MEDIA_GIF_SUFFICIENT,
    MEDIA_HOST_ALLOWLIST,
    MEDIA_MATCH_EXACT_SLUG_BONUS,
    MEDIA_MATCH_MIN_SCORE,
    MEDIA_MATCH_RELATIVE_FLOOR,
    MEDIA_NEARBY_LIMIT,
    MEDIA_SOURCE_LABELS,
    MEDIA_SUGGEST_CACHE_MAX,
    MEDIA_SUGGEST_CACHE_TTL_MS,
    MEDIA_SUGGEST_DEFAULT_LIMIT,
    MEDIA_SUGGEST_MAX_LIMIT,
    MEDIA_TOTAL_BUDGET_MS,
    MEDIA_VERIFY_MAX_CANDIDATES,
    mediaCatalogOnly
} from "./media.constants";
import { TtlLruCache } from "./media-cache";
import {
    compareScored,
    MediaIndexService,
    ScoredEntry,
    ScoreTargets,
    scoreTokens,
    slugify,
    tokenize
} from "./media-index.service";
import { MediaNameService } from "./media-name.service";
import { MediaVerifierService } from "./media-verifier.service";
import {
    MediaCandidate,
    MediaDegraded,
    MediaSuggestItem,
    MediaSuggestRequest,
    MediaSuggestResponse
} from "./media.types";

interface CatalogRow {
    slug: string;
    name: string;
    aliases: string[];
    mediaUrl: string;
    mediaType: string;
    primaryMuscleGroup: string;
    sourceUrl: string | null;
}

const suggestCache = new TtlLruCache<MediaSuggestResponse>(MEDIA_SUGGEST_CACHE_MAX, MEDIA_SUGGEST_CACHE_TTL_MS);
const catalogCache = new TtlLruCache<CatalogRow[]>(1, MEDIA_CATALOG_CACHE_TTL_MS);

@Injectable()
export class ExerciseMediaService {
    private readonly logger = new Logger(ExerciseMediaService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly index: MediaIndexService,
        private readonly names: MediaNameService,
        private readonly verifier: MediaVerifierService
    ) {}

    // Wrapped in a hard budget. On exhaustion the caller still gets a 200 with whatever
    // was assembled, because an empty suggestion sheet is a far better outcome than a
    // spinner that never resolves inside a modal the user cannot dismiss.
    async suggest(userId: string | null, request: MediaSuggestRequest): Promise<MediaSuggestResponse> {
        const startedAt = Date.now();
        const timeout = new Promise<MediaSuggestResponse>((resolve) => {
            setTimeout(() => resolve(this.emptyResponse(request, "timeout", startedAt)), MEDIA_TOTAL_BUDGET_MS).unref?.();
        });
        return await Promise.race([this.run(userId, request, startedAt), timeout]);
    }

    private async run(userId: string | null, request: MediaSuggestRequest, startedAt: number): Promise<MediaSuggestResponse> {
        const cacheKey = suggestCacheKey(request);
        const cached = suggestCache.get(cacheKey);
        if (cached) {
            return { ...cached, timings: { ...cached.timings, total: Date.now() - startedAt } };
        }

        const aiStartedAt = Date.now();
        const resolved = await this.names.resolve(userId, request);
        const aiMs = Date.now() - aiStartedAt;

        const matchStartedAt = Date.now();
        const catalog = await this.loadCatalog();
        const targets: ScoreTargets = {
            // The raw Ukrainian name is scored too: tier-0 rows carry Ukrainian names, so
            // this is what lets "Жим гантелей лежачи" match our own catalog row directly.
            phrases: [resolved.englishName, ...resolved.aliases, request.name].filter(Boolean),
            equipment: [resolved.equipment, request.equipment].filter(Boolean).join(" "),
            muscle: [resolved.primaryMuscle, request.primaryMuscleGroup].filter(Boolean).join(" ")
        };

        const tier0 = this.matchCatalog(catalog, targets);
        const tier1 = mediaCatalogOnly() ? [] : this.matchIndex(targets);
        const indexSize = this.index.size();
        const indexSource = this.index.indexSource();

        const candidates = applyRelativeFloor([...tier0, ...tier1])
            .sort(compareCandidates)
            .slice(0, MEDIA_VERIFY_MAX_CANDIDATES);
        const matchMs = Date.now() - matchStartedAt;

        const verifyStartedAt = Date.now();
        const batch = await this.verifier.verifyAll(candidates.map((candidate) => candidate.url));
        const verifyMs = Date.now() - verifyStartedAt;

        let degraded: MediaDegraded | null = resolved.degraded;
        if (indexSource === "none" && !mediaCatalogOnly()) {
            degraded = "index_unavailable";
        }

        let items = assemble(candidates, batch.verified, request.limit);

        // The one carve-out: if literally nothing verified, the network is the problem
        // rather than the URLs. Tier-0 URLs are rendering in production for every user
        // right now, so their liveness is evidenced by traffic. Tier 1 gets no such pass.
        if (!items.length && batch.attempted > 0 && batch.verified.size === 0) {
            items = candidates
                .filter((candidate) => candidate.tier === 0)
                .slice(0, request.limit)
                .map((candidate) => toItem(candidate, null, false));
            degraded = "verification_failed";
        } else if (batch.timedOut && !items.length) {
            degraded = "timeout";
        }

        let nearby: MediaSuggestItem[] = [];
        if (!items.length) {
            degraded = degraded && degraded !== "ai_unavailable" && degraded !== "ai_quota" ? degraded : "no_match";
            nearby = await this.nearbyFromCatalog(catalog, request, batch.verified);
        }

        const response: MediaSuggestResponse = {
            query: request.name,
            resolvedName: resolved.englishName,
            resolvedAliases: resolved.aliases,
            aiUsed: resolved.aiUsed,
            aiModel: resolved.aiModel,
            lowConfidence: resolved.lowConfidence,
            indexSource,
            indexSize,
            degraded,
            timings: { ai: aiMs, match: matchMs, verify: verifyMs, total: Date.now() - startedAt },
            items,
            nearby
        };

        // Only a clean, verified answer is worth six hours. Caching a degraded one would
        // pin a transient network failure to the user for the rest of the afternoon.
        if (!degraded && items.length) {
            suggestCache.set(cacheKey, response);
        }
        return response;
    }

    private matchIndex(targets: ScoreTargets): MediaCandidate[] {
        return this.index.search(targets, MEDIA_MATCH_MIN_SCORE).map((scored) => ({
            url: scored.entry.url,
            label: scored.entry.name,
            source: "fitnessprogramer" as const,
            sourcePage: scored.entry.page,
            tier: 1 as const,
            score: round(scored.score),
            isGif: scored.entry.isGif,
            specificity: scored.specificity
        }));
    }

    // Tier 0 is ranked first for a reason: these URLs are already rendering in the app
    // for every user, so they are both proven live and guaranteed to be in house style.
    private matchCatalog(catalog: CatalogRow[], targets: ScoreTargets): MediaCandidate[] {
        const scored: Array<ScoredEntry<CatalogRow>> = [];
        const queries = targets.phrases
            .map((phrase) => ({ tokens: new Set(tokenize(phrase)), slug: slugify(phrase) }))
            .filter((query) => query.tokens.size > 0);

        for (const row of catalog) {
            // Slug, English aliases and the Ukrainian display name all go into one token
            // bag, so an English query and a Ukrainian query can both reach the same row.
            const entryTokens = new Set([
                ...tokenize(row.slug),
                ...tokenize(row.name),
                ...row.aliases.flatMap((alias) => tokenize(alias))
            ]);

            let best = 0;
            let bestSpecificity = 0;
            let exactSlug = false;
            for (const query of queries) {
                const result = scoreTokens(query.tokens, entryTokens, targets);
                let value = result.score;
                if (query.slug && query.slug === row.slug) {
                    exactSlug = true;
                    value += MEDIA_MATCH_EXACT_SLUG_BONUS;
                }
                value = Math.min(value, 1);
                if (value > best) {
                    best = value;
                    bestSpecificity = result.specificity;
                }
            }

            if (best >= MEDIA_MATCH_MIN_SCORE) {
                scored.push({ entry: row, score: best, exactSlug, specificity: bestSpecificity });
            }
        }

        return scored.sort(compareScored).map((item) => ({
            url: item.entry.mediaUrl,
            label: item.entry.name,
            source: "catalog" as const,
            sourcePage: item.entry.sourceUrl,
            tier: 0 as const,
            score: round(item.score),
            isGif: item.entry.mediaType === "gif" || /\.gif(\?|#|$)/i.test(item.entry.mediaUrl),
            specificity: item.specificity
        }));
    }

    // Rung 4: nothing cleared the threshold, so offer approved catalog exercises from the
    // same muscle group. The sheet is never blank and the feature never invents to fill it.
    private async nearbyFromCatalog(
        catalog: CatalogRow[],
        request: MediaSuggestRequest,
        alreadyVerified: Map<string, { mediaType: "gif" | "image"; contentType: string; bytes: number }>
    ): Promise<MediaSuggestItem[]> {
        const wanted = String(request.primaryMuscleGroup || "").trim().toLowerCase();
        if (!wanted) {
            return [];
        }
        const rows = catalog
            .filter((row) => row.primaryMuscleGroup.trim().toLowerCase() === wanted)
            .slice(0, MEDIA_NEARBY_LIMIT);
        if (!rows.length) {
            return [];
        }

        const batch = await this.verifier.verifyAll(rows.map((row) => row.mediaUrl));
        return rows
            .map((row) => {
                const verified = batch.verified.get(row.mediaUrl) || alreadyVerified.get(row.mediaUrl) || null;
                if (!verified) {
                    return null;
                }
                return toItem(
                    {
                        url: row.mediaUrl,
                        label: row.name,
                        source: "catalog",
                        sourcePage: row.sourceUrl,
                        tier: 0,
                        score: 0,
                        isGif: verified.mediaType === "gif",
                        specificity: 0
                    },
                    verified,
                    true
                );
            })
            .filter((item): item is MediaSuggestItem => item !== null);
    }

    private async loadCatalog(): Promise<CatalogRow[]> {
        const cached = catalogCache.get("catalog");
        if (cached) {
            return cached;
        }
        try {
            const rows = await this.prisma.exercise.findMany({
                where: { status: "approved", mediaUrl: { not: null } },
                select: {
                    slug: true,
                    name: true,
                    aliases: true,
                    mediaUrl: true,
                    mediaType: true,
                    primaryMuscleGroup: true,
                    sourceUrl: true
                }
            });
            const catalog = rows
                .filter((row) => typeof row.mediaUrl === "string" && isAllowedMediaHost(row.mediaUrl))
                .map((row) => ({
                    slug: row.slug,
                    name: row.name,
                    aliases: Array.isArray(row.aliases) ? (row.aliases as unknown[]).filter((alias): alias is string => typeof alias === "string") : [],
                    mediaUrl: row.mediaUrl as string,
                    mediaType: row.mediaType,
                    primaryMuscleGroup: row.primaryMuscleGroup,
                    sourceUrl: row.sourceUrl
                }));
            catalogCache.set("catalog", catalog);
            return catalog;
        } catch (error) {
            // Rung 3 in the other direction: no DB, so tier 1 carries the whole feature.
            this.logger.warn(`catalog lookup failed, serving tier 1 only: ${(error as Error).message}`);
            return [];
        }
    }

    private emptyResponse(request: MediaSuggestRequest, degraded: MediaDegraded, startedAt: number): MediaSuggestResponse {
        return {
            query: request.name,
            resolvedName: request.name,
            resolvedAliases: [],
            aiUsed: false,
            aiModel: null,
            lowConfidence: false,
            indexSource: this.index.indexSource(),
            indexSize: this.index.size(),
            degraded,
            timings: { ai: 0, match: 0, verify: 0, total: Date.now() - startedAt },
            items: [],
            nearby: []
        };
    }
}

// Runs before the tier sort, which is the whole point: the sort deliberately puts tier 0
// ahead of tier 1 regardless of score, so without a relative floor a mediocre catalog row
// buries a perfect sitemap match. Absolute thresholds cannot express this - 0.46 is a
// reasonable score in isolation and a bad one next to a 1.00.
export function applyRelativeFloor(candidates: MediaCandidate[]): MediaCandidate[] {
    if (candidates.length < 2) {
        return candidates;
    }
    const best = candidates.reduce((highest, candidate) => Math.max(highest, candidate.score), 0);
    return candidates.filter((candidate) => candidate.score >= best - MEDIA_MATCH_RELATIVE_FLOOR);
}

// Pre-verification ordering: gif first, then our own catalog, then score. `bytes` is not
// known yet, so it only participates in the post-verification sort.
export function compareCandidates(left: MediaCandidate, right: MediaCandidate): number {
    if (left.isGif !== right.isGif) {
        return left.isGif ? -1 : 1;
    }
    if (left.tier !== right.tier) {
        return left.tier - right.tier;
    }
    if (right.score !== left.score) {
        return right.score - left.score;
    }
    return right.specificity - left.specificity;
}

// The fourth and last place gif-over-photo is enforced. `mediaType` here comes from the
// verified content-type, not the file extension, so a ".gif" that actually serves jpeg
// has already been demoted to a photo by this point and cannot outrank a real animation.
export function assemble(
    candidates: MediaCandidate[],
    verified: Map<string, { url: string; contentType: string; bytes: number; mediaType: "gif" | "image" }>,
    limit: number
): MediaSuggestItem[] {
    const survivors = candidates
        .map((candidate) => {
            const proof = verified.get(candidate.url);
            return proof ? { candidate, proof } : null;
        })
        .filter((entry): entry is { candidate: MediaCandidate; proof: { url: string; contentType: string; bytes: number; mediaType: "gif" | "image" } } => entry !== null);

    survivors.sort((left, right) => {
        const leftGif = left.proof.mediaType === "gif";
        const rightGif = right.proof.mediaType === "gif";
        if (leftGif !== rightGif) {
            return leftGif ? -1 : 1;
        }
        if (left.candidate.tier !== right.candidate.tier) {
            return left.candidate.tier - right.candidate.tier;
        }
        if (right.candidate.score !== left.candidate.score) {
            return right.candidate.score - left.candidate.score;
        }
        if (right.candidate.specificity !== left.candidate.specificity) {
            return right.candidate.specificity - left.candidate.specificity;
        }
        return (right.proof.bytes || 0) - (left.proof.bytes || 0);
    });

    const gifs = survivors.filter((entry) => entry.proof.mediaType === "gif");
    // Enough animations survived, so the static photos are pure noise. Drop them.
    const pool = gifs.length >= MEDIA_GIF_SUFFICIENT ? gifs : survivors;

    // The same gif can be both a catalog row and a sitemap entry; show it once.
    const seen = new Set<string>();
    const unique: MediaSuggestItem[] = [];
    for (const entry of pool) {
        if (seen.has(entry.candidate.url)) {
            continue;
        }
        seen.add(entry.candidate.url);
        unique.push(toItem(entry.candidate, entry.proof, true));
    }
    return unique.slice(0, limit);
}

// Gate A of the provenance guard, on the tier-0 side. Tier 1 is inherently in-house
// (every sitemap entry is a fitnessprogramer.com URL), but a catalog row's mediaUrl is
// whatever a user typed into the exercise form. Without this, one user's arbitrary URL
// could be suggested to another user, which is the one way this feature could hand out a
// link nobody vetted. loadCatalog() is the single funnel for both scored and nearby
// candidates, so checking here covers every tier-0 path.
export function isAllowedMediaHost(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" && MEDIA_HOST_ALLOWLIST.includes(parsed.hostname.toLowerCase());
    } catch (error) {
        return false;
    }
}

function toItem(
    candidate: MediaCandidate,
    proof: { contentType: string; bytes: number; mediaType: "gif" | "image" } | null,
    verified: boolean
): MediaSuggestItem {
    return {
        url: candidate.url,
        label: candidate.label,
        source: candidate.source,
        sourceLabel: MEDIA_SOURCE_LABELS[candidate.source] || candidate.source,
        sourcePage: candidate.sourcePage,
        mediaType: proof ? proof.mediaType : candidate.isGif ? "gif" : "image",
        contentType: proof ? proof.contentType : null,
        bytes: proof ? proof.bytes : null,
        score: candidate.score,
        verified,
        verifiedBy: verified ? "head" : "in_use"
    };
}

export function normalizeRequest(input: Partial<MediaSuggestRequest>): MediaSuggestRequest {
    const limit = Number(input.limit);
    return {
        name: String(input.name || "").trim(),
        aliases: Array.isArray(input.aliases) ? input.aliases.map((alias) => String(alias).trim()).filter(Boolean).slice(0, 8) : [],
        primaryMuscleGroup: String(input.primaryMuscleGroup || "").trim(),
        equipment: String(input.equipment || "").trim(),
        movementPattern: String(input.movementPattern || "").trim(),
        limit: Number.isFinite(limit) && limit > 0 ? Math.min(Math.trunc(limit), MEDIA_SUGGEST_MAX_LIMIT) : MEDIA_SUGGEST_DEFAULT_LIMIT
    };
}

function suggestCacheKey(request: MediaSuggestRequest): string {
    return [
        request.name,
        (request.aliases || []).join("|"),
        request.equipment,
        request.primaryMuscleGroup,
        request.movementPattern,
        request.limit
    ]
        .join("::")
        .trim()
        .toLowerCase();
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}

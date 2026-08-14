import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RequestUser } from "../../shared/current-user.decorator";
import {
    AI_ERROR,
    AI_MAX_CATALOG,
    DUPLICATE_EXACT_SCORE,
    DUPLICATE_JUDGE_FLOOR,
    DUPLICATE_LOCAL_ONLY_FLOOR,
    DUPLICATE_MAX_CANDIDATES,
    DUPLICATE_MAX_DESCRIPTION_CHARS,
    DUPLICATE_MAX_OUTPUT_TOKENS,
    DUPLICATE_MAX_PER_WINDOW,
    DUPLICATE_OPERATION,
    DUPLICATE_PREMIUM_DAILY_LIMIT,
    DUPLICATE_TEMPERATURE,
    DUPLICATE_TIMEOUT_MS,
    DUPLICATE_MIN_NAME_LENGTH,
    DUPLICATE_WINDOW_MS
} from "./ai.constants";
import { AiUsageService } from "./ai-usage.service";
import { GeminiService } from "./gemini.service";
import { CatalogEntry, normalizeName, rankCandidates, ScoredCandidate } from "./exercise-match";
import { AiError } from "./ai.types";
import { ExerciseDuplicateCheckDto } from "./dto/exercise-duplicate.dto";
import {
    DUPLICATE_SCHEMA,
    DUPLICATE_SYSTEM_INSTRUCTION,
    DuplicateCheckResult,
    DuplicateMatch,
    JudgedMatch,
    localOnlyMatches,
    normalizeDuplicateMatches
} from "./exercise-duplicate";

// Everything the card needs, fetched once for the prefiltered candidates only.
interface CandidateDetail {
    id: string;
    name: string;
    aliases: string[];
    primaryMuscleGroup: string;
    movementPattern: string;
    equipment: string;
    description: string;
    mediaUrl: string;
    mediaType: string;
    status: string;
    isCustom: boolean;
    createdByUserId: string | null;
    createdAt: Date;
    author: string | null;
}

// Advisory duplicate check for the custom-exercise form. The contract that shapes every
// line below: this service NEVER throws AiError and every rung of the ladder answers 200.
// A missing key, a spent quota, a timeout or a garbage response all degrade to the local
// fuzzy candidates - creating an exercise must never depend on Gemini being up.
@Injectable()
export class AiExerciseDuplicateService {
    // Concurrency lock: at most one in-flight judge call per user. On collision the
    // request degrades to the local payload instead of failing (mirrors the idiom in
    // AiWorkoutService, but never the 429).
    private readonly inFlight = new Set<string>();
    // userId -> timestamps of recent Gemini calls. Soft, per-instance abuse guard; the
    // only hard bound is the AiUsageLog-backed daily cap.
    private readonly window = new Map<string, number[]>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly gemini: GeminiService,
        private readonly usage: AiUsageService
    ) {}

    async check(user: RequestUser, tier: string, dto: ExerciseDuplicateCheckDto): Promise<DuplicateCheckResult> {
        // Rung 0: nothing to search for. No DB read, no Gemini.
        const name = String(dto.name || "");
        if (normalizeName(name).length < DUPLICATE_MIN_NAME_LENGTH) {
            return emptyResult(tier, AI_ERROR.INPUT_TOO_SHORT);
        }

        // Rung 1: an empty catalog is a legitimate state, not an error. A DB blip is not
        // one either: this endpoint is advisory and sits on the submit path, so it answers
        // "nothing to warn about" rather than 500-ing and making the caller decide what a
        // failed advisory means. The catalog read is the only thing that can fail here.
        let catalog: CatalogEntry[] = [];
        try {
            catalog = await this.buildCatalog(user.id);
        } catch (error) {
            return emptyResult(tier, AI_ERROR.GEMINI_ERROR);
        }
        if (!catalog.length) {
            return emptyResult(tier, null);
        }

        // Rung 2: the common case for a genuinely new name. Costs zero quota.
        const candidates = rankCandidates(name, catalog)
            .filter((candidate) => candidate.score >= DUPLICATE_JUDGE_FLOOR)
            .slice(0, DUPLICATE_MAX_CANDIDATES);
        if (!candidates.length) {
            return emptyResult(tier, null);
        }

        // One query over at most DUPLICATE_MAX_CANDIDATES ids. buildCatalog deliberately
        // omits description/media/author to keep the prompt small, but the card needs them,
        // and the judge gets a truncated description too. Guarded for the same reason as
        // the catalog read: without the rows there is no card to render, so answer empty.
        let details: Map<string, CandidateDetail>;
        try {
            details = await this.loadCandidateDetails(candidates);
        } catch (error) {
            return emptyResult(tier, AI_ERROR.GEMINI_ERROR);
        }

        // Rung 3: the normalized names are identical, so no judge can add anything.
        if (candidates[0].score >= DUPLICATE_EXACT_SCORE) {
            const exact: JudgedMatch = {
                id: candidates[0].entry.id,
                verdict: "same",
                confidence: 1,
                reason: "Назва повністю збігається з наявною вправою.",
                score: candidates[0].score
            };
            return {
                matches: toMatches([exact], details, user.id),
                aiUsed: false,
                source: "local",
                degradedReason: null,
                meta: { model: null, tier }
            };
        }

        // Rung 4: free users create custom exercises too, so they still get warned - they
        // just get the fuzzy list instead of a verdict. Never a 403.
        if (tier === "free") {
            return localResult(candidates, details, user.id, tier, AI_ERROR.FORBIDDEN);
        }
        // Rung 5: no API key configured.
        if (!this.gemini.isConfigured()) {
            return localResult(candidates, details, user.id, tier, AI_ERROR.NOT_CONFIGURED);
        }
        // Rung 6: premium daily budget of its own (admin is unlimited). Spending it must
        // not spend, or be spent by, the parse and coach budgets.
        if (tier === "premium") {
            // countToday already swallows its own errors, but relying on that makes the
            // "always 200" contract conventional rather than structural. Guard it here so
            // the property holds no matter how the usage service behaves.
            let usedToday = 0;
            try {
                usedToday = await this.usage.countToday(user.id, DUPLICATE_OPERATION);
            } catch (error) {
                usedToday = 0;
            }
            if (usedToday >= DUPLICATE_PREMIUM_DAILY_LIMIT) {
                return localResult(candidates, details, user.id, tier, AI_ERROR.DAILY_LIMIT);
            }
        }
        // Rung 7: parallel submit or a hot loop.
        if (this.inFlight.has(user.id) || !this.consumeWindowSlot(user.id)) {
            return localResult(candidates, details, user.id, tier, AI_ERROR.RATE_LIMIT);
        }

        this.inFlight.add(user.id);
        const startedAt = Date.now();
        const model = this.gemini.getModel();
        const prompt = buildPrompt(name, dto, candidates, details);

        try {
            // ONE attempt, no retry loop: this sits on the submit path, and a second
            // DUPLICATE_TIMEOUT_MS wait would cost more than the answer is worth.
            const response = await this.gemini.generateStructured({
                systemInstruction: DUPLICATE_SYSTEM_INSTRUCTION,
                prompt,
                schema: DUPLICATE_SCHEMA,
                temperature: DUPLICATE_TEMPERATURE,
                maxOutputTokens: DUPLICATE_MAX_OUTPUT_TOKENS,
                timeoutMs: DUPLICATE_TIMEOUT_MS
            });
            const payload = safeParse(response.text);
            if (!payload) {
                throw new AiError(AI_ERROR.INVALID_RESPONSE, "AI повернув некоректну відповідь.", 502);
            }

            // Rung 9. A valid parse that survives no candidate is a SUCCESS with an empty
            // list, not a degradation: the judge saying "all different" is the answer we
            // asked for, and falling back to fuzzy here would resurrect the exact false
            // positives it just rejected.
            const matches = toMatches(normalizeDuplicateMatches(payload, candidates), details, user.id);
            await this.usage.log({
                userId: user.id,
                operation: DUPLICATE_OPERATION,
                model,
                status: "success",
                inputTokens: response.usage.inputTokens,
                outputTokens: response.usage.outputTokens,
                totalTokens: response.usage.totalTokens,
                cachedTokens: response.usage.cachedTokens,
                thoughtsTokens: response.usage.thoughtsTokens,
                durationMs: Date.now() - startedAt,
                inputLength: name.length,
                recognizedExercises: matches.length
            });
            return { matches, aiUsed: true, source: "ai", degradedReason: null, meta: { model, tier } };
        } catch (error) {
            // Rung 8. The deliberate divergence from AiWorkoutService.parse, which rethrows:
            // here the AiError is logged and swallowed, and the user still gets their cards.
            const aiError = error instanceof AiError ? error : new AiError(AI_ERROR.GEMINI_ERROR, "AI запит не виконано.", 502);
            await this.usage.log({
                userId: user.id,
                operation: DUPLICATE_OPERATION,
                model,
                status: "error",
                errorCode: aiError.code,
                errorMessage: aiError.message,
                durationMs: Date.now() - startedAt,
                inputLength: name.length
            });
            return localResult(candidates, details, user.id, tier, aiError.code);
        } finally {
            this.inFlight.delete(user.id);
        }
    }

    // Same visibility set the workout parser searches: approved exercises plus the user's
    // own customs. Compact on purpose - only id/name/aliases/muscle/equipment reach the
    // fuzzy matcher, and only the prefiltered survivors ever reach the model.
    private async buildCatalog(userId: string): Promise<CatalogEntry[]> {
        const exercises = await this.prisma.exercise.findMany({
            where: { OR: [{ status: "approved" }, { createdByUserId: userId }] },
            select: { id: true, name: true, aliases: true, primaryMuscleGroup: true, equipment: true, mediaUrl: true },
            orderBy: { name: "asc" },
            take: AI_MAX_CATALOG
        });
        return exercises.map((exercise) => ({
            id: exercise.id,
            name: exercise.name,
            aliases: toStringArray(exercise.aliases),
            primaryMuscleGroup: exercise.primaryMuscleGroup,
            equipment: exercise.equipment,
            mediaUrl: exercise.mediaUrl || ""
        }));
    }

    private async loadCandidateDetails(candidates: ScoredCandidate[]): Promise<Map<string, CandidateDetail>> {
        const ids = candidates.map((candidate) => candidate.entry.id);
        const rows = await this.prisma.exercise.findMany({
            where: { id: { in: ids } },
            select: {
                id: true,
                name: true,
                aliases: true,
                primaryMuscleGroup: true,
                movementPattern: true,
                equipment: true,
                description: true,
                mediaUrl: true,
                mediaType: true,
                status: true,
                isCustom: true,
                createdByUserId: true,
                createdAt: true,
                createdByUser: { select: { displayName: true } }
            }
        });
        return new Map(
            rows.map((row) => [
                row.id,
                {
                    id: row.id,
                    name: row.name,
                    aliases: toStringArray(row.aliases),
                    primaryMuscleGroup: row.primaryMuscleGroup,
                    movementPattern: row.movementPattern,
                    equipment: row.equipment,
                    description: row.description || "",
                    mediaUrl: row.mediaUrl || "",
                    mediaType: row.mediaType,
                    status: row.status,
                    isCustom: row.isCustom,
                    createdByUserId: row.createdByUserId,
                    createdAt: row.createdAt,
                    // null means the built-in catalog; the client renders that as "GymOS".
                    author: row.createdByUser?.displayName ?? null
                }
            ])
        );
    }

    // Rolling window of Gemini calls. Returns false when the user is over the cap, in
    // which case the caller degrades instead of rejecting.
    private consumeWindowSlot(userId: string): boolean {
        const now = Date.now();
        const stamps = (this.window.get(userId) || []).filter((stamp) => now - stamp < DUPLICATE_WINDOW_MS);
        if (stamps.length >= DUPLICATE_MAX_PER_WINDOW) {
            this.window.set(userId, stamps);
            return false;
        }
        stamps.push(now);
        this.window.set(userId, stamps);

        // Bound memory the same way AiRateLimitGuard does: a hard reset is acceptable for
        // a soft guard, and unbounded growth in a long-lived instance is not.
        if (this.window.size > 1000) {
            this.window.clear();
        }
        return true;
    }
}

function emptyResult(tier: string, degradedReason: string | null): DuplicateCheckResult {
    return { matches: [], aiUsed: false, source: "local", degradedReason, meta: { model: null, tier } };
}

function localResult(
    candidates: ScoredCandidate[],
    details: Map<string, CandidateDetail>,
    userId: string,
    tier: string,
    degradedReason: string | null
): DuplicateCheckResult {
    const matches = toMatches(localOnlyMatches(candidates, DUPLICATE_LOCAL_ONLY_FLOOR), details, userId);
    return { matches, aiUsed: false, source: "local", degradedReason, meta: { model: null, tier } };
}

// Attach the catalog row to each judged match. A judged id with no row cannot happen
// (the ids come from the candidate set the rows were fetched for) but is dropped rather
// than rendered as a half-empty card.
function toMatches(judged: JudgedMatch[], details: Map<string, CandidateDetail>, userId: string): DuplicateMatch[] {
    const matches: DuplicateMatch[] = [];
    for (const match of judged) {
        const detail = details.get(match.id);
        if (!detail) {
            continue;
        }
        matches.push({
            id: detail.id,
            name: detail.name,
            primaryMuscleGroup: detail.primaryMuscleGroup,
            movementPattern: detail.movementPattern,
            equipment: detail.equipment,
            description: detail.description,
            aliases: detail.aliases,
            mediaUrl: detail.mediaUrl,
            mediaType: detail.mediaType,
            status: detail.status,
            isCustom: detail.isCustom,
            isMine: detail.createdByUserId === userId,
            author: detail.author,
            createdAt: detail.createdAt.toISOString(),
            score: Math.round(match.score * 1000) / 1000,
            verdict: match.verdict,
            confidence: match.confidence,
            reason: match.reason
        });
    }
    return matches;
}

function buildPrompt(
    name: string,
    dto: ExerciseDuplicateCheckDto,
    candidates: ScoredCandidate[],
    details: Map<string, CandidateDetail>
): string {
    const candidatesForModel = candidates.map((candidate) => ({
        id: candidate.entry.id,
        name: candidate.entry.name,
        aliases: candidate.entry.aliases,
        muscle: candidate.entry.primaryMuscleGroup,
        equipment: candidate.entry.equipment,
        description: (details.get(candidate.entry.id)?.description || "").slice(0, DUPLICATE_MAX_DESCRIPTION_CHARS)
    }));
    const userExerciseForModel = {
        name,
        muscle: dto.primaryMuscleGroup || "",
        equipment: dto.equipment || "",
        aliases: Array.isArray(dto.aliases) ? dto.aliases.slice(0, 10).map((alias) => String(alias).slice(0, 80)) : [],
        description: (dto.description || "").slice(0, DUPLICATE_MAX_DESCRIPTION_CHARS)
    };
    return [
        `CANDIDATES (JSON):\n${JSON.stringify(candidatesForModel)}`,
        `USER_EXERCISE (JSON):\n${JSON.stringify(userExerciseForModel)}`
    ].join("\n\n");
}

function safeParse(text: string): unknown {
    if (!text) {
        return null;
    }
    const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    try {
        const parsed = JSON.parse(trimmed);
        // Arrays are objects in JS, so a bare top-level array would sail through and then
        // normalize to zero matches, which reads as "the judge said all different" and gets
        // logged as a success. It is a schema violation, so treat it as unparseable.
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch (error) {
        return null;
    }
}

// aliases is a Json column, so anything could be in there.
function toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? (value as unknown[]).map((item) => String(item)) : [];
}

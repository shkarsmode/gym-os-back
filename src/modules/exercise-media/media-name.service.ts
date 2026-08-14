import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AiUsageService } from "../ai/ai-usage.service";
import { GeminiService } from "../ai/gemini.service";
import {
    MEDIA_AI_OPERATION,
    MEDIA_NAME_CACHE_MAX,
    MEDIA_NAME_CACHE_TTL_MS,
    MEDIA_NAME_MAX_OUTPUT_TOKENS,
    MEDIA_NAME_MIN_CONFIDENCE,
    MEDIA_NAME_TEMPERATURE,
    MEDIA_NAME_TIMEOUT_MS,
    MEDIA_SUGGEST_AI_DAILY_LIMIT
} from "./media.constants";
import { TtlLruCache } from "./media-cache";
import { latinOnly, translateEquipment, translateMuscle, translateUkrainian } from "./media-lexicon";
import { MediaSuggestRequest, ResolvedName } from "./media.types";

// Names only. The schema deliberately has no URL-shaped field: the model is never given
// a slot it could put a link in, and anything link-shaped that appears anyway voids the
// whole result (see rejectIfUrlLike).
const MEDIA_NAME_SCHEMA = {
    type: "object",
    properties: {
        englishName: { type: "string" },
        aliases: { type: "array", items: { type: "string" } },
        equipment: { type: "string" },
        primaryMuscle: { type: "string" },
        confidence: { type: "number" }
    },
    required: ["englishName", "aliases"]
};

const SYSTEM = [
    "Ти нормалізуєш назви вправ у канонічну англійську термінологію тренажерного залу.",
    "Повертай ЛИШЕ назви. Ніколи не повертай посилань, доменів, назв файлів чи URL.",
    "englishName - найпоширеніша англійська назва цієї вправи.",
    "aliases - 2-4 інші поширені англійські написання тієї самої вправи.",
    "equipment / primaryMuscle - англійською, одним-двома словами.",
    "confidence - 0..1, наскільки ти впевнений, що це реальна відома вправа."
].join(" ");

const URL_LIKE = /https?:\/\/|\.gif|\.jpe?g|\.png|\.webp|www\./i;

const nameCache = new TtlLruCache<ResolvedName>(MEDIA_NAME_CACHE_MAX, MEDIA_NAME_CACHE_TTL_MS);

@Injectable()
export class MediaNameService {
    private readonly logger = new Logger(MediaNameService.name);

    constructor(
        private readonly prisma: PrismaService,
        // Optional on purpose. AiModule has to export these for the happy path, but if
        // that export is ever dropped the feature must degrade to the deterministic
        // lexicon (rung 1) instead of refusing to boot.
        @Optional() @Inject(GeminiService) private readonly gemini: GeminiService | null,
        @Optional() @Inject(AiUsageService) private readonly usage: AiUsageService | null
    ) {}

    // Never throws. Every failure path lands on deterministicName(), which is why the
    // whole feature keeps working with no Gemini key at all.
    async resolve(userId: string | null, request: MediaSuggestRequest): Promise<ResolvedName> {
        const cacheKey = nameCacheKey(request);
        const cached = nameCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const fallback = this.deterministicName(request);

        if (!this.gemini || !this.gemini.isConfigured()) {
            return this.remember(cacheKey, { ...fallback, degraded: "ai_unavailable" });
        }
        if (userId && (await this.overDailyCap(userId))) {
            return this.remember(cacheKey, { ...fallback, degraded: "ai_quota" });
        }

        const startedAt = Date.now();
        try {
            const result = await this.gemini.generateStructured({
                prompt: JSON.stringify({
                    name: request.name,
                    aliases: request.aliases,
                    primaryMuscleGroup: request.primaryMuscleGroup,
                    equipment: request.equipment,
                    movementPattern: request.movementPattern
                }),
                systemInstruction: SYSTEM,
                schema: MEDIA_NAME_SCHEMA,
                temperature: MEDIA_NAME_TEMPERATURE,
                maxOutputTokens: MEDIA_NAME_MAX_OUTPUT_TOKENS,
                timeoutMs: MEDIA_NAME_TIMEOUT_MS
            });

            const parsed = parseAiName(result.text);
            if (!parsed) {
                void this.log(userId, "error", result.model, Date.now() - startedAt, "INVALID_RESPONSE");
                return this.remember(cacheKey, { ...fallback, degraded: "ai_unavailable" });
            }

            void this.log(userId, "success", result.model, Date.now() - startedAt, null, result);

            // Keep the deterministic aliases alongside the model's. They cost nothing and
            // they are the ones that carry the equipment/movement decomposition the index
            // slugs are actually built from.
            const aliases = dedupe([...parsed.aliases, ...fallback.aliases]).slice(0, 8);

            return this.remember(cacheKey, {
                englishName: parsed.englishName,
                aliases,
                equipment: parsed.equipment || fallback.equipment,
                primaryMuscle: parsed.primaryMuscle || fallback.primaryMuscle,
                confidence: parsed.confidence,
                aiUsed: true,
                aiModel: result.model,
                lowConfidence: parsed.confidence < MEDIA_NAME_MIN_CONFIDENCE,
                degraded: null
            });
        } catch (error) {
            const code = String((error as { code?: string })?.code || "GEMINI_ERROR");
            void this.log(userId, "error", this.gemini.getModel(), Date.now() - startedAt, code);
            this.logger.warn(`media naming fell back to the lexicon: ${code}`);
            return this.remember(cacheKey, { ...fallback, degraded: "ai_unavailable" });
        }
    }

    // Rung 1. Lexicon-translated Ukrainian, plus every Latin fragment the user already
    // typed, which in practice is the alias field and is very often already the exact
    // English name.
    deterministicName(request: MediaSuggestRequest): ResolvedName {
        const matches = translateUkrainian(request.name);
        const latinFromName = latinOnly(request.name);
        const latinFromAliases = (request.aliases || []).map(latinOnly).filter(Boolean);

        const equipment = translateEquipment(request.equipment || "");
        const muscle = translateMuscle(request.primaryMuscleGroup || "");

        const translated = dedupe(matches.map((match) => match.en)).join(" ").trim();
        const englishName = translated || latinFromName || latinFromAliases[0] || request.name;

        // Two derived aliases: the bare movement, and movement plus equipment. The site
        // names its canonical entries both ways ("squat" but "dumbbell-press"), so
        // scoring both is what turns a near miss into an exact slug hit.
        const movement = dedupe(matches.filter((match) => match.kind === "movement").map((match) => match.en)).join(" ").trim();
        const movementAndEquipment = dedupe(
            matches.filter((match) => match.kind === "movement" || match.kind === "equipment").map((match) => match.en)
        ).join(" ").trim();

        const aliases = dedupe([
            ...latinFromAliases,
            latinFromName,
            movementAndEquipment,
            movement,
            [equipment, movement].filter(Boolean).join(" ").trim()
        ].filter((alias) => Boolean(alias) && alias !== englishName)).slice(0, 8);

        return {
            englishName,
            aliases,
            equipment,
            primaryMuscle: muscle,
            confidence: translated ? 0.6 : 0.4,
            aiUsed: false,
            aiModel: null,
            lowConfidence: false,
            degraded: null
        };
    }

    // Counted here rather than in AiUsageService so this feature owns its own budget and
    // cannot be confused with the parse or coach quotas.
    private async overDailyCap(userId: string): Promise<boolean> {
        try {
            const used = await this.prisma.aiUsageLog.count({
                where: {
                    userId,
                    operation: MEDIA_AI_OPERATION,
                    status: "success",
                    createdAt: { gte: startOfToday() }
                }
            });
            return used >= MEDIA_SUGGEST_AI_DAILY_LIMIT;
        } catch {
            // A missing table or a DB hiccup must not block a legitimate request.
            return false;
        }
    }

    private async log(
        userId: string | null,
        status: "success" | "error",
        model: string,
        durationMs: number,
        errorCode: string | null,
        result?: { usage: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null } }
    ): Promise<void> {
        if (!this.usage) {
            return;
        }
        await this.usage.log({
            userId,
            operation: MEDIA_AI_OPERATION,
            model,
            status,
            errorCode,
            durationMs,
            inputTokens: result?.usage.inputTokens ?? null,
            outputTokens: result?.usage.outputTokens ?? null,
            totalTokens: result?.usage.totalTokens ?? null
        });
    }

    private remember(key: string, resolved: ResolvedName): ResolvedName {
        nameCache.set(key, resolved);
        return resolved;
    }
}

interface ParsedAiName {
    englishName: string;
    aliases: string[];
    equipment: string;
    primaryMuscle: string;
    confidence: number;
}

// Gate A of the hallucination guard. If any string anywhere in the model's answer looks
// like a link or a filename, the entire result is discarded - not sanitized, discarded -
// because a model that ignored "never return URLs" cannot be trusted on the names either.
export function parseAiName(text: string): ParsedAiName | null {
    let payload: unknown;
    try {
        payload = JSON.parse(String(text || "").trim());
    } catch {
        return null;
    }
    if (!payload || typeof payload !== "object") {
        return null;
    }
    if (containsUrlLike(payload)) {
        return null;
    }

    const record = payload as Record<string, unknown>;
    const englishName = typeof record.englishName === "string" ? record.englishName.trim() : "";
    if (!englishName) {
        return null;
    }

    const aliases = Array.isArray(record.aliases)
        ? record.aliases.filter((alias): alias is string => typeof alias === "string").map((alias) => alias.trim()).filter(Boolean).slice(0, 6)
        : [];
    const confidence = Number(record.confidence);

    return {
        englishName,
        aliases,
        equipment: typeof record.equipment === "string" ? record.equipment.trim() : "",
        primaryMuscle: typeof record.primaryMuscle === "string" ? record.primaryMuscle.trim() : "",
        confidence: Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0.5
    };
}

function containsUrlLike(value: unknown): boolean {
    if (typeof value === "string") {
        return URL_LIKE.test(value);
    }
    if (Array.isArray(value)) {
        return value.some(containsUrlLike);
    }
    if (value && typeof value === "object") {
        return Object.values(value as Record<string, unknown>).some(containsUrlLike);
    }
    return false;
}

function dedupe(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const key = value.trim().toLowerCase();
        if (!key || seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(value.trim());
    }
    return result;
}

export function nameCacheKey(request: MediaSuggestRequest): string {
    return [
        request.name,
        (request.aliases || []).join("|"),
        request.equipment || "",
        request.primaryMuscleGroup || "",
        request.movementPattern || ""
    ]
        .join("::")
        .trim()
        .toLowerCase();
}

function startOfToday(): Date {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
}

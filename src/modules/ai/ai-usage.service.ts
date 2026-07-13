import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { aiModel, GEMINI_FREE_TIER_LIMITS, GEMINI_LIMITS_SOURCE_URL, GEMINI_QUOTA_DASHBOARD_URL } from "./ai.constants";
import { GeminiService } from "./gemini.service";

export interface AiUsageEntry {
    userId: string | null;
    operation: string;
    model: string;
    status: "success" | "error";
    errorCode?: string | null;
    errorMessage?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
    cachedTokens?: number | null;
    thoughtsTokens?: number | null;
    durationMs?: number | null;
    inputLength?: number | null;
    recognizedExercises?: number | null;
    warningsCount?: number | null;
}

type Period = "today" | "7d" | "30d" | "all";

export interface StatisticsQuery {
    period?: Period;
    status?: "success" | "error" | "all";
    model?: string;
    userId?: string;
}

@Injectable()
export class AiUsageService implements OnModuleInit {
    private readonly logger = new Logger(AiUsageService.name);
    private tableReady = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly gemini: GeminiService
    ) {}

    async onModuleInit() {
        await this.ensureTable();
    }

    // Neon's pooled connection can't run `prisma db push` DDL, so create the table
    // idempotently here (mirrors ExercisesService.ensureReactionTable). Best-effort — the
    // logging path already degrades gracefully if this fails.
    async ensureTable() {
        if (this.tableReady) {
            return;
        }
        try {
            await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AiUsageLog" (
                "id" TEXT NOT NULL,
                "userId" TEXT,
                "operation" TEXT NOT NULL,
                "model" TEXT NOT NULL,
                "status" TEXT NOT NULL,
                "errorCode" TEXT,
                "errorMessage" TEXT,
                "inputTokens" INTEGER,
                "outputTokens" INTEGER,
                "totalTokens" INTEGER,
                "cachedTokens" INTEGER,
                "thoughtsTokens" INTEGER,
                "durationMs" INTEGER,
                "inputLength" INTEGER,
                "recognizedExercises" INTEGER,
                "warningsCount" INTEGER,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
            )`);
            await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AiUsageLog_createdAt_idx" ON "AiUsageLog" ("createdAt")`);
            await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AiUsageLog_userId_idx" ON "AiUsageLog" ("userId")`);
            await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AiUsageLog_status_idx" ON "AiUsageLog" ("status")`);
            this.tableReady = true;
        } catch (error) {
            this.logger.warn(`ensureTable failed: ${(error as Error).message}`);
        }
    }

    // Fire-and-forget audit write. Never throws into the request path — a logging failure
    // must not fail the user's AI request.
    async log(entry: AiUsageEntry): Promise<void> {
        try {
            await this.ensureTable();
            await this.prisma.aiUsageLog.create({
                data: {
                    userId: entry.userId ?? null,
                    operation: entry.operation,
                    model: entry.model,
                    status: entry.status,
                    errorCode: entry.errorCode ?? null,
                    errorMessage: entry.errorMessage ? entry.errorMessage.slice(0, 300) : null,
                    inputTokens: entry.inputTokens ?? null,
                    outputTokens: entry.outputTokens ?? null,
                    totalTokens: entry.totalTokens ?? null,
                    cachedTokens: entry.cachedTokens ?? null,
                    thoughtsTokens: entry.thoughtsTokens ?? null,
                    durationMs: entry.durationMs ?? null,
                    inputLength: entry.inputLength ?? null,
                    recognizedExercises: entry.recognizedExercises ?? null,
                    warningsCount: entry.warningsCount ?? null
                }
            });
        } catch (error) {
            this.logger.warn(`Failed to write AiUsageLog: ${(error as Error).message}`);
        }
    }

    async summary(query: StatisticsQuery) {
        await this.ensureTable();
        const period = query.period || "30d";
        const [today, last7Days, last30Days, total] = await Promise.all([
            this.prisma.aiUsageLog.count({ where: { createdAt: { gte: startOfToday() } } }),
            this.prisma.aiUsageLog.count({ where: { createdAt: { gte: daysAgo(7) } } }),
            this.prisma.aiUsageLog.count({ where: { createdAt: { gte: daysAgo(30) } } }),
            this.prisma.aiUsageLog.count()
        ]);

        const where = this.buildWhere({ ...query, status: "all" });
        const rows = await this.prisma.aiUsageLog.findMany({
            where,
            select: { status: true, model: true, inputTokens: true, outputTokens: true, totalTokens: true, cachedTokens: true, thoughtsTokens: true, durationMs: true }
        });

        const success = rows.filter((row) => row.status === "success").length;
        const errors = rows.length - success;
        const modelMap = new Map<string, { requests: number; totalTokens: number }>();
        let inputTokens = 0;
        let outputTokens = 0;
        let totalTokens = 0;
        let cachedTokens = 0;
        let thoughtsTokens = 0;
        let latencySum = 0;
        let latencyCount = 0;
        let maxLatencyMs = 0;

        for (const row of rows) {
            inputTokens += row.inputTokens || 0;
            outputTokens += row.outputTokens || 0;
            totalTokens += row.totalTokens || 0;
            cachedTokens += row.cachedTokens || 0;
            thoughtsTokens += row.thoughtsTokens || 0;
            if (typeof row.durationMs === "number") {
                latencySum += row.durationMs;
                latencyCount += 1;
                maxLatencyMs = Math.max(maxLatencyMs, row.durationMs);
            }
            const bucket = modelMap.get(row.model) || { requests: 0, totalTokens: 0 };
            bucket.requests += 1;
            bucket.totalTokens += row.totalTokens || 0;
            modelMap.set(row.model, bucket);
        }

        return {
            counts: { today, last7Days, last30Days, total },
            period: {
                key: period,
                requests: rows.length,
                success,
                errors,
                successRate: rows.length ? Math.round((success / rows.length) * 1000) / 10 : 0,
                inputTokens,
                outputTokens,
                totalTokens,
                cachedTokens,
                thoughtsTokens,
                avgLatencyMs: latencyCount ? Math.round(latencySum / latencyCount) : 0,
                maxLatencyMs
            },
            models: [...modelMap.entries()]
                .map(([model, value]) => ({ model, requests: value.requests, totalTokens: value.totalTokens }))
                .sort((a, b) => b.requests - a.requests)
        };
    }

    // Daily token/request buckets for the chart. "all" is capped to the last 30 days so
    // the chart stays readable.
    async usage(query: StatisticsQuery) {
        await this.ensureTable();
        const from = periodStart(query.period || "30d") || daysAgo(30);
        const rows = await this.prisma.aiUsageLog.findMany({
            where: { ...this.buildWhere(query), createdAt: { gte: from } },
            select: { createdAt: true, inputTokens: true, outputTokens: true, totalTokens: true },
            orderBy: { createdAt: "asc" }
        });

        const buckets = new Map<string, { requests: number; inputTokens: number; outputTokens: number; totalTokens: number }>();
        for (const row of rows) {
            const day = dateKey(row.createdAt);
            const bucket = buckets.get(day) || { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
            bucket.requests += 1;
            bucket.inputTokens += row.inputTokens || 0;
            bucket.outputTokens += row.outputTokens || 0;
            bucket.totalTokens += row.totalTokens || 0;
            buckets.set(day, bucket);
        }

        return { days: [...buckets.entries()].map(([date, value]) => ({ date, ...value })) };
    }

    async requests(query: StatisticsQuery) {
        await this.ensureTable();
        const rows = await this.prisma.aiUsageLog.findMany({
            where: this.buildWhere(query),
            orderBy: { createdAt: "desc" },
            take: 50
        });

        const userIds = [...new Set(rows.map((row) => row.userId).filter((value): value is string => Boolean(value)))];
        const users = userIds.length
            ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true, email: true } })
            : [];
        const userMap = new Map(users.map((user) => [user.id, user]));

        return {
            requests: rows.map((row) => ({
                id: row.id,
                createdAt: row.createdAt.toISOString(),
                userId: row.userId,
                userName: row.userId ? userMap.get(row.userId)?.displayName || "—" : "—",
                userEmail: row.userId ? userMap.get(row.userId)?.email || "" : "",
                operation: row.operation,
                model: row.model,
                status: row.status,
                errorCode: row.errorCode,
                totalTokens: row.totalTokens,
                inputTokens: row.inputTokens,
                outputTokens: row.outputTokens,
                durationMs: row.durationMs,
                inputLength: row.inputLength,
                recognizedExercises: row.recognizedExercises,
                warningsCount: row.warningsCount
            }))
        };
    }

    // Official documented model limits + real GymOS usage. Deliberately does NOT invent a
    // "remaining requests" figure — the free-tier API exposes no live quota read, so we
    // separate the official limit, the actual usage, and a usage-vs-limit estimate.
    async limits() {
        await this.ensureTable();
        const model = aiModel();
        const official = GEMINI_FREE_TIER_LIMITS[model] || null;
        const [requestsToday, tokensTodayAgg] = await Promise.all([
            this.prisma.aiUsageLog.count({ where: { createdAt: { gte: startOfToday() }, status: "success" } }),
            this.prisma.aiUsageLog.aggregate({ where: { createdAt: { gte: startOfToday() } }, _sum: { totalTokens: true } })
        ]);

        return {
            model,
            configured: this.gemini.isConfigured(),
            official,
            allModels: GEMINI_FREE_TIER_LIMITS,
            usage: {
                requestsToday,
                totalTokensToday: tokensTodayAgg._sum.totalTokens || 0
            },
            estimate: official
                ? {
                      dailyRequestLimit: official.rpd,
                      requestsToday,
                      usagePercent: Math.min(100, Math.round((requestsToday / official.rpd) * 1000) / 10)
                  }
                : null,
            sources: {
                limitsDoc: GEMINI_LIMITS_SOURCE_URL,
                quotaDashboard: GEMINI_QUOTA_DASHBOARD_URL
            },
            note: "Офіційні ліміти моделі та фактичне використання в GymOS. Це не залишок квоти в реальному часі — перевіряй актуальний ліміт проєкту в Google AI Studio."
        };
    }

    private buildWhere(query: StatisticsQuery) {
        const where: Record<string, unknown> = {};
        const from = periodStart(query.period || "all");
        if (from) {
            where.createdAt = { gte: from };
        }
        if (query.status && query.status !== "all") {
            where.status = query.status;
        }
        if (query.model) {
            where.model = query.model;
        }
        if (query.userId) {
            where.userId = query.userId;
        }
        return where;
    }
}

function startOfToday(): Date {
    return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function daysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function periodStart(period: Period): Date | null {
    if (period === "today") {
        return startOfToday();
    }
    if (period === "7d") {
        return daysAgo(7);
    }
    if (period === "30d") {
        return daysAgo(30);
    }
    return null;
}

function dateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

import { ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { QuotaTier } from "./admin";

type WorkoutWindow = "prev" | "current" | "next";

// Per-tier workout limits (admins are unlimited). `weeks` maps the allowed Monday–Sunday
// windows (relative to the server "now") to the max workouts in that window; a window not
// present is not addable at all:
//   free    — current week only, 1/day, 2/week
//   premium — previous/current/next week, 2/day, 5 / 6 / 5 per week
const WORKOUT_LIMITS: Record<Exclude<QuotaTier, "admin">, { perDay: number; weeks: Partial<Record<WorkoutWindow, number>> }> = {
    free: { perDay: 1, weeks: { current: 2 } },
    premium: { perDay: 2, weeks: { prev: 5, current: 6, next: 5 } }
};

function startOfWeek(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay() || 7;
    result.setHours(0, 0, 0, 0);
    result.setDate(result.getDate() - day + 1);
    return result;
}

function windowOf(date: Date, now: Date): WorkoutWindow | "out" {
    const diffWeeks = Math.round((startOfWeek(date).getTime() - startOfWeek(now).getTime()) / (7 * 86400000));
    if (diffWeeks === 0) {
        return "current";
    }
    if (diffWeeks === -1) {
        return "prev";
    }
    if (diffWeeks === 1) {
        return "next";
    }
    return "out";
}

export async function assertWorkoutQuota(prisma: PrismaService, userId: string, date: Date, tier: QuotaTier = "free") {
    if (tier === "admin") {
        return;
    }
    const limits = WORKOUT_LIMITS[tier] || WORKOUT_LIMITS.free;
    const now = new Date();
    const window = windowOf(date, now);
    const weekCap = window === "out" ? undefined : limits.weeks[window];
    if (weekCap === undefined) {
        throw new ForbiddenException({
            code: "WORKOUT_LIMIT",
            scope: "window",
            message: tier === "premium"
                ? "Тариф PRO: тренування можна додавати лише за минулий, поточний і наступний тиждень."
                : "Безкоштовний тариф: тренування можна додавати лише в межах поточного тижня."
        });
    }

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const weekStart = startOfWeek(date);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const [dayCount, weekCount] = await Promise.all([
        prisma.workout.count({ where: { userId, date: { gte: dayStart, lt: dayEnd } } }),
        prisma.workout.count({ where: { userId, date: { gte: weekStart, lt: weekEnd } } })
    ]);

    if (dayCount >= limits.perDay) {
        throw new ForbiddenException({
            code: "WORKOUT_LIMIT",
            scope: "day",
            message: tier === "premium"
                ? "Тариф PRO: до 2 тренувань на день."
                : "Денний ліміт безкоштовного тарифу: 1 тренування на день."
        });
    }
    if (weekCount >= weekCap) {
        throw new ForbiddenException({
            code: "WORKOUT_LIMIT",
            scope: "week",
            message: tier === "premium"
                ? `Тариф PRO: ліміт на цей тиждень — ${weekCap} тренувань.`
                : "Тижневий ліміт безкоштовного тарифу: 2 тренування на тиждень."
        });
    }
}

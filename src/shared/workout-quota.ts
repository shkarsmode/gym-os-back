import { ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { QuotaTier } from "./admin";

// Per-tier workout limits (admins are unlimited):
//   free    — 1 workout/day, 2/week
//   premium — 2 workouts/day (no weekly cap)
// Boundaries are computed on the server against the date-only workout date.
export async function assertWorkoutQuota(prisma: PrismaService, userId: string, date: Date, tier: QuotaTier = "free") {
    if (tier === "admin") {
        return;
    }
    const perDay = tier === "premium" ? 2 : 1;

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const startOfWeek = new Date(startOfDay);
    const mondayOffset = (startOfWeek.getDay() + 6) % 7;
    startOfWeek.setDate(startOfWeek.getDate() - mondayOffset);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const [dayCount, weekCount] = await Promise.all([
        prisma.workout.count({ where: { userId, date: { gte: startOfDay, lt: endOfDay } } }),
        prisma.workout.count({ where: { userId, date: { gte: startOfWeek, lt: endOfWeek } } })
    ]);

    if (dayCount >= perDay) {
        throw new ForbiddenException({
            code: "WORKOUT_LIMIT",
            scope: "day",
            message: tier === "premium"
                ? "Тариф PRO: до 2 тренувань на день."
                : "Денний ліміт безкоштовного тарифу: 1 тренування на день."
        });
    }
    // Weekly cap is a free-tier guard only.
    if (tier === "free" && weekCount >= 2) {
        throw new ForbiddenException({
            code: "WORKOUT_LIMIT",
            scope: "week",
            message: "Тижневий ліміт безкоштовного тарифу: 2 тренування на тиждень."
        });
    }
}

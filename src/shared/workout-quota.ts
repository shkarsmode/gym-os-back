import { ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

// Free tier: max 1 workout per day and 2 per ISO week. Admins skip this entirely.
// Boundaries are computed on the server (UTC) against the date-only workout date.
export async function assertWorkoutQuota(prisma: PrismaService, userId: string, date: Date) {
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

    if (dayCount >= 1) {
        throw new ForbiddenException({
            code: "WORKOUT_LIMIT",
            scope: "day",
            message: "Денний ліміт безкоштовного тарифу: 1 тренування на день."
        });
    }
    if (weekCount >= 2) {
        throw new ForbiddenException({
            code: "WORKOUT_LIMIT",
            scope: "week",
            message: "Тижневий ліміт безкоштовного тарифу: 2 тренування на тиждень."
        });
    }
}

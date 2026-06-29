import { ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { QuotaTier } from "./admin";

// Per-tier custom-exercise limits (admins are unlimited):
//   free    — 1 new custom exercise per calendar month
//   premium — up to 30 custom exercises total
export async function assertExerciseQuota(prisma: PrismaService, userId: string, tier: QuotaTier = "free") {
    if (tier === "admin") {
        return;
    }

    if (tier === "premium") {
        const total = await prisma.exercise.count({ where: { createdByUserId: userId, isCustom: true } });
        if (total >= 30) {
            throw new ForbiddenException({
                code: "EXERCISE_LIMIT",
                scope: "total",
                message: "Тариф PRO: до 30 власних вправ. Видали непотрібні, щоб додати нові."
            });
        }
        return;
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const count = await prisma.exercise.count({
        where: { createdByUserId: userId, createdAt: { gte: startOfMonth } }
    });
    if (count >= 1) {
        throw new ForbiddenException({
            code: "EXERCISE_LIMIT",
            scope: "month",
            message: "Безкоштовний тариф: 1 власна вправа на місяць. Оформи PRO — до 30 вправ."
        });
    }
}

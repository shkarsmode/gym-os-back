import { ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

// Free tier: max 1 custom exercise per calendar month. Admins & premium are unlimited.
export async function assertExerciseQuota(prisma: PrismaService, userId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const count = await prisma.exercise.count({
        where: { createdByUserId: userId, createdAt: { gte: startOfMonth } }
    });
    if (count >= 1) {
        throw new ForbiddenException({
            code: "EXERCISE_LIMIT",
            scope: "month",
            message: "Безкоштовний тариф: 1 власна вправа на місяць. Оформи PRO для безлімітних вправ."
        });
    }
}

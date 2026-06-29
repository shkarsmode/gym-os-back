import { ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { QuotaTier } from "./admin";

// Per-tier feedback submissions per day (admins are unlimited):
//   free — 1/day, premium — 3/day. Best-effort: a missing table degrades to "no
//   limit" rather than blocking submission (the create itself stays defensive).
export async function assertFeedbackQuota(prisma: PrismaService, userId: string, tier: QuotaTier = "free") {
    if (tier === "admin") {
        return;
    }
    const perDay = tier === "premium" ? 3 : 1;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    let count = 0;
    try {
        count = await prisma.featureRequest.count({ where: { userId, createdAt: { gte: startOfDay } } });
    } catch (error) {
        return; // table not ready yet — don't block
    }

    if (count >= perDay) {
        throw new ForbiddenException({
            code: "FEEDBACK_LIMIT",
            scope: "day",
            message: tier === "premium"
                ? "Тариф PRO: до 3 запитів на день. Спробуй завтра."
                : "Ліміт: 1 запит на день. Оформи PRO — до 3 на день."
        });
    }
}

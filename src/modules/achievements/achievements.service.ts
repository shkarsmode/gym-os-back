import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class AchievementsService {
    constructor(private readonly prisma: PrismaService) {}

    async findMine(userId: string) {
        const achievements = await this.prisma.achievement.findMany({
            include: {
                userAchievements: {
                    where: { userId }
                }
            },
            orderBy: { category: "asc" }
        });

        return achievements.map((achievement) => ({
            ...achievement,
            progress: achievement.userAchievements[0]?.progress || 0,
            unlockedAt: achievement.userAchievements[0]?.unlockedAt || null
        }));
    }
}

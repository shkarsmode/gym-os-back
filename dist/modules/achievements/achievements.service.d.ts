import { PrismaService } from "../../prisma/prisma.service";
export declare class AchievementsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findMine(userId: string): Promise<{
        progress: number;
        unlockedAt: Date | null;
        userAchievements: {
            id: string;
            userId: string;
            createdAt: Date;
            updatedAt: Date;
            achievementId: string;
            progress: number;
            unlockedAt: Date | null;
        }[];
        id: string;
        createdAt: Date;
        title: string;
        category: string;
        description: string;
        key: string;
        target: number;
        metric: string;
    }[]>;
}

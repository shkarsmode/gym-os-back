import { RequestUser } from "../../shared/current-user.decorator";
import { AchievementsService } from "./achievements.service";
export declare class AchievementsController {
    private readonly achievementsService;
    constructor(achievementsService: AchievementsService);
    findMine(user: RequestUser): Promise<{
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

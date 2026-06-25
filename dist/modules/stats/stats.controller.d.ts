import { RequestUser } from "../../shared/current-user.decorator";
import { StatsService } from "./stats.service";
export declare class StatsController {
    private readonly statsService;
    constructor(statsService: StatsService);
    overview(user: RequestUser): Promise<{
        totalWorkouts: number;
        completedWorkouts: number;
        totalSets: number;
        workingSets: number;
        totalVolume: number;
        cardioMinutes: number;
        averageDurationMinutes: number;
    }>;
    userStats(userId: string): Promise<{
        totalWorkouts: number;
        completedWorkouts: number;
        totalSets: number;
        workingSets: number;
        totalVolume: number;
        cardioMinutes: number;
        averageDurationMinutes: number;
    }>;
}

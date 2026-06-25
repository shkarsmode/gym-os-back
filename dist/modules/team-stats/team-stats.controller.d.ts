import { TeamStatsService } from "./team-stats.service";
export declare class TeamStatsController {
    private readonly teamStatsService;
    constructor(teamStatsService: TeamStatsService);
    findTeamStats(): Promise<{
        totalWorkouts: number;
        completedWorkouts: number;
        totalVolume: number;
        cardioMinutes: number;
    }>;
}

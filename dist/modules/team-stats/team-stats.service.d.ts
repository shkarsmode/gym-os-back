import { PrismaService } from "../../prisma/prisma.service";
export declare class TeamStatsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    overview(): Promise<{
        totalWorkouts: number;
        completedWorkouts: number;
        totalVolume: number;
        cardioMinutes: number;
    }>;
}

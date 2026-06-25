import { PrismaService } from "../../prisma/prisma.service";
export declare class StatsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    userOverview(userId: string): Promise<{
        totalWorkouts: number;
        completedWorkouts: number;
        totalSets: number;
        workingSets: number;
        totalVolume: number;
        cardioMinutes: number;
        averageDurationMinutes: number;
    }>;
    private durationMinutes;
}

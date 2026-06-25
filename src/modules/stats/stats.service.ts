import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class StatsService {
    constructor(private readonly prisma: PrismaService) {}

    async userOverview(userId: string) {
        const workouts = await this.prisma.workout.findMany({
            where: { userId },
            include: { exercises: { include: { sets: true } }, cardioSessions: true }
        });
        const completed = workouts.filter((workout) => workout.status === "completed");
        const sets = completed.flatMap((workout) => workout.exercises.flatMap((exercise) => exercise.sets)).filter((set) => set.isCompleted);
        const totalVolume = sets.reduce((sum, set) => sum + Number(set.weight) * set.repetitions, 0);
        const cardioMinutes = workouts.reduce((sum, workout) => sum + workout.cardioSessions.reduce((sessionSum, session) => sessionSum + session.durationMinutes, 0), 0);
        const averageDurationMinutes = completed.length
            ? Math.round(completed.reduce((sum, workout) => sum + this.durationMinutes(workout.startedAt, workout.finishedAt), 0) / completed.length)
            : 0;

        return {
            totalWorkouts: workouts.length,
            completedWorkouts: completed.length,
            totalSets: sets.length,
            workingSets: sets.filter((set) => set.type !== "warmup").length,
            totalVolume,
            cardioMinutes,
            averageDurationMinutes
        };
    }

    private durationMinutes(startedAt: Date | null, finishedAt: Date | null) {
        if (!startedAt || !finishedAt) {
            return 0;
        }
        return Math.max(0, Math.round((finishedAt.getTime() - startedAt.getTime()) / 60000));
    }
}

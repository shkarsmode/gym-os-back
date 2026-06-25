import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class TeamStatsService {
    constructor(private readonly prisma: PrismaService) {}

    async overview() {
        const workouts = await this.prisma.workout.findMany({
            include: { exercises: { include: { sets: true } }, cardioSessions: true }
        });
        const completed = workouts.filter((workout) => workout.status === "completed");
        const totalVolume = completed.reduce((sum, workout) => sum + workout.exercises.reduce((exerciseSum, exercise) => exerciseSum + exercise.sets.filter((set) => set.isCompleted).reduce((setSum, set) => setSum + Number(set.weight) * set.repetitions, 0), 0), 0);
        const cardioMinutes = workouts.reduce((sum, workout) => sum + workout.cardioSessions.reduce((sessionSum, session) => sessionSum + session.durationMinutes, 0), 0);
        return {
            totalWorkouts: workouts.length,
            completedWorkouts: completed.length,
            totalVolume,
            cardioMinutes
        };
    }
}

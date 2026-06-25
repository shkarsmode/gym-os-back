import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class RankingsService {
    constructor(private readonly prisma: PrismaService) {}

    async findAll() {
        const users = await this.prisma.user.findMany({
            include: {
                profile: true,
                workouts: { include: { exercises: { include: { sets: true } }, cardioSessions: true } },
                personalRecords: { include: { exercise: true } }
            }
        });

        return users.map((user) => {
            const completedWorkouts = user.workouts.filter((workout) => workout.status === "completed").length;
            const totalVolume = user.workouts.reduce((sum, workout) => sum + workout.exercises.reduce((exerciseSum, exercise) => exerciseSum + exercise.sets.filter((set) => set.isCompleted).reduce((setSum, set) => setSum + Number(set.weight) * set.repetitions, 0), 0), 0);
            const bestLift = user.personalRecords.sort((left, right) => Number(right.value) - Number(left.value))[0] || null;
            return {
                user,
                completedWorkouts,
                totalVolume,
                bestLift,
                score: completedWorkouts * 25 + totalVolume / 500 + (bestLift ? Number(bestLift.value) * 3 : 0)
            };
        }).sort((left, right) => right.score - left.score);
    }
}

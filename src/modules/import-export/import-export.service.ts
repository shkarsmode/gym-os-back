import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ImportExportService {
    constructor(private readonly prisma: PrismaService) {}

    async export() {
        const [users, exercises, bodyweightEntries, workouts, strengthStandards, workoutTemplates, achievements] = await Promise.all([
            this.prisma.user.findMany({ include: { profile: true, oauthAccounts: true } }),
            this.prisma.exercise.findMany(),
            this.prisma.userBodyweightEntry.findMany(),
            this.prisma.workout.findMany({ include: { exercises: { include: { sets: true } }, cardioSessions: true } }),
            this.prisma.strengthStandard.findMany(),
            this.prisma.workoutTemplate.findMany({ include: { exercises: true } }),
            this.prisma.achievement.findMany()
        ]);

        return {
            version: 1,
            users,
            exercises,
            bodyweightEntries,
            workouts,
            strengthStandards,
            workoutTemplates,
            achievements,
            exportedAt: new Date().toISOString()
        };
    }

    async import(payload: any) {
        return {
            ok: true,
            received: {
                users: Array.isArray(payload?.users) ? payload.users.length : 0,
                exercises: Array.isArray(payload?.exercises) ? payload.exercises.length : 0,
                workouts: Array.isArray(payload?.workouts) ? payload.workouts.length : 0
            },
            note: "Import validation skeleton is ready; production imports should map frontend demo IDs to Prisma IDs in a transaction."
        };
    }
}

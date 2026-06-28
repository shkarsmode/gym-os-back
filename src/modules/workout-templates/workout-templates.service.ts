import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { assertWorkoutQuota } from "../../shared/workout-quota";

@Injectable()
export class WorkoutTemplatesService {
    constructor(private readonly prisma: PrismaService) {}

    findAll() {
        return this.prisma.workoutTemplate.findMany({
            where: { isPublic: true },
            include: { exercises: { include: { exercise: true }, orderBy: { order: "asc" } } },
            orderBy: { title: "asc" }
        });
    }

    async createWorkout(userId: string, templateId: string, unlimited = false) {
        const template = await this.prisma.workoutTemplate.findUnique({
            where: { id: templateId },
            include: { exercises: { orderBy: { order: "asc" } } }
        });
        if (!template) {
            throw new NotFoundException("Workout template not found");
        }
        if (!unlimited) {
            await assertWorkoutQuota(this.prisma, userId, new Date());
        }

        return this.prisma.workout.create({
            data: {
                userId,
                date: new Date(),
                title: template.title,
                status: "planned",
                workoutType: template.type,
                notes: "Created from workout template.",
                exercises: {
                    create: template.exercises.map((item) => ({
                        exerciseId: item.exerciseId,
                        order: item.order,
                        notes: item.notes,
                        sets: item.targetSets ? {
                            create: Array.from({ length: item.targetSets }, () => ({
                                type: "working",
                                weight: 0,
                                repetitions: item.targetReps || 8,
                                restSeconds: item.restSeconds || 90,
                                isCompleted: false
                            }))
                        } : undefined
                    }))
                }
            },
            include: {
                exercises: { include: { exercise: true, sets: true }, orderBy: { order: "asc" } },
                cardioSessions: true
            }
        });
    }
}

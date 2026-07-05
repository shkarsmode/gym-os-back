import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { assertWorkoutQuota } from "../../shared/workout-quota";
import { QuotaTier } from "../../shared/admin";
import { CreateWorkoutTemplateDto } from "./dto/create-template.dto";

const MAX_TEMPLATES_PER_USER = 20;

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

    findMine(userId: string) {
        return this.prisma.workoutTemplate.findMany({
            where: { userId },
            include: { exercises: { include: { exercise: true }, orderBy: { order: "asc" } } },
            orderBy: { createdAt: "desc" }
        });
    }

    async createOwn(userId: string, dto: CreateWorkoutTemplateDto) {
        const count = await this.prisma.workoutTemplate.count({ where: { userId } });
        if (count >= MAX_TEMPLATES_PER_USER) {
            throw new ForbiddenException({
                code: "TEMPLATE_LIMIT",
                message: `Ліміт шаблонів: до ${MAX_TEMPLATES_PER_USER} власних шаблонів.`
            });
        }
        return this.prisma.workoutTemplate.create({
            data: {
                userId,
                title: dto.title,
                description: dto.description,
                type: dto.type,
                isPublic: false,
                exercises: {
                    create: dto.exercises.map((item) => ({
                        exerciseId: item.exerciseId,
                        order: item.order,
                        targetSets: item.targetSets,
                        targetReps: item.targetReps,
                        restSeconds: item.restSeconds,
                        notes: item.notes
                    }))
                }
            },
            include: { exercises: { include: { exercise: true }, orderBy: { order: "asc" } } }
        });
    }

    async deleteOwn(userId: string, id: string) {
        const template = await this.prisma.workoutTemplate.findUnique({ where: { id }, select: { userId: true } });
        if (!template) {
            throw new NotFoundException("Workout template not found");
        }
        if (template.userId !== userId) {
            throw new ForbiddenException("Cannot delete another user's template");
        }
        await this.prisma.workoutTemplate.delete({ where: { id } });
        return { ok: true, id };
    }

    async createWorkout(userId: string, templateId: string, tier: QuotaTier = "free") {
        const template = await this.prisma.workoutTemplate.findUnique({
            where: { id: templateId },
            include: { exercises: { orderBy: { order: "asc" } } }
        });
        if (!template) {
            throw new NotFoundException("Workout template not found");
        }
        await assertWorkoutQuota(this.prisma, userId, new Date(), tier);

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

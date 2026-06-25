import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { WorkoutStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { parseDateInput } from "../../shared/parse-date";
import { AddWorkoutExerciseDto, CreateCardioSessionDto, CreateWorkoutDto, CreateWorkoutSetDto, UpdateCardioSessionDto, UpdateWorkoutDto, UpdateWorkoutExerciseDto, UpdateWorkoutSetDto } from "./dto/workout.dto";

@Injectable()
export class WorkoutsService {
    constructor(private readonly prisma: PrismaService) {}

    findAll(query: Record<string, string>) {
        return this.prisma.workout.findMany({
            where: {
                userId: query.userId,
                status: query.status as WorkoutStatus | undefined,
                workoutType: query.workoutType
            },
            include: this.includeWorkout(),
            orderBy: { date: "desc" }
        });
    }

    async findOne(id: string) {
        const workout = await this.prisma.workout.findUnique({
            where: { id },
            include: this.includeWorkout()
        });
        if (!workout) {
            throw new NotFoundException("Workout not found");
        }
        return workout;
    }

    create(userId: string, dto: CreateWorkoutDto) {
        const now = new Date();
        return this.prisma.workout.create({
            data: {
                userId,
                date: parseDateInput(dto.date),
                title: dto.title,
                status: dto.status || "planned",
                workoutType: dto.workoutType,
                startedAt: dto.status === "active" ? now : undefined,
                finishedAt: dto.status === "completed" ? now : undefined,
                notes: dto.notes
            },
            include: this.includeWorkout()
        });
    }

    async update(userId: string, id: string, dto: UpdateWorkoutDto) {
        await this.assertOwner(userId, id);
        return this.prisma.workout.update({
            where: { id },
            data: {
                ...dto,
                date: dto.date ? parseDateInput(dto.date) : undefined
            },
            include: this.includeWorkout()
        });
    }

    async remove(userId: string, id: string) {
        await this.assertOwner(userId, id);
        await this.prisma.workout.delete({ where: { id } });
        return { ok: true };
    }

    async start(userId: string, id: string) {
        await this.assertOwner(userId, id);
        await this.prisma.workout.updateMany({
            where: { userId, status: "active", id: { not: id } },
            data: { status: "completed", finishedAt: new Date() }
        });
        return this.prisma.workout.update({
            where: { id },
            data: { status: "active", startedAt: new Date(), finishedAt: null },
            include: this.includeWorkout()
        });
    }

    async finish(userId: string, id: string) {
        await this.assertOwner(userId, id);
        return this.prisma.workout.update({
            where: { id },
            data: { status: "completed", finishedAt: new Date() },
            include: this.includeWorkout()
        });
    }

    async addExercise(userId: string, workoutId: string, dto: AddWorkoutExerciseDto) {
        await this.assertOwner(userId, workoutId);
        const order = dto.order || await this.nextExerciseOrder(workoutId);
        return this.prisma.workoutExercise.create({
            data: {
                workoutId,
                exerciseId: dto.exerciseId,
                order,
                notes: dto.notes
            },
            include: { exercise: true, sets: true }
        });
    }

    async updateExercise(userId: string, workoutId: string, workoutExerciseId: string, dto: UpdateWorkoutExerciseDto) {
        await this.assertWorkoutExerciseOwner(userId, workoutId, workoutExerciseId);
        return this.prisma.workoutExercise.update({ where: { id: workoutExerciseId }, data: dto });
    }

    async deleteExercise(userId: string, workoutId: string, workoutExerciseId: string) {
        await this.assertWorkoutExerciseOwner(userId, workoutId, workoutExerciseId);
        await this.prisma.workoutExercise.delete({ where: { id: workoutExerciseId } });
        return { ok: true };
    }

    async addSet(userId: string, workoutId: string, workoutExerciseId: string, dto: CreateWorkoutSetDto) {
        await this.assertWorkoutExerciseOwner(userId, workoutId, workoutExerciseId);
        return this.prisma.workoutSet.create({
            data: {
                workoutExerciseId,
                ...dto,
                restSeconds: dto.restSeconds ?? 90,
                isCompleted: dto.isCompleted ?? false
            }
        });
    }

    async updateSet(userId: string, workoutId: string, workoutExerciseId: string, setId: string, dto: UpdateWorkoutSetDto) {
        await this.assertWorkoutExerciseOwner(userId, workoutId, workoutExerciseId);
        return this.prisma.workoutSet.update({ where: { id: setId }, data: dto });
    }

    async deleteSet(userId: string, workoutId: string, workoutExerciseId: string, setId: string) {
        await this.assertWorkoutExerciseOwner(userId, workoutId, workoutExerciseId);
        await this.prisma.workoutSet.delete({ where: { id: setId } });
        return { ok: true };
    }

    async addCardio(userId: string, workoutId: string, dto: CreateCardioSessionDto) {
        await this.assertOwner(userId, workoutId);
        return this.prisma.cardioSession.create({ data: { workoutId, ...dto } });
    }

    async updateCardio(userId: string, workoutId: string, cardioId: string, dto: UpdateCardioSessionDto) {
        await this.assertOwner(userId, workoutId);
        return this.prisma.cardioSession.update({ where: { id: cardioId }, data: dto });
    }

    async deleteCardio(userId: string, workoutId: string, cardioId: string) {
        await this.assertOwner(userId, workoutId);
        await this.prisma.cardioSession.delete({ where: { id: cardioId } });
        return { ok: true };
    }

    private async assertOwner(userId: string, workoutId: string) {
        const workout = await this.prisma.workout.findUnique({ where: { id: workoutId } });
        if (!workout) {
            throw new NotFoundException("Workout not found");
        }
        if (workout.userId !== userId) {
            throw new ForbiddenException("Cannot edit another user's workout");
        }
        return workout;
    }

    private async assertWorkoutExerciseOwner(userId: string, workoutId: string, workoutExerciseId: string) {
        await this.assertOwner(userId, workoutId);
        const workoutExercise = await this.prisma.workoutExercise.findFirst({
            where: { id: workoutExerciseId, workoutId }
        });
        if (!workoutExercise) {
            throw new NotFoundException("Workout exercise not found");
        }
        return workoutExercise;
    }

    private async nextExerciseOrder(workoutId: string) {
        const last = await this.prisma.workoutExercise.findFirst({
            where: { workoutId },
            orderBy: { order: "desc" }
        });
        return (last?.order || 0) + 1;
    }

    private includeWorkout() {
        return {
            user: { include: { profile: true } },
            exercises: { include: { exercise: true, sets: true }, orderBy: { order: "asc" as const } },
            cardioSessions: true
        };
    }
}

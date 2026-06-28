import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { WorkoutSetType, WorkoutStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { parseDateInput } from "../../shared/parse-date";
import { assertWorkoutQuota as enforceWorkoutQuota } from "../../shared/workout-quota";
import { AddWorkoutExerciseDto, CreateCardioSessionDto, CreateWorkoutDto, CreateWorkoutSetDto, SaveWorkoutDto, UpdateCardioSessionDto, UpdateWorkoutDto, UpdateWorkoutExerciseDto, UpdateWorkoutSetDto } from "./dto/workout.dto";

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

    async create(userId: string, dto: CreateWorkoutDto, unlimited = false) {
        const date = parseDateInput(dto.date);
        if (!unlimited) {
            await enforceWorkoutQuota(this.prisma, userId, date);
        }
        const now = new Date();
        return this.prisma.workout.create({
            data: {
                userId,
                date,
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

    // Atomic full upsert of a single workout (scalars + nested exercises/sets/cardio).
    // Replaces the fragile "wipe-everything-then-reimport" save: a failure here rolls
    // back the whole transaction, so a single workout can never be left half-deleted.
    async saveFull(userId: string, id: string, dto: SaveWorkoutDto, isAdmin = false, unlimited = false) {
        const existing = await this.prisma.workout.findUnique({
            where: { id },
            select: { id: true, userId: true, startedAt: true, finishedAt: true }
        });
        if (existing && existing.userId !== userId && !isAdmin) {
            throw new ForbiddenException("Cannot edit another user's workout");
        }
        // When an admin edits someone else's workout, keep it owned by the original user.
        const ownerId = existing ? existing.userId : userId;

        // Free-tier quota only applies when CREATING a new workout (not on the many
        // autosaves of an existing one). Admins & premium are unlimited.
        if (!existing && !unlimited) {
            await enforceWorkoutQuota(this.prisma, userId, parseDateInput(dto.date));
        }

        const requestedExercises = dto.exercises || [];
        const exerciseIds = [...new Set(requestedExercises.map((item) => item.exerciseId).filter(Boolean))];
        const known = exerciseIds.length
            ? await this.prisma.exercise.findMany({ where: { id: { in: exerciseIds } }, select: { id: true } })
            : [];
        const knownIds = new Set(known.map((item) => item.id));
        const exercises = requestedExercises.filter((item) => knownIds.has(item.exerciseId));

        const timings = this.deriveTimings(dto.status, existing);
        const scalar = {
            date: parseDateInput(dto.date),
            title: dto.title || "Тренування",
            status: dto.status as WorkoutStatus,
            workoutType: dto.workoutType || "custom",
            notes: dto.notes ?? null,
            startedAt: timings.startedAt,
            finishedAt: timings.finishedAt
        };

        const exercisesCreate = exercises.map((exercise, index) => ({
            exerciseId: exercise.exerciseId,
            order: exercise.order ?? index + 1,
            notes: exercise.notes ?? null,
            sets: {
                create: (exercise.sets || []).map((set) => ({
                    type: (set.type || "working") as WorkoutSetType,
                    weight: Number(set.weight) || 0,
                    repetitions: Number(set.repetitions) || 0,
                    rpe: set.rpe === undefined || set.rpe === null ? null : Number(set.rpe),
                    restSeconds: set.restSeconds ?? 90,
                    isCompleted: Boolean(set.isCompleted),
                    notes: set.notes ?? null
                }))
            }
        }));
        const cardioCreate = (dto.cardioSessions || []).map((cardio) => ({
            type: cardio.type || "treadmill",
            durationMinutes: Number(cardio.durationMinutes) || 0,
            distance: cardio.distance === undefined || cardio.distance === null ? null : Number(cardio.distance),
            calories: cardio.calories === undefined || cardio.calories === null ? null : Number(cardio.calories),
            averageHeartRate: cardio.averageHeartRate === undefined || cardio.averageHeartRate === null ? null : Number(cardio.averageHeartRate),
            intensity: cardio.intensity ?? null,
            notes: cardio.notes ?? null
        }));

        // IMPORTANT: use the batch-array form of $transaction (not the interactive
        // callback). The production DB is behind a connection pooler in transaction
        // mode (Neon/pgbouncer), which does NOT support interactive transactions —
        // they hang and the serverless function times out (surfaces as a browser
        // "CORS error"). The array form runs as a single batched BEGIN..COMMIT.
        const operations: any[] = [];
        if (dto.status === "active") {
            operations.push(this.prisma.workout.updateMany({
                where: { userId: ownerId, status: "active", id: { not: id } },
                data: { status: "completed", finishedAt: new Date() }
            }));
        }
        if (existing) {
            operations.push(this.prisma.workoutSet.deleteMany({
                where: {
                    workoutExercise: {
                        workoutId: id
                    }
                }
            }));

            operations.push(this.prisma.workoutExercise.deleteMany({
                where: {
                    workoutId: id
                }
            }));

            operations.push(this.prisma.cardioSession.deleteMany({
                where: {
                    workoutId: id
                }
            }));

            operations.push(this.prisma.workout.update({
                where: {
                    id
                },
                data: {
                    ...scalar,
                    exercises: {
                        create: exercisesCreate
                    },
                    cardioSessions: {
                        create: cardioCreate
                    }
                }
            }));
        } else {
            operations.push(this.prisma.workout.create({
                data: { id, userId: ownerId, ...scalar, exercises: { create: exercisesCreate }, cardioSessions: { create: cardioCreate } }
            }));
        }

        await this.prisma.$transaction(operations);
        // Return a lightweight ack instead of a deep re-read: the client keeps its
        // own optimistic state and ignores the body, so the extra query just slows
        // the save down.
        return { ok: true, id, status: dto.status };
    }

    private deriveTimings(status: string, existing: { startedAt: Date | null; finishedAt: Date | null } | null) {
        const now = new Date();
        if (status === "active") {
            return { startedAt: existing?.startedAt ?? now, finishedAt: null };
        }
        if (status === "completed") {
            return { startedAt: existing?.startedAt ?? now, finishedAt: existing?.finishedAt ?? now };
        }
        return { startedAt: existing?.startedAt ?? null, finishedAt: null };
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

    async remove(userId: string, id: string, isAdmin = false) {
        await this.assertOwner(userId, id, isAdmin);
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

    private async assertOwner(userId: string, workoutId: string, isAdmin = false) {
        const workout = await this.prisma.workout.findUnique({ where: { id: workoutId } });
        if (!workout) {
            throw new NotFoundException("Workout not found");
        }
        if (workout.userId !== userId && !isAdmin) {
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

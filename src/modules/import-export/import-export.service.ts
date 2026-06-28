import { ForbiddenException, Injectable } from "@nestjs/common";
import { WorkoutSetType, WorkoutStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { RequestUser } from "../../shared/current-user.decorator";
import { isAdminUser } from "../../shared/admin";
import { duplicateKeys, normalizeExerciseCatalogPayload } from "./exercise-catalog-importer";

@Injectable()
export class ImportExportService {
    constructor(private readonly prisma: PrismaService) {}

    async export(user: RequestUser) {
        const requesterIsAdmin = isAdminUser(user);
        // strengthStandards intentionally not exported anymore — the demo standards
        // are dropped from the payload; the frontend links to real external
        // strength-standard references instead.
        const [users, exercises, bodyweightEntries, workouts] = await Promise.all([
            this.prisma.user.findMany({ include: { profile: true }, orderBy: { createdAt: "asc" } }),
            this.prisma.exercise.findMany({ orderBy: { name: "asc" } }),
            this.prisma.userBodyweightEntry.findMany({ orderBy: { date: "asc" } }),
            this.prisma.workout.findMany({
                include: {
                    exercises: { include: { sets: true }, orderBy: { order: "asc" } },
                    cardioSessions: true
                },
                orderBy: { date: "desc" }
            })
        ]);

        return {
            version: 3,
            currentUserId: user.id,
            users: users.map((item) => ({
                id: item.id,
                name: item.profile?.name || item.displayName,
                displayName: item.profile?.displayName || item.displayName,
                avatarInitials: initials(item.profile?.displayName || item.displayName),
                avatarColor: colorFor(item.id),
                avatarUrl: item.avatarUrl || "",
                email: requesterIsAdmin ? (item.email || "") : "",
                // Only admins (who run the approval queue) see real approval state;
                // for everyone else peers always read as approved so we don't leak
                // who is still pending.
                approved: requesterIsAdmin ? (item.approved ?? false) : true,
                height: item.profile?.height || 0,
                bodyweight: numberValue(item.profile?.bodyweight, 0),
                birthYear: 2000,
                gender: item.profile?.gender || "male",
                trainingGoal: item.profile?.trainingGoal || "Персональний прогрес",
                trainingExperience: item.profile?.trainingExperience || "Не вказано",
                favoriteMuscleGroup: item.profile?.favoriteMuscleGroup || "Все тіло",
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })),
            exercises: exercises.map((item) => ({
                id: item.id,
                name: item.name,
                aliases: item.aliases,
                primaryMuscleGroup: item.primaryMuscleGroup,
                secondaryMuscleGroups: item.secondaryMuscleGroups,
                movementPattern: item.movementPattern,
                equipment: item.equipment,
                category: item.category,
                difficulty: item.difficulty,
                description: item.description || "",
                techniqueSteps: item.techniqueSteps,
                commonMistakes: item.commonMistakes,
                safetyTips: item.safetyTips,
                mediaUrl: item.mediaUrl || "",
                mediaType: item.mediaType,
                sourceName: item.sourceName,
                sourceUrl: item.sourceUrl,
                originalName: item.originalName,
                licenseStatus: item.licenseStatus,
                mediaReferences: item.mediaReferences,
                isCustom: item.isCustom,
                status: item.status,
                createdByUserId: item.createdByUserId,
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })),
            bodyweightEntries: bodyweightEntries.map((item) => ({
                id: item.id,
                userId: item.userId,
                date: dateInput(item.date),
                bodyweight: numberValue(item.bodyweight, 0),
                notes: item.notes || ""
            })),
            workouts: workouts.map((item) => ({
                id: item.id,
                userId: item.userId,
                date: dateInput(item.date),
                title: item.title,
                status: item.status,
                workoutType: item.workoutType,
                startedAt: item.startedAt?.toISOString() || null,
                finishedAt: item.finishedAt?.toISOString() || null,
                notes: item.notes || "",
                exercises: item.exercises.map((exercise) => ({
                    id: exercise.id,
                    exerciseId: exercise.exerciseId,
                    order: exercise.order,
                    notes: exercise.notes || "",
                    sets: exercise.sets.map((set) => ({
                        id: set.id,
                        type: set.type,
                        weight: numberValue(set.weight, 0),
                        repetitions: set.repetitions,
                        rpe: numberValue(set.rpe, 0),
                        restSeconds: set.restSeconds,
                        isCompleted: set.isCompleted,
                        notes: set.notes || ""
                    }))
                })),
                cardioSessions: item.cardioSessions.map((session) => ({
                    id: session.id,
                    type: session.type,
                    durationMinutes: session.durationMinutes,
                    distance: numberValue(session.distance, 0),
                    calories: session.calories || 0,
                    averageHeartRate: session.averageHeartRate || 0,
                    intensity: session.intensity || "medium",
                    notes: session.notes || ""
                }))
            })),
            exportedAt: new Date().toISOString()
        };
    }

    async import(user: RequestUser, payload: any) {
        const workouts = Array.isArray(payload?.workouts) ? payload.workouts.filter((item: any) => item.userId === user.id) : [];
        const bodyweightEntries = Array.isArray(payload?.bodyweightEntries) ? payload.bodyweightEntries.filter((item: any) => item.userId === user.id) : [];
        const customExercises = Array.isArray(payload?.exercises) ? payload.exercises.filter((item: any) => item.isCustom && item.createdByUserId === user.id) : [];

        await this.prisma.$transaction(async (transaction) => {
            for (const exercise of customExercises) {
                await transaction.exercise.upsert({
                    where: { id: exercise.id },
                    update: exerciseData(exercise, user.id),
                    create: { id: exercise.id, slug: slugify(exercise.name), ...exerciseData(exercise, user.id) }
                });
            }

            await transaction.userBodyweightEntry.deleteMany({ where: { userId: user.id } });
            for (const entry of bodyweightEntries) {
                await transaction.userBodyweightEntry.create({
                    data: {
                        id: entry.id,
                        userId: user.id,
                        date: parseDate(entry.date),
                        bodyweight: Number(entry.bodyweight) || 0,
                        notes: entry.notes || null
                    }
                });
            }

            await transaction.workout.deleteMany({ where: { userId: user.id } });
            for (const workout of workouts) {
                await transaction.workout.create({
                    data: {
                        id: workout.id,
                        userId: user.id,
                        date: parseDate(workout.date),
                        title: workout.title || "Тренування",
                        status: (workout.status || "planned") as WorkoutStatus,
                        workoutType: workout.workoutType || "custom",
                        startedAt: workout.startedAt ? parseDate(workout.startedAt) : null,
                        finishedAt: workout.finishedAt ? parseDate(workout.finishedAt) : null,
                        notes: workout.notes || null,
                        exercises: {
                            create: (workout.exercises || []).map((exercise: any, index: number) => ({
                                id: exercise.id,
                                exerciseId: exercise.exerciseId,
                                order: exercise.order || index + 1,
                                notes: exercise.notes || null,
                                sets: {
                                    create: (exercise.sets || []).map((set: any) => ({
                                        id: set.id,
                                        type: (set.type || "working") as WorkoutSetType,
                                        weight: Number(set.weight) || 0,
                                        repetitions: Number(set.repetitions) || 0,
                                        rpe: Number(set.rpe) || null,
                                        restSeconds: Number(set.restSeconds) || 90,
                                        isCompleted: Boolean(set.isCompleted),
                                        notes: set.notes || null
                                    }))
                                }
                            }))
                        },
                        cardioSessions: {
                            create: (workout.cardioSessions || []).map((session: any) => ({
                                id: session.id,
                                type: session.type || "treadmill",
                                durationMinutes: Number(session.durationMinutes) || 0,
                                distance: Number(session.distance) || null,
                                calories: Number(session.calories) || null,
                                averageHeartRate: Number(session.averageHeartRate) || null,
                                intensity: session.intensity || null,
                                notes: session.notes || null
                            }))
                        }
                    }
                });
            }
        });

        return {
            ok: true,
            imported: {
                workouts: workouts.length,
                bodyweightEntries: bodyweightEntries.length,
                customExercises: customExercises.length
            }
        };
    }

    async startImport(user: RequestUser, payload: any) {
        const resources = readImportResources(payload?.resources);

        await this.prisma.$transaction(async (transaction) => {
            if (resources.includes("workouts")) {
                await transaction.workout.deleteMany({ where: { userId: user.id } });
            }

            if (resources.includes("bodyweightEntries")) {
                await transaction.userBodyweightEntry.deleteMany({ where: { userId: user.id } });
            }

            if (resources.includes("customExercises")) {
                await transaction.exercise.deleteMany({ where: { isCustom: true, createdByUserId: user.id } });
            }
        });

        return {
            ok: true,
            resources
        };
    }

    async importChunk(user: RequestUser, payload: any) {
        const resource = String(payload?.resource || "");
        const items = Array.isArray(payload?.items) ? payload.items : [];

        if (!["customExercises", "bodyweightEntries", "workouts"].includes(resource)) {
            return {
                ok: false,
                resource,
                imported: 0,
                message: "Unsupported import resource"
            };
        }

        const imported = await this.prisma.$transaction(async (transaction) => {
            if (resource === "customExercises") {
                const customExercises = items.filter((item: any) => item?.isCustom && item?.createdByUserId === user.id);
                await importCustomExercises(transaction, user.id, customExercises);
                return customExercises.length;
            }

            if (resource === "bodyweightEntries") {
                const bodyweightEntries = items.filter((item: any) => item?.userId === user.id);
                await importBodyweightEntries(transaction, user.id, bodyweightEntries);
                return bodyweightEntries.length;
            }

            const workouts = items.filter((item: any) => item?.userId === user.id);
            await importWorkouts(transaction, user.id, workouts);
            return workouts.length;
        });

        return {
            ok: true,
            resource,
            imported
        };
    }

    async finishImport(user: RequestUser, payload: any) {
        const [workouts, bodyweightEntries, customExercises] = await Promise.all([
            this.prisma.workout.count({ where: { userId: user.id } }),
            this.prisma.userBodyweightEntry.count({ where: { userId: user.id } }),
            this.prisma.exercise.count({ where: { isCustom: true, createdByUserId: user.id } })
        ]);

        return {
            ok: true,
            requested: payload || {},
            imported: {
                workouts,
                bodyweightEntries,
                customExercises
            }
        };
    }

    async importExercises(user: RequestUser, payload: unknown) {
        this.assertExerciseImportPermission(user);

        const existing = await this.prisma.exercise.findMany({
            select: { slug: true, originalName: true, sourceUrl: true }
        });
        const existingKeys = new Set(existing.flatMap((item) => duplicateKeys({
            slug: item.slug,
            originalName: item.originalName,
            sourceUrl: item.sourceUrl
        })));
        const result = normalizeExerciseCatalogPayload(payload, existingKeys);

        for (const exercise of result.exercises) {
            await this.prisma.exercise.create({ data: exercise as any });
        }

        return {
            ok: true,
            imported: result.exercises.length,
            skipped: result.skipped,
            source: "ExRx.net"
        };
    }

    private assertExerciseImportPermission(user: RequestUser) {
        const adminEmails = String(process.env.ADMIN_EMAILS || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
        const email = user.email.toLowerCase();
        if (adminEmails.includes(email) || email === "daniil@example.com" || user.id === "user-daniil") {
            return;
        }
        throw new ForbiddenException("Exercise catalog import requires admin or demo owner access");
    }
}

function exerciseData(exercise: any, userId: string) {
    return {
        name: exercise.name,
        aliases: exercise.aliases || [],
        primaryMuscleGroup: exercise.primaryMuscleGroup || "Все тіло",
        secondaryMuscleGroups: exercise.secondaryMuscleGroups || [],
        movementPattern: exercise.movementPattern || "Ізоляція",
        equipment: exercise.equipment || "Інше",
        category: exercise.category || "Custom",
        difficulty: exercise.difficulty || "Середній",
        description: exercise.description || "",
        techniqueSteps: exercise.techniqueSteps || [],
        commonMistakes: exercise.commonMistakes || [],
        safetyTips: exercise.safetyTips || [],
        mediaUrl: exercise.mediaUrl || null,
        mediaType: exercise.mediaType || "none",
        isCustom: true,
        createdByUserId: userId
    };
}

function readImportResources(resources: unknown) {
    const allowedResources = ["customExercises", "bodyweightEntries", "workouts"];
    if (!Array.isArray(resources)) {
        return allowedResources;
    }

    const requestedResources = resources
        .map((item) => String(item))
        .filter((item) => allowedResources.includes(item));

    return requestedResources.length > 0 ? requestedResources : allowedResources;
}

async function importCustomExercises(transaction: any, userId: string, customExercises: any[]) {
    for (const exercise of customExercises) {
        await transaction.exercise.upsert({
            where: { id: exercise.id },
            update: exerciseData(exercise, userId),
            create: { id: exercise.id, slug: slugify(exercise.name), ...exerciseData(exercise, userId) }
        });
    }
}

async function importBodyweightEntries(transaction: any, userId: string, bodyweightEntries: any[]) {
    for (const entry of bodyweightEntries) {
        await transaction.userBodyweightEntry.upsert({
            where: { id: entry.id },
            update: {
                date: parseDate(entry.date),
                bodyweight: Number(entry.bodyweight) || 0,
                notes: entry.notes || null
            },
            create: {
                id: entry.id,
                userId,
                date: parseDate(entry.date),
                bodyweight: Number(entry.bodyweight) || 0,
                notes: entry.notes || null
            }
        });
    }
}

async function importWorkouts(transaction: any, userId: string, workouts: any[]) {
    for (const workout of workouts) {
        // Delete by id alone (ids are globally unique) so a leftover row from a
        // previous/overlapping import never triggers a unique-constraint failure on create.
        await transaction.workout.deleteMany({ where: { id: workout.id } });
        await transaction.workout.create({
            data: {
                id: workout.id,
                userId,
                date: parseDate(workout.date),
                title: workout.title || "Тренування",
                status: (workout.status || "planned") as WorkoutStatus,
                workoutType: workout.workoutType || "custom",
                startedAt: workout.startedAt ? parseDate(workout.startedAt) : null,
                finishedAt: workout.finishedAt ? parseDate(workout.finishedAt) : null,
                notes: workout.notes || null,
                exercises: {
                    create: (workout.exercises || []).map((exercise: any, index: number) => ({
                        id: exercise.id,
                        exerciseId: exercise.exerciseId,
                        order: exercise.order || index + 1,
                        notes: exercise.notes || null,
                        sets: {
                            create: (exercise.sets || []).map((set: any) => ({
                                id: set.id,
                                type: (set.type || "working") as WorkoutSetType,
                                weight: Number(set.weight) || 0,
                                repetitions: Number(set.repetitions) || 0,
                                rpe: Number(set.rpe) || null,
                                restSeconds: Number(set.restSeconds) || 90,
                                isCompleted: Boolean(set.isCompleted),
                                notes: set.notes || null
                            }))
                        }
                    }))
                },
                cardioSessions: {
                    create: (workout.cardioSessions || []).map((session: any) => ({
                        id: session.id,
                        type: session.type || "treadmill",
                        durationMinutes: Number(session.durationMinutes) || 0,
                        distance: Number(session.distance) || null,
                        calories: Number(session.calories) || null,
                        averageHeartRate: Number(session.averageHeartRate) || null,
                        intensity: session.intensity || null,
                        notes: session.notes || null
                    }))
                }
            }
        });
    }
}

function initials(value: string) {
    return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "GO";
}

function colorFor(value: string) {
    const palette = ["#8c6f3f", "#6e604a", "#465369", "#5d6a57", "#7a5d54"];
    const index = value.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length;
    return palette[index];
}

function numberValue(value: unknown, fallback: number) {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
}

function dateInput(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
}

function slugify(value: string) {
    return value.toLowerCase().trim().replace(/[^a-z0-9а-яіїєґ]+/gi, "-").replace(/^-|-$/g, "");
}

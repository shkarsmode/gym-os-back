"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportExportService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const exercise_catalog_importer_1 = require("./exercise-catalog-importer");
let ImportExportService = class ImportExportService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async export(user) {
        const [users, exercises, bodyweightEntries, workouts, strengthStandards] = await Promise.all([
            this.prisma.user.findMany({ include: { profile: true }, orderBy: { createdAt: "asc" } }),
            this.prisma.exercise.findMany({ orderBy: { name: "asc" } }),
            this.prisma.userBodyweightEntry.findMany({ orderBy: { date: "asc" } }),
            this.prisma.workout.findMany({
                include: {
                    exercises: { include: { sets: true }, orderBy: { order: "asc" } },
                    cardioSessions: true
                },
                orderBy: { date: "desc" }
            }),
            this.prisma.strengthStandard.findMany()
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
            strengthStandards: strengthStandards.map((item) => ({
                id: item.id,
                exerciseId: item.exerciseId,
                gender: item.gender,
                bodyweightMin: numberValue(item.bodyweightMin, 0),
                bodyweightMax: numberValue(item.bodyweightMax, 0),
                level: item.level,
                requiredWeight: numberValue(item.requiredWeight, 0),
                repetitions: item.repetitions,
                sourceName: item.sourceName,
                sourceNote: item.sourceNote || "",
                isOfficial: item.isOfficial,
                updatedAt: item.updatedAt.toISOString()
            })),
            exportedAt: new Date().toISOString()
        };
    }
    async import(user, payload) {
        const workouts = Array.isArray(payload?.workouts) ? payload.workouts.filter((item) => item.userId === user.id) : [];
        const bodyweightEntries = Array.isArray(payload?.bodyweightEntries) ? payload.bodyweightEntries.filter((item) => item.userId === user.id) : [];
        const customExercises = Array.isArray(payload?.exercises) ? payload.exercises.filter((item) => item.isCustom && item.createdByUserId === user.id) : [];
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
                        status: (workout.status || "planned"),
                        workoutType: workout.workoutType || "custom",
                        startedAt: workout.startedAt ? parseDate(workout.startedAt) : null,
                        finishedAt: workout.finishedAt ? parseDate(workout.finishedAt) : null,
                        notes: workout.notes || null,
                        exercises: {
                            create: (workout.exercises || []).map((exercise, index) => ({
                                id: exercise.id,
                                exerciseId: exercise.exerciseId,
                                order: exercise.order || index + 1,
                                notes: exercise.notes || null,
                                sets: {
                                    create: (exercise.sets || []).map((set) => ({
                                        id: set.id,
                                        type: (set.type || "working"),
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
                            create: (workout.cardioSessions || []).map((session) => ({
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
    async importExercises(user, payload) {
        this.assertExerciseImportPermission(user);
        const existing = await this.prisma.exercise.findMany({
            select: { slug: true, originalName: true, sourceUrl: true }
        });
        const existingKeys = new Set(existing.flatMap((item) => (0, exercise_catalog_importer_1.duplicateKeys)({
            slug: item.slug,
            originalName: item.originalName,
            sourceUrl: item.sourceUrl
        })));
        const result = (0, exercise_catalog_importer_1.normalizeExerciseCatalogPayload)(payload, existingKeys);
        for (const exercise of result.exercises) {
            await this.prisma.exercise.create({ data: exercise });
        }
        return {
            ok: true,
            imported: result.exercises.length,
            skipped: result.skipped,
            source: "ExRx.net"
        };
    }
    assertExerciseImportPermission(user) {
        const adminEmails = String(process.env.ADMIN_EMAILS || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
        const email = user.email.toLowerCase();
        if (adminEmails.includes(email) || email === "daniil@example.com" || user.id === "user-daniil") {
            return;
        }
        throw new common_1.ForbiddenException("Exercise catalog import requires admin or demo owner access");
    }
};
exports.ImportExportService = ImportExportService;
exports.ImportExportService = ImportExportService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ImportExportService);
function exerciseData(exercise, userId) {
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
function initials(value) {
    return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "GO";
}
function colorFor(value) {
    const palette = ["#8c6f3f", "#6e604a", "#465369", "#5d6a57", "#7a5d54"];
    const index = value.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length;
    return palette[index];
}
function numberValue(value, fallback) {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
}
function dateInput(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
}
function slugify(value) {
    return value.toLowerCase().trim().replace(/[^a-z0-9а-яіїєґ]+/gi, "-").replace(/^-|-$/g, "");
}
//# sourceMappingURL=import-export.service.js.map
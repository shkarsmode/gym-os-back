import { PrismaService } from "../../prisma/prisma.service";
export declare class WorkoutTemplatesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(): import(".prisma/client").Prisma.PrismaPromise<({
        exercises: ({
            exercise: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                name: string;
                aliases: import("@prisma/client/runtime/library").JsonValue;
                primaryMuscleGroup: string;
                secondaryMuscleGroups: import("@prisma/client/runtime/library").JsonValue;
                movementPattern: string;
                equipment: string;
                category: string;
                difficulty: string;
                description: string | null;
                techniqueSteps: import("@prisma/client/runtime/library").JsonValue;
                commonMistakes: import("@prisma/client/runtime/library").JsonValue;
                safetyTips: import("@prisma/client/runtime/library").JsonValue;
                mediaUrl: string | null;
                mediaType: string;
                isCustom: boolean;
                slug: string;
                sourceName: string | null;
                sourceUrl: string | null;
                originalName: string | null;
                licenseStatus: string | null;
                mediaReferences: import("@prisma/client/runtime/library").JsonValue;
                sourceImportedAt: Date | null;
                createdByUserId: string | null;
            };
        } & {
            id: string;
            notes: string | null;
            exerciseId: string;
            order: number;
            restSeconds: number | null;
            workoutTemplateId: string;
            targetSets: number | null;
            targetReps: number | null;
        })[];
    } & {
        id: string;
        userId: string | null;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        description: string | null;
        type: string;
        isPublic: boolean;
    })[]>;
    createWorkout(userId: string, templateId: string): Promise<{
        exercises: ({
            exercise: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                name: string;
                aliases: import("@prisma/client/runtime/library").JsonValue;
                primaryMuscleGroup: string;
                secondaryMuscleGroups: import("@prisma/client/runtime/library").JsonValue;
                movementPattern: string;
                equipment: string;
                category: string;
                difficulty: string;
                description: string | null;
                techniqueSteps: import("@prisma/client/runtime/library").JsonValue;
                commonMistakes: import("@prisma/client/runtime/library").JsonValue;
                safetyTips: import("@prisma/client/runtime/library").JsonValue;
                mediaUrl: string | null;
                mediaType: string;
                isCustom: boolean;
                slug: string;
                sourceName: string | null;
                sourceUrl: string | null;
                originalName: string | null;
                licenseStatus: string | null;
                mediaReferences: import("@prisma/client/runtime/library").JsonValue;
                sourceImportedAt: Date | null;
                createdByUserId: string | null;
            };
            sets: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                notes: string | null;
                type: import(".prisma/client").$Enums.WorkoutSetType;
                weight: import("@prisma/client/runtime/library").Decimal;
                repetitions: number;
                rpe: import("@prisma/client/runtime/library").Decimal | null;
                restSeconds: number;
                isCompleted: boolean;
                workoutExerciseId: string;
            }[];
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            notes: string | null;
            exerciseId: string;
            order: number;
            workoutId: string;
        })[];
        cardioSessions: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            notes: string | null;
            type: string;
            durationMinutes: number;
            distance: import("@prisma/client/runtime/library").Decimal | null;
            calories: number | null;
            averageHeartRate: number | null;
            intensity: string | null;
            workoutId: string;
        }[];
    } & {
        id: string;
        userId: string;
        createdAt: Date;
        updatedAt: Date;
        date: Date;
        notes: string | null;
        title: string;
        status: import(".prisma/client").$Enums.WorkoutStatus;
        workoutType: string;
        startedAt: Date | null;
        finishedAt: Date | null;
    }>;
}

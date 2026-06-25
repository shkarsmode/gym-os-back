import { RequestUser } from "../../shared/current-user.decorator";
import { ImportExportService } from "./import-export.service";
export declare class ImportExportController {
    private readonly importExportService;
    constructor(importExportService: ImportExportService);
    export(user: RequestUser): Promise<{
        version: number;
        currentUserId: string;
        users: {
            id: string;
            name: string;
            displayName: string;
            avatarInitials: string;
            avatarColor: string;
            height: number;
            bodyweight: number;
            birthYear: number;
            gender: string;
            trainingGoal: string;
            trainingExperience: string;
            favoriteMuscleGroup: string;
            createdAt: string;
            updatedAt: string;
        }[];
        exercises: {
            id: string;
            name: string;
            aliases: import("@prisma/client/runtime/library").JsonValue;
            primaryMuscleGroup: string;
            secondaryMuscleGroups: import("@prisma/client/runtime/library").JsonValue;
            movementPattern: string;
            equipment: string;
            category: string;
            difficulty: string;
            description: string;
            techniqueSteps: import("@prisma/client/runtime/library").JsonValue;
            commonMistakes: import("@prisma/client/runtime/library").JsonValue;
            safetyTips: import("@prisma/client/runtime/library").JsonValue;
            mediaUrl: string;
            mediaType: string;
            sourceName: string | null;
            sourceUrl: string | null;
            originalName: string | null;
            licenseStatus: string | null;
            mediaReferences: import("@prisma/client/runtime/library").JsonValue;
            isCustom: boolean;
            createdByUserId: string | null;
            createdAt: string;
            updatedAt: string;
        }[];
        bodyweightEntries: {
            id: string;
            userId: string;
            date: string;
            bodyweight: number;
            notes: string;
        }[];
        workouts: {
            id: string;
            userId: string;
            date: string;
            title: string;
            status: import(".prisma/client").$Enums.WorkoutStatus;
            workoutType: string;
            startedAt: string | null;
            finishedAt: string | null;
            notes: string;
            exercises: {
                id: string;
                exerciseId: string;
                order: number;
                notes: string;
                sets: {
                    id: string;
                    type: import(".prisma/client").$Enums.WorkoutSetType;
                    weight: number;
                    repetitions: number;
                    rpe: number;
                    restSeconds: number;
                    isCompleted: boolean;
                    notes: string;
                }[];
            }[];
            cardioSessions: {
                id: string;
                type: string;
                durationMinutes: number;
                distance: number;
                calories: number;
                averageHeartRate: number;
                intensity: string;
                notes: string;
            }[];
        }[];
        strengthStandards: {
            id: string;
            exerciseId: string;
            gender: string;
            bodyweightMin: number;
            bodyweightMax: number;
            level: string;
            requiredWeight: number;
            repetitions: number;
            sourceName: string;
            sourceNote: string;
            isOfficial: boolean;
            updatedAt: string;
        }[];
        exportedAt: string;
    }>;
    import(user: RequestUser, payload: unknown): Promise<{
        ok: boolean;
        imported: {
            workouts: any;
            bodyweightEntries: any;
            customExercises: any;
        };
    }>;
    importExercises(user: RequestUser, payload: unknown): Promise<{
        ok: boolean;
        imported: number;
        skipped: number;
        source: string;
    }>;
}

import { PrismaService } from "../../prisma/prisma.service";
export declare class ImportExportService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    export(): Promise<{
        version: number;
        users: ({
            oauthAccounts: {
                id: string;
                userId: string;
                provider: string;
                providerAccountId: string;
                accessToken: string | null;
                refreshToken: string | null;
                expiresAt: Date | null;
                createdAt: Date;
                updatedAt: Date;
            }[];
            profile: {
                id: string;
                userId: string;
                createdAt: Date;
                updatedAt: Date;
                name: string;
                displayName: string;
                height: number | null;
                bodyweight: import("@prisma/client/runtime/library").Decimal | null;
                gender: string;
                trainingGoal: string | null;
                trainingExperience: string | null;
                favoriteMuscleGroup: string | null;
            } | null;
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            googleId: string | null;
            displayName: string;
            avatarUrl: string | null;
        })[];
        exercises: {
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
            createdByUserId: string | null;
        }[];
        bodyweightEntries: {
            id: string;
            userId: string;
            createdAt: Date;
            bodyweight: import("@prisma/client/runtime/library").Decimal;
            date: Date;
            notes: string | null;
        }[];
        workouts: ({
            exercises: ({
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
        })[];
        strengthStandards: {
            id: string;
            updatedAt: Date;
            gender: string;
            exerciseId: string;
            repetitions: number;
            bodyweightMin: import("@prisma/client/runtime/library").Decimal;
            bodyweightMax: import("@prisma/client/runtime/library").Decimal;
            level: string;
            requiredWeight: import("@prisma/client/runtime/library").Decimal;
            sourceName: string;
            sourceNote: string | null;
            isOfficial: boolean;
        }[];
        workoutTemplates: ({
            exercises: {
                id: string;
                notes: string | null;
                exerciseId: string;
                order: number;
                restSeconds: number | null;
                workoutTemplateId: string;
                targetSets: number | null;
                targetReps: number | null;
            }[];
        } & {
            id: string;
            userId: string | null;
            createdAt: Date;
            updatedAt: Date;
            title: string;
            description: string | null;
            type: string;
            isPublic: boolean;
        })[];
        achievements: {
            id: string;
            createdAt: Date;
            title: string;
            category: string;
            description: string;
            key: string;
            target: number;
            metric: string;
        }[];
        exportedAt: string;
    }>;
    import(payload: any): Promise<{
        ok: boolean;
        received: {
            users: any;
            exercises: any;
            workouts: any;
        };
        note: string;
    }>;
}

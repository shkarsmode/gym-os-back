import { RankingsService } from "./rankings.service";
export declare class RankingsController {
    private readonly rankingsService;
    constructor(rankingsService: RankingsService);
    findAll(): Promise<{
        user: {
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
            personalRecords: ({
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
                    createdByUserId: string | null;
                };
            } & {
                id: string;
                userId: string;
                exerciseId: string;
                type: string;
                weight: import("@prisma/client/runtime/library").Decimal | null;
                repetitions: number | null;
                workoutId: string | null;
                value: import("@prisma/client/runtime/library").Decimal;
                estimatedOneRepMax: import("@prisma/client/runtime/library").Decimal | null;
                isEstimated: boolean;
                recordedAt: Date;
            })[];
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            googleId: string | null;
            displayName: string;
            avatarUrl: string | null;
        };
        completedWorkouts: number;
        totalVolume: number;
        bestLift: {
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
                createdByUserId: string | null;
            };
        } & {
            id: string;
            userId: string;
            exerciseId: string;
            type: string;
            weight: import("@prisma/client/runtime/library").Decimal | null;
            repetitions: number | null;
            workoutId: string | null;
            value: import("@prisma/client/runtime/library").Decimal;
            estimatedOneRepMax: import("@prisma/client/runtime/library").Decimal | null;
            isEstimated: boolean;
            recordedAt: Date;
        };
        score: number;
    }[]>;
}

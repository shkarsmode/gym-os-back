import { RequestUser } from "../../shared/current-user.decorator";
import { AddWorkoutExerciseDto, CreateCardioSessionDto, CreateWorkoutDto, CreateWorkoutSetDto, UpdateCardioSessionDto, UpdateWorkoutDto, UpdateWorkoutExerciseDto, UpdateWorkoutSetDto } from "./dto/workout.dto";
import { WorkoutsService } from "./workouts.service";
export declare class WorkoutsController {
    private readonly workoutsService;
    constructor(workoutsService: WorkoutsService);
    findAll(query: Record<string, string>): import(".prisma/client").Prisma.PrismaPromise<({
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
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            googleId: string | null;
            displayName: string;
            avatarUrl: string | null;
        };
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
    })[]>;
    findOne(id: string): Promise<{
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
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            googleId: string | null;
            displayName: string;
            avatarUrl: string | null;
        };
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
    create(user: RequestUser, dto: CreateWorkoutDto): import(".prisma/client").Prisma.Prisma__WorkoutClient<{
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
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            googleId: string | null;
            displayName: string;
            avatarUrl: string | null;
        };
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
    }, never, import("@prisma/client/runtime/library").DefaultArgs>;
    update(user: RequestUser, id: string, dto: UpdateWorkoutDto): Promise<{
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
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            googleId: string | null;
            displayName: string;
            avatarUrl: string | null;
        };
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
    remove(user: RequestUser, id: string): Promise<{
        ok: boolean;
    }>;
    start(user: RequestUser, id: string): Promise<{
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
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            googleId: string | null;
            displayName: string;
            avatarUrl: string | null;
        };
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
    finish(user: RequestUser, id: string): Promise<{
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
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            googleId: string | null;
            displayName: string;
            avatarUrl: string | null;
        };
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
    addExercise(user: RequestUser, id: string, dto: AddWorkoutExerciseDto): Promise<{
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
    }>;
    updateExercise(user: RequestUser, id: string, workoutExerciseId: string, dto: UpdateWorkoutExerciseDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        notes: string | null;
        exerciseId: string;
        order: number;
        workoutId: string;
    }>;
    deleteExercise(user: RequestUser, id: string, workoutExerciseId: string): Promise<{
        ok: boolean;
    }>;
    addSet(user: RequestUser, id: string, workoutExerciseId: string, dto: CreateWorkoutSetDto): Promise<{
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
    }>;
    updateSet(user: RequestUser, id: string, workoutExerciseId: string, setId: string, dto: UpdateWorkoutSetDto): Promise<{
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
    }>;
    deleteSet(user: RequestUser, id: string, workoutExerciseId: string, setId: string): Promise<{
        ok: boolean;
    }>;
    addCardio(user: RequestUser, id: string, dto: CreateCardioSessionDto): Promise<{
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
    }>;
    updateCardio(user: RequestUser, id: string, cardioId: string, dto: UpdateCardioSessionDto): Promise<{
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
    }>;
    deleteCardio(user: RequestUser, id: string, cardioId: string): Promise<{
        ok: boolean;
    }>;
}

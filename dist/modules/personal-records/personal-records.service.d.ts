import { PrismaService } from "../../prisma/prisma.service";
export declare class PersonalRecordsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findByUser(userId: string): import(".prisma/client").Prisma.PrismaPromise<({
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
        workout: {
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
        } | null;
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
    })[]>;
}

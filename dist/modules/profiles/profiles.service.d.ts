import { PrismaService } from "../../prisma/prisma.service";
export declare class ProfilesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findByUserId(userId: string): import(".prisma/client").Prisma.Prisma__UserProfileClient<{
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
    } | null, null, import("@prisma/client/runtime/library").DefaultArgs>;
}

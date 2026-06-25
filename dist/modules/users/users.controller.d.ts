import { RequestUser } from "../../shared/current-user.decorator";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UsersService } from "./users.service";
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    findAll(): import(".prisma/client").Prisma.PrismaPromise<({
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
    })[]>;
    findOne(id: string): Promise<{
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
        bodyweightEntries: {
            id: string;
            userId: string;
            createdAt: Date;
            bodyweight: import("@prisma/client/runtime/library").Decimal;
            date: Date;
            notes: string | null;
        }[];
        workouts: {
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
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        email: string;
        googleId: string | null;
        displayName: string;
        avatarUrl: string | null;
    }>;
    updateMyProfile(user: RequestUser, dto: UpdateProfileDto): import(".prisma/client").Prisma.Prisma__UserProfileClient<{
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
    }, never, import("@prisma/client/runtime/library").DefaultArgs>;
}

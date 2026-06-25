import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";

@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService) {}

    findAll() {
        return this.prisma.user.findMany({
            include: { profile: true },
            orderBy: { createdAt: "asc" }
        });
    }

    async findOne(id: string) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            include: {
                profile: true,
                bodyweightEntries: { orderBy: { date: "desc" }, take: 20 },
                workouts: { orderBy: { date: "desc" }, take: 20 }
            }
        });

        if (!user) {
            throw new NotFoundException("User not found");
        }

        return user;
    }

    updateProfile(userId: string, dto: UpdateProfileDto) {
        return this.prisma.userProfile.upsert({
            where: { userId },
            update: dto,
            create: {
                userId,
                name: dto.name || dto.displayName || "GymOS User",
                displayName: dto.displayName || dto.name || "GymOS User",
                height: dto.height,
                bodyweight: dto.bodyweight,
                gender: dto.gender || "male",
                trainingGoal: dto.trainingGoal,
                trainingExperience: dto.trainingExperience,
                favoriteMuscleGroup: dto.favoriteMuscleGroup
            }
        });
    }
}

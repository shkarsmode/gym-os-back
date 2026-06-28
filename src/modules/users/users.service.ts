import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { isAdminUser, isSuperAdminUser } from "../../shared/admin";
import { RequestUser } from "../../shared/current-user.decorator";
import { UpdateProfileDto } from "./dto/update-profile.dto";

const ALLOWED_ROLES = ["free", "premium", "admin"];

@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService) {}

    async setApproval(actor: RequestUser, targetId: string, approved: boolean) {
        if (!isAdminUser(actor)) {
            throw new ForbiddenException("Admin access required");
        }
        await this.prisma.user.update({ where: { id: targetId }, data: { approved } });
        return { ok: true, id: targetId, approved };
    }

    async setRole(actor: RequestUser, targetId: string, role: string) {
        if (!isAdminUser(actor)) {
            throw new ForbiddenException("Admin access required");
        }
        const next = String(role || "").toLowerCase();
        if (!ALLOWED_ROLES.includes(next)) {
            throw new BadRequestException("Invalid role");
        }
        const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { email: true } });
        if (!target) {
            throw new NotFoundException("User not found");
        }
        // The email-based super-admin can never be demoted via the panel.
        if (isSuperAdminUser({ email: target.email }) && next !== "admin") {
            throw new ForbiddenException("Cannot change the super-admin role");
        }
        // Promoting to a role should also unblock the account.
        const approved = next === "admin" || next === "premium" ? true : undefined;
        await this.prisma.user.update({ where: { id: targetId }, data: { role: next, ...(approved ? { approved } : {}) } });
        return { ok: true, id: targetId, role: next };
    }

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

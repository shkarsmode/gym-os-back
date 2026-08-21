import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { isAdminUser, isSuperAdminUser } from "../../shared/admin";
import { RequestUser } from "../../shared/current-user.decorator";
import { UpdateProfileDto } from "./dto/update-profile.dto";

const ALLOWED_ROLES = ["free", "premium", "admin"];

/**
 * The year implied by a date of birth, or null if there isn't a usable one.
 *
 * A supplied date is the source of truth for the year. Taking the client's word for both
 * lets the two disagree, and everything that reads the age reads the YEAR — so the
 * disagreement would surface as a coach quietly planning for somebody a decade older
 * than they are.
 */
export function deriveBirthYear(birthDate: string | undefined | null): number | null {
    if (!birthDate) {
        return null;
    }
    const year = Number(String(birthDate).slice(0, 4));
    if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()) {
        return null;
    }
    return year;
}

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

    // Stores the whole preferences blob on the User row (wholesale replace — the
    // client always sends its full pref set). Returns just the saved blob.
    async updatePreferences(userId: string, preferences: Record<string, unknown>) {
        const user = await this.prisma.user.update({
            where: { id: userId },
            data: { preferences: preferences as Prisma.InputJsonValue },
            select: { preferences: true }
        });
        return { ok: true, preferences: user.preferences };
    }

    updateProfile(userId: string, dto: UpdateProfileDto) {
        const data = { ...dto };
        const derived = deriveBirthYear(dto.birthDate);
        if (derived !== null) {
            data.birthYear = derived;
        }
        return this.prisma.userProfile.upsert({
            where: { userId },
            update: data,
            create: {
                userId,
                name: data.name || data.displayName || "GymOS User",
                displayName: data.displayName || data.name || "GymOS User",
                height: data.height,
                bodyweight: data.bodyweight,
                birthYear: data.birthYear,
                birthDate: data.birthDate,
                gender: data.gender || "male",
                trainingGoal: data.trainingGoal,
                trainingExperience: data.trainingExperience,
                favoriteMuscleGroup: data.favoriteMuscleGroup
            }
        });
    }
}

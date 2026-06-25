import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { parseDateInput } from "../../shared/parse-date";
import { CreateBodyweightDto } from "./dto/create-bodyweight.dto";

@Injectable()
export class BodyweightService {
    constructor(private readonly prisma: PrismaService) {}

    findMine(userId: string) {
        return this.prisma.userBodyweightEntry.findMany({
            where: { userId },
            orderBy: { date: "desc" }
        });
    }

    async createMine(userId: string, dto: CreateBodyweightDto) {
        const entry = await this.prisma.userBodyweightEntry.create({
            data: {
                userId,
                date: parseDateInput(dto.date),
                bodyweight: dto.bodyweight,
                notes: dto.notes
            }
        });

        await this.prisma.userProfile.updateMany({
            where: { userId },
            data: { bodyweight: dto.bodyweight }
        });

        return entry;
    }

    async deleteMine(userId: string, entryId: string) {
        const entry = await this.prisma.userBodyweightEntry.findUnique({ where: { id: entryId } });
        if (!entry) {
            throw new NotFoundException("Bodyweight entry not found");
        }
        if (entry.userId !== userId) {
            throw new ForbiddenException("Cannot delete another user's bodyweight entry");
        }

        await this.prisma.userBodyweightEntry.delete({ where: { id: entryId } });
        return { ok: true };
    }
}

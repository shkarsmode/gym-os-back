import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateExerciseDto, UpdateExerciseDto } from "./dto/exercise.dto";

@Injectable()
export class ExercisesService {
    constructor(private readonly prisma: PrismaService) {}

    findAll() {
        return this.prisma.exercise.findMany({ orderBy: { name: "asc" } });
    }

    async findOne(id: string) {
        const exercise = await this.prisma.exercise.findUnique({ where: { id } });
        if (!exercise) {
            throw new NotFoundException("Exercise not found");
        }
        return exercise;
    }

    create(userId: string, dto: CreateExerciseDto) {
        return this.prisma.exercise.create({
            data: {
                slug: this.slugify(dto.name),
                ...dto,
                aliases: dto.aliases || [],
                secondaryMuscleGroups: dto.secondaryMuscleGroups || [],
                techniqueSteps: dto.techniqueSteps || [],
                commonMistakes: dto.commonMistakes || [],
                safetyTips: dto.safetyTips || [],
                isCustom: true,
                createdByUserId: userId
            }
        });
    }

    async update(userId: string, id: string, dto: UpdateExerciseDto) {
        const exercise = await this.findOne(id);
        if (exercise.createdByUserId && exercise.createdByUserId !== userId) {
            throw new ForbiddenException("Cannot edit another user's custom exercise");
        }

        return this.prisma.exercise.update({
            where: { id },
            data: {
                ...dto,
                aliases: dto.aliases,
                secondaryMuscleGroups: dto.secondaryMuscleGroups,
                techniqueSteps: dto.techniqueSteps,
                commonMistakes: dto.commonMistakes,
                safetyTips: dto.safetyTips
            }
        });
    }

    async remove(userId: string, id: string) {
        const exercise = await this.findOne(id);
        if (!exercise.isCustom || exercise.createdByUserId !== userId) {
            throw new ForbiddenException("Only the owner can delete a custom exercise");
        }

        await this.prisma.exercise.delete({ where: { id } });
        return { ok: true };
    }

    private slugify(value: string) {
        return value.toLowerCase().trim().replace(/[^a-z0-9а-яіїєґ]+/gi, "-").replace(/^-|-$/g, "");
    }
}

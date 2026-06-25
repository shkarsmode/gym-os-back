"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExercisesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let ExercisesService = class ExercisesService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    findAll() {
        return this.prisma.exercise.findMany({ orderBy: { name: "asc" } });
    }
    async findOne(id) {
        const exercise = await this.prisma.exercise.findUnique({ where: { id } });
        if (!exercise) {
            throw new common_1.NotFoundException("Exercise not found");
        }
        return exercise;
    }
    create(userId, dto) {
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
    async update(userId, id, dto) {
        const exercise = await this.findOne(id);
        if (exercise.createdByUserId && exercise.createdByUserId !== userId) {
            throw new common_1.ForbiddenException("Cannot edit another user's custom exercise");
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
    async remove(userId, id) {
        const exercise = await this.findOne(id);
        if (!exercise.isCustom || exercise.createdByUserId !== userId) {
            throw new common_1.ForbiddenException("Only the owner can delete a custom exercise");
        }
        await this.prisma.exercise.delete({ where: { id } });
        return { ok: true };
    }
    slugify(value) {
        return value.toLowerCase().trim().replace(/[^a-z0-9а-яіїєґ]+/gi, "-").replace(/^-|-$/g, "");
    }
};
exports.ExercisesService = ExercisesService;
exports.ExercisesService = ExercisesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ExercisesService);
//# sourceMappingURL=exercises.service.js.map
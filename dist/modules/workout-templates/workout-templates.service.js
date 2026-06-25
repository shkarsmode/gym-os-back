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
exports.WorkoutTemplatesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let WorkoutTemplatesService = class WorkoutTemplatesService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    findAll() {
        return this.prisma.workoutTemplate.findMany({
            where: { isPublic: true },
            include: { exercises: { include: { exercise: true }, orderBy: { order: "asc" } } },
            orderBy: { title: "asc" }
        });
    }
    async createWorkout(userId, templateId) {
        const template = await this.prisma.workoutTemplate.findUnique({
            where: { id: templateId },
            include: { exercises: { orderBy: { order: "asc" } } }
        });
        if (!template) {
            throw new common_1.NotFoundException("Workout template not found");
        }
        return this.prisma.workout.create({
            data: {
                userId,
                date: new Date(),
                title: template.title,
                status: "planned",
                workoutType: template.type,
                notes: "Created from workout template.",
                exercises: {
                    create: template.exercises.map((item) => ({
                        exerciseId: item.exerciseId,
                        order: item.order,
                        notes: item.notes,
                        sets: item.targetSets ? {
                            create: Array.from({ length: item.targetSets }, () => ({
                                type: "working",
                                weight: 0,
                                repetitions: item.targetReps || 8,
                                restSeconds: item.restSeconds || 90,
                                isCompleted: false
                            }))
                        } : undefined
                    }))
                }
            },
            include: {
                exercises: { include: { exercise: true, sets: true }, orderBy: { order: "asc" } },
                cardioSessions: true
            }
        });
    }
};
exports.WorkoutTemplatesService = WorkoutTemplatesService;
exports.WorkoutTemplatesService = WorkoutTemplatesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], WorkoutTemplatesService);
//# sourceMappingURL=workout-templates.service.js.map
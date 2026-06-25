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
exports.WorkoutsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const parse_date_1 = require("../../shared/parse-date");
let WorkoutsService = class WorkoutsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    findAll(query) {
        return this.prisma.workout.findMany({
            where: {
                userId: query.userId,
                status: query.status,
                workoutType: query.workoutType
            },
            include: this.includeWorkout(),
            orderBy: { date: "desc" }
        });
    }
    async findOne(id) {
        const workout = await this.prisma.workout.findUnique({
            where: { id },
            include: this.includeWorkout()
        });
        if (!workout) {
            throw new common_1.NotFoundException("Workout not found");
        }
        return workout;
    }
    create(userId, dto) {
        const now = new Date();
        return this.prisma.workout.create({
            data: {
                userId,
                date: (0, parse_date_1.parseDateInput)(dto.date),
                title: dto.title,
                status: dto.status || "planned",
                workoutType: dto.workoutType,
                startedAt: dto.status === "active" ? now : undefined,
                finishedAt: dto.status === "completed" ? now : undefined,
                notes: dto.notes
            },
            include: this.includeWorkout()
        });
    }
    async update(userId, id, dto) {
        await this.assertOwner(userId, id);
        return this.prisma.workout.update({
            where: { id },
            data: {
                ...dto,
                date: dto.date ? (0, parse_date_1.parseDateInput)(dto.date) : undefined
            },
            include: this.includeWorkout()
        });
    }
    async remove(userId, id) {
        await this.assertOwner(userId, id);
        await this.prisma.workout.delete({ where: { id } });
        return { ok: true };
    }
    async start(userId, id) {
        await this.assertOwner(userId, id);
        await this.prisma.workout.updateMany({
            where: { userId, status: "active", id: { not: id } },
            data: { status: "completed", finishedAt: new Date() }
        });
        return this.prisma.workout.update({
            where: { id },
            data: { status: "active", startedAt: new Date(), finishedAt: null },
            include: this.includeWorkout()
        });
    }
    async finish(userId, id) {
        await this.assertOwner(userId, id);
        return this.prisma.workout.update({
            where: { id },
            data: { status: "completed", finishedAt: new Date() },
            include: this.includeWorkout()
        });
    }
    async addExercise(userId, workoutId, dto) {
        await this.assertOwner(userId, workoutId);
        const order = dto.order || await this.nextExerciseOrder(workoutId);
        return this.prisma.workoutExercise.create({
            data: {
                workoutId,
                exerciseId: dto.exerciseId,
                order,
                notes: dto.notes
            },
            include: { exercise: true, sets: true }
        });
    }
    async updateExercise(userId, workoutId, workoutExerciseId, dto) {
        await this.assertWorkoutExerciseOwner(userId, workoutId, workoutExerciseId);
        return this.prisma.workoutExercise.update({ where: { id: workoutExerciseId }, data: dto });
    }
    async deleteExercise(userId, workoutId, workoutExerciseId) {
        await this.assertWorkoutExerciseOwner(userId, workoutId, workoutExerciseId);
        await this.prisma.workoutExercise.delete({ where: { id: workoutExerciseId } });
        return { ok: true };
    }
    async addSet(userId, workoutId, workoutExerciseId, dto) {
        await this.assertWorkoutExerciseOwner(userId, workoutId, workoutExerciseId);
        return this.prisma.workoutSet.create({
            data: {
                workoutExerciseId,
                ...dto,
                restSeconds: dto.restSeconds ?? 90,
                isCompleted: dto.isCompleted ?? false
            }
        });
    }
    async updateSet(userId, workoutId, workoutExerciseId, setId, dto) {
        await this.assertWorkoutExerciseOwner(userId, workoutId, workoutExerciseId);
        return this.prisma.workoutSet.update({ where: { id: setId }, data: dto });
    }
    async deleteSet(userId, workoutId, workoutExerciseId, setId) {
        await this.assertWorkoutExerciseOwner(userId, workoutId, workoutExerciseId);
        await this.prisma.workoutSet.delete({ where: { id: setId } });
        return { ok: true };
    }
    async addCardio(userId, workoutId, dto) {
        await this.assertOwner(userId, workoutId);
        return this.prisma.cardioSession.create({ data: { workoutId, ...dto } });
    }
    async updateCardio(userId, workoutId, cardioId, dto) {
        await this.assertOwner(userId, workoutId);
        return this.prisma.cardioSession.update({ where: { id: cardioId }, data: dto });
    }
    async deleteCardio(userId, workoutId, cardioId) {
        await this.assertOwner(userId, workoutId);
        await this.prisma.cardioSession.delete({ where: { id: cardioId } });
        return { ok: true };
    }
    async assertOwner(userId, workoutId) {
        const workout = await this.prisma.workout.findUnique({ where: { id: workoutId } });
        if (!workout) {
            throw new common_1.NotFoundException("Workout not found");
        }
        if (workout.userId !== userId) {
            throw new common_1.ForbiddenException("Cannot edit another user's workout");
        }
        return workout;
    }
    async assertWorkoutExerciseOwner(userId, workoutId, workoutExerciseId) {
        await this.assertOwner(userId, workoutId);
        const workoutExercise = await this.prisma.workoutExercise.findFirst({
            where: { id: workoutExerciseId, workoutId }
        });
        if (!workoutExercise) {
            throw new common_1.NotFoundException("Workout exercise not found");
        }
        return workoutExercise;
    }
    async nextExerciseOrder(workoutId) {
        const last = await this.prisma.workoutExercise.findFirst({
            where: { workoutId },
            orderBy: { order: "desc" }
        });
        return (last?.order || 0) + 1;
    }
    includeWorkout() {
        return {
            user: { include: { profile: true } },
            exercises: { include: { exercise: true, sets: true }, orderBy: { order: "asc" } },
            cardioSessions: true
        };
    }
};
exports.WorkoutsService = WorkoutsService;
exports.WorkoutsService = WorkoutsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], WorkoutsService);
//# sourceMappingURL=workouts.service.js.map
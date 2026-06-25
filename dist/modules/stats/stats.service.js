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
exports.StatsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let StatsService = class StatsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async userOverview(userId) {
        const workouts = await this.prisma.workout.findMany({
            where: { userId },
            include: { exercises: { include: { sets: true } }, cardioSessions: true }
        });
        const completed = workouts.filter((workout) => workout.status === "completed");
        const sets = completed.flatMap((workout) => workout.exercises.flatMap((exercise) => exercise.sets)).filter((set) => set.isCompleted);
        const totalVolume = sets.reduce((sum, set) => sum + Number(set.weight) * set.repetitions, 0);
        const cardioMinutes = workouts.reduce((sum, workout) => sum + workout.cardioSessions.reduce((sessionSum, session) => sessionSum + session.durationMinutes, 0), 0);
        const averageDurationMinutes = completed.length
            ? Math.round(completed.reduce((sum, workout) => sum + this.durationMinutes(workout.startedAt, workout.finishedAt), 0) / completed.length)
            : 0;
        return {
            totalWorkouts: workouts.length,
            completedWorkouts: completed.length,
            totalSets: sets.length,
            workingSets: sets.filter((set) => set.type !== "warmup").length,
            totalVolume,
            cardioMinutes,
            averageDurationMinutes
        };
    }
    durationMinutes(startedAt, finishedAt) {
        if (!startedAt || !finishedAt) {
            return 0;
        }
        return Math.max(0, Math.round((finishedAt.getTime() - startedAt.getTime()) / 60000));
    }
};
exports.StatsService = StatsService;
exports.StatsService = StatsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], StatsService);
//# sourceMappingURL=stats.service.js.map
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
exports.TeamStatsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let TeamStatsService = class TeamStatsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async overview() {
        const workouts = await this.prisma.workout.findMany({
            include: { exercises: { include: { sets: true } }, cardioSessions: true }
        });
        const completed = workouts.filter((workout) => workout.status === "completed");
        const totalVolume = completed.reduce((sum, workout) => sum + workout.exercises.reduce((exerciseSum, exercise) => exerciseSum + exercise.sets.filter((set) => set.isCompleted).reduce((setSum, set) => setSum + Number(set.weight) * set.repetitions, 0), 0), 0);
        const cardioMinutes = workouts.reduce((sum, workout) => sum + workout.cardioSessions.reduce((sessionSum, session) => sessionSum + session.durationMinutes, 0), 0);
        return {
            totalWorkouts: workouts.length,
            completedWorkouts: completed.length,
            totalVolume,
            cardioMinutes
        };
    }
};
exports.TeamStatsService = TeamStatsService;
exports.TeamStatsService = TeamStatsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TeamStatsService);
//# sourceMappingURL=team-stats.service.js.map
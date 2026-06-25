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
exports.ImportExportService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let ImportExportService = class ImportExportService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async export() {
        const [users, exercises, bodyweightEntries, workouts, strengthStandards, workoutTemplates, achievements] = await Promise.all([
            this.prisma.user.findMany({ include: { profile: true, oauthAccounts: true } }),
            this.prisma.exercise.findMany(),
            this.prisma.userBodyweightEntry.findMany(),
            this.prisma.workout.findMany({ include: { exercises: { include: { sets: true } }, cardioSessions: true } }),
            this.prisma.strengthStandard.findMany(),
            this.prisma.workoutTemplate.findMany({ include: { exercises: true } }),
            this.prisma.achievement.findMany()
        ]);
        return {
            version: 1,
            users,
            exercises,
            bodyweightEntries,
            workouts,
            strengthStandards,
            workoutTemplates,
            achievements,
            exportedAt: new Date().toISOString()
        };
    }
    async import(payload) {
        return {
            ok: true,
            received: {
                users: Array.isArray(payload?.users) ? payload.users.length : 0,
                exercises: Array.isArray(payload?.exercises) ? payload.exercises.length : 0,
                workouts: Array.isArray(payload?.workouts) ? payload.workouts.length : 0
            },
            note: "Import validation skeleton is ready; production imports should map frontend demo IDs to Prisma IDs in a transaction."
        };
    }
};
exports.ImportExportService = ImportExportService;
exports.ImportExportService = ImportExportService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ImportExportService);
//# sourceMappingURL=import-export.service.js.map
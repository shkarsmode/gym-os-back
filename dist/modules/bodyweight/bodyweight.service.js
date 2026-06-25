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
exports.BodyweightService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const parse_date_1 = require("../../shared/parse-date");
let BodyweightService = class BodyweightService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    findMine(userId) {
        return this.prisma.userBodyweightEntry.findMany({
            where: { userId },
            orderBy: { date: "desc" }
        });
    }
    async createMine(userId, dto) {
        const entry = await this.prisma.userBodyweightEntry.create({
            data: {
                userId,
                date: (0, parse_date_1.parseDateInput)(dto.date),
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
    async deleteMine(userId, entryId) {
        const entry = await this.prisma.userBodyweightEntry.findUnique({ where: { id: entryId } });
        if (!entry) {
            throw new common_1.NotFoundException("Bodyweight entry not found");
        }
        if (entry.userId !== userId) {
            throw new common_1.ForbiddenException("Cannot delete another user's bodyweight entry");
        }
        await this.prisma.userBodyweightEntry.delete({ where: { id: entryId } });
        return { ok: true };
    }
};
exports.BodyweightService = BodyweightService;
exports.BodyweightService = BodyweightService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], BodyweightService);
//# sourceMappingURL=bodyweight.service.js.map
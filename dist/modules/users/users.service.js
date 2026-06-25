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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let UsersService = class UsersService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    findAll() {
        return this.prisma.user.findMany({
            include: { profile: true },
            orderBy: { createdAt: "asc" }
        });
    }
    async findOne(id) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            include: {
                profile: true,
                bodyweightEntries: { orderBy: { date: "desc" }, take: 20 },
                workouts: { orderBy: { date: "desc" }, take: 20 }
            }
        });
        if (!user) {
            throw new common_1.NotFoundException("User not found");
        }
        return user;
    }
    updateProfile(userId, dto) {
        return this.prisma.userProfile.upsert({
            where: { userId },
            update: dto,
            create: {
                userId,
                name: dto.name || dto.displayName || "GymOS User",
                displayName: dto.displayName || dto.name || "GymOS User",
                height: dto.height,
                bodyweight: dto.bodyweight,
                gender: dto.gender || "male",
                trainingGoal: dto.trainingGoal,
                trainingExperience: dto.trainingExperience,
                favoriteMuscleGroup: dto.favoriteMuscleGroup
            }
        });
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map
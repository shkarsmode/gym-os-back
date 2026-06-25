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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const prisma_service_1 = require("../../prisma/prisma.service");
let AuthService = class AuthService {
    constructor(prisma, jwtService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
    }
    async upsertGoogleUser(profile) {
        const existingAccount = await this.prisma.oAuthAccount.findUnique({
            where: {
                provider_providerAccountId: {
                    provider: "google",
                    providerAccountId: profile.googleId
                }
            },
            include: { user: true }
        });
        if (existingAccount) {
            return existingAccount.user;
        }
        const user = await this.prisma.user.upsert({
            where: { email: profile.email },
            update: {
                googleId: profile.googleId,
                displayName: profile.displayName,
                avatarUrl: profile.avatarUrl || undefined
            },
            create: {
                email: profile.email,
                googleId: profile.googleId,
                displayName: profile.displayName,
                avatarUrl: profile.avatarUrl || undefined,
                profile: {
                    create: {
                        name: profile.displayName,
                        displayName: profile.displayName,
                        gender: "male"
                    }
                }
            }
        });
        await this.prisma.oAuthAccount.create({
            data: {
                userId: user.id,
                provider: "google",
                providerAccountId: profile.googleId,
                accessToken: profile.accessToken,
                refreshToken: profile.refreshToken
            }
        });
        return user;
    }
    attachSessionCookie(response, user) {
        const token = this.jwtService.sign({
            sub: user.id,
            email: user.email,
            displayName: user.displayName
        });
        response.cookie("gymos_session", token, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 14 * 24 * 60 * 60 * 1000
        });
    }
    clearSessionCookie(response) {
        response.clearCookie("gymos_session");
    }
    async readUserFromRequest(request) {
        const token = request.cookies?.gymos_session;
        if (!token) {
            return null;
        }
        try {
            const payload = await this.jwtService.verifyAsync(token, {
                secret: process.env.JWT_SECRET || "development-only-secret"
            });
            return this.prisma.user.findUnique({
                where: { id: payload.sub },
                include: { profile: true }
            });
        }
        catch (error) {
            return null;
        }
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map
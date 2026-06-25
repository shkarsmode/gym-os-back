import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Response, Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";

type GoogleUser = {
    googleId: string;
    email: string;
    displayName: string;
    avatarUrl?: string | null;
    accessToken?: string;
    refreshToken?: string;
};

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService
    ) {}

    async upsertGoogleUser(profile: GoogleUser) {
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

    attachSessionCookie(response: Response, user: { id: string; email: string; displayName: string }) {
        const token = this.jwtService.sign({
            sub: user.id,
            email: user.email,
            displayName: user.displayName
        });
        const isProduction = process.env.NODE_ENV === "production";

        response.cookie("gymos_session", token, {
            httpOnly: true,
            sameSite: isProduction ? "none" : "lax",
            secure: isProduction,
            maxAge: 14 * 24 * 60 * 60 * 1000
        });
    }

    clearSessionCookie(response: Response) {
        response.clearCookie("gymos_session");
    }

    async readUserFromRequest(request: Request) {
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
        } catch (error) {
            return null;
        }
    }
}

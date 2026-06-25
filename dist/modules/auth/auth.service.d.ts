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
export declare class AuthService {
    private readonly prisma;
    private readonly jwtService;
    constructor(prisma: PrismaService, jwtService: JwtService);
    upsertGoogleUser(profile: GoogleUser): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        email: string;
        googleId: string | null;
        displayName: string;
        avatarUrl: string | null;
    }>;
    attachSessionCookie(response: Response, user: {
        id: string;
        email: string;
        displayName: string;
    }): void;
    clearSessionCookie(response: Response): void;
    readUserFromRequest(request: Request): Promise<({
        profile: {
            id: string;
            userId: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            displayName: string;
            height: number | null;
            bodyweight: import("@prisma/client/runtime/library").Decimal | null;
            gender: string;
            trainingGoal: string | null;
            trainingExperience: string | null;
            favoriteMuscleGroup: string | null;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        email: string;
        googleId: string | null;
        displayName: string;
        avatarUrl: string | null;
    }) | null>;
}
export {};

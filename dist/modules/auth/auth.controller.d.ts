import { Request, Response } from "express";
import { AuthService } from "./auth.service";
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    googleAuth(): null;
    googleCallback(request: Request, response: Response): Promise<void>;
    logout(response: Response): {
        ok: boolean;
    };
    me(request: Request): Promise<{
        user: ({
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
        }) | null;
    }>;
}

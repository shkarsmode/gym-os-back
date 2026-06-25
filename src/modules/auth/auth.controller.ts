import { Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Get("google")
    @UseGuards(AuthGuard("google"))
    googleAuth() {
        return null;
    }

    @Get("google/callback")
    @UseGuards(AuthGuard("google"))
    async googleCallback(@Req() request: Request, @Res() response: Response) {
        const user = await this.authService.upsertGoogleUser(request.user as any);
        this.authService.attachSessionCookie(response, user);
        return response.redirect(process.env.FRONTEND_URL || "/");
    }

    @Post("logout")
    logout(@Res({ passthrough: true }) response: Response) {
        this.authService.clearSessionCookie(response);
        return { ok: true };
    }

    @Get("me")
    async me(@Req() request: Request) {
        const user = await this.authService.readUserFromRequest(request);
        return { user };
    }
}

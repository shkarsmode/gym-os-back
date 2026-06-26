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
        // Also hand the token to the SPA in the URL fragment so iOS Safari (which
        // blocks the cross-site cookie) can authenticate via Bearer header. The
        // fragment is not sent to servers/logs and the SPA strips it immediately.
        const token = this.authService.createSessionToken(user);
        const frontend = (process.env.FRONTEND_URL || "/").split(",")[0].trim().replace(/\/$/, "");
        return response.redirect(`${frontend}/#token=${encodeURIComponent(token)}`);
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

import { BadRequestException, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Request, Response } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { isSuperAdminUser } from "../../shared/admin";
import { CurrentUser, RequestUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { AuthService } from "./auth.service";
import { GoogleAuthGuard } from "./google-auth.guard";

@Controller("auth")
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly prisma: PrismaService
    ) {}

    @Get("google")
    @UseGuards(GoogleAuthGuard)
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
        // The impersonation banner has to survive a reload, so the session state — not
        // just the user — is part of the answer.
        const payload = await this.authService.readTokenPayload(request);
        const impersonatedBy = payload?.imp || null;
        return {
            user,
            impersonation: impersonatedBy
                ? { active: true, adminId: impersonatedBy, adminEmail: payload?.impEmail || null }
                : { active: false }
        };
    }

    // ---- Admin impersonation ("view as user") --------------------------------
    // Owner-only support tool: act inside a member's account to reproduce what they
    // see. Deliberately narrow:
    //   * only a SUPER-admin (owner email / ADMIN_EMAILS) may start it — a member
    //     promoted to role "admin" through the panel cannot, so the panel can never
    //     be used to take over the owner's account;
    //   * no chaining — an impersonated session cannot start another one;
    //   * the issued token carries the TARGET's identity, so quotas, ownership and
    //     role are all theirs: impersonation grants no extra power, only reach;
    //   * it expires by itself (60 min).
    // MUST stay above @Post("impersonate/:userId") — Nest matches in declaration
    // order, so a later literal route is swallowed by the earlier param route.
    @Post("impersonate/stop")
    @UseGuards(JwtAuthGuard)
    async stopImpersonation(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
        const payload = await this.authService.readTokenPayload(request);
        if (!payload?.imp) {
            throw new BadRequestException("Not an impersonation session");
        }
        const admin = await this.prisma.user.findUnique({
            where: { id: payload.imp },
            select: { id: true, email: true, displayName: true }
        });
        if (!admin) {
            throw new NotFoundException("Admin account not found");
        }
        const token = this.authService.createSessionToken(admin);
        this.authService.attachTokenCookie(response, token);
        return { ok: true, token, user: admin };
    }

    @Post("impersonate/:userId")
    @UseGuards(JwtAuthGuard)
    async impersonate(
        @CurrentUser() actor: RequestUser,
        @Param("userId") userId: string,
        @Res({ passthrough: true }) response: Response
    ) {
        if (actor?.impersonatedBy) {
            throw new BadRequestException("Already impersonating — stop the current session first");
        }
        if (!isSuperAdminUser(actor)) {
            throw new ForbiddenException("Owner access required");
        }
        if (actor.id === userId) {
            throw new BadRequestException("Cannot impersonate yourself");
        }
        const target = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, displayName: true }
        });
        if (!target) {
            throw new NotFoundException("User not found");
        }
        const token = this.authService.createImpersonationToken(target, { id: actor.id, email: actor.email });
        this.authService.attachTokenCookie(response, token, 60 * 60 * 1000);
        // eslint-disable-next-line no-console
        console.warn(`[impersonation] ${actor.email} -> ${target.email} (${target.id})`);
        return { ok: true, token, user: target };
    }

}

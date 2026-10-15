import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Response, Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { isAdminUser } from "../../shared/admin";
import { SESSION_TTL_MS, SessionClaims, shouldRenewSession } from "./session";

// Impersonation sessions expire on their own so a forgotten one cannot linger.
const IMPERSONATION_TTL = "60m";

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
                // New accounts wait for admin approval; admins are auto-approved.
                approved: isAdminUser({ email: profile.email }),
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

    createSessionToken(user: { id: string; email: string; displayName: string }) {
        return this.jwtService.sign({
            sub: user.id,
            email: user.email,
            displayName: user.displayName
        });
    }

    // A session that ACTS AS `target` while recording which super-admin is behind it.
    // Deliberately short-lived: a forgotten impersonation session dies on its own.
    createImpersonationToken(
        target: { id: string; email: string; displayName: string },
        admin: { id: string; email: string }
    ) {
        return this.jwtService.sign(
            {
                sub: target.id,
                email: target.email,
                displayName: target.displayName,
                imp: admin.id,
                impEmail: admin.email
            },
            { expiresIn: IMPERSONATION_TTL }
        );
    }

    attachSessionCookie(response: Response, user: { id: string; email: string; displayName: string }) {
        this.attachTokenCookie(response, this.createSessionToken(user));
    }

    attachTokenCookie(response: Response, token: string, maxAgeMs = SESSION_TTL_MS) {
        response.cookie("gymos_session", token, { ...this.sessionCookieAttributes(), maxAge: maxAgeMs });
    }

    // Shared by set and clear: a cookie set as SameSite=None; Secure is cleared with the
    // same attributes, so logging out cannot leave a half-year session behind it.
    private sessionCookieAttributes() {
        const isProduction = process.env.NODE_ENV === "production";
        return {
            httpOnly: true,
            sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
            secure: isProduction,
            path: "/"
        };
    }

    // Raw claims of the presented token — the only way to see the `imp` claim, since
    // readUserFromRequest resolves to the impersonated user and drops it.
    async readTokenPayload(request: Request): Promise<(SessionClaims & { impEmail?: string }) | null> {
        const header = request.headers?.authorization || "";
        const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
        const token = request.cookies?.gymos_session || bearer;
        if (!token) {
            return null;
        }
        try {
            return await this.jwtService.verifyAsync<SessionClaims & { impEmail?: string }>(token, {
                secret: process.env.JWT_SECRET || "development-only-secret"
            });
        } catch (error) {
            return null;
        }
    }

    /**
     * A fresh half-year token for the session this request presented, already set as the
     * cookie — or null when it does not need one yet (see shouldRenewSession). The caller
     * hands the token to the SPA too, whose Bearer copy is what iOS actually sends.
     */
    renewSession(response: Response, claims: SessionClaims | null, user: { id: string; email: string; displayName: string } | null): string | null {
        if (!user || !shouldRenewSession(claims) || claims?.sub !== user.id) {
            return null;
        }
        const token = this.createSessionToken(user);
        this.attachTokenCookie(response, token);
        return token;
    }

    clearSessionCookie(response: Response) {
        response.clearCookie("gymos_session", this.sessionCookieAttributes());
    }

    async readUserFromRequest(request: Request) {
        const header = request.headers?.authorization || "";
        const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
        const token = request.cookies?.gymos_session || bearer;
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

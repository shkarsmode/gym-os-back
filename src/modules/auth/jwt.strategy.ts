import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
    constructor(private readonly prisma: PrismaService) {
        super({
            jwtFromRequest: ExtractJwt.fromExtractors([
                (request) => request?.cookies?.gymos_session || null,
                // Bearer fallback: iOS Safari blocks cross-site cookies between the
                // *.vercel.app subdomains (ITP), so the SPA also sends the token here.
                ExtractJwt.fromAuthHeaderAsBearerToken()
            ]),
            secretOrKey: process.env.JWT_SECRET || "development-only-secret"
        });
    }

    async validate(payload: { sub: string; email: string; displayName: string }) {
        // Read the fresh approval flag so admin approval takes effect without re-login.
        const dbUser = await this.prisma.user.findUnique({
            where: { id: payload.sub },
            select: { approved: true }
        });
        return {
            id: payload.sub,
            email: payload.email,
            displayName: payload.displayName,
            approved: dbUser?.approved ?? false
        };
    }
}

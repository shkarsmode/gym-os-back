import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
    constructor() {
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

    validate(payload: { sub: string; email: string; displayName: string }) {
        return {
            id: payload.sub,
            email: payload.email,
            displayName: payload.displayName
        };
    }
}

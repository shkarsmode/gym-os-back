import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { jwtSecret } from "../modules/auth/jwt-secret";

// Lightweight per-identity request throttle — an abuse backstop, intentionally
// generous so it never trips during normal use. Keyed by user id from the session
// JWT so people sharing one public IP (gym / office wifi) aren't throttled together;
// falls back to IP for anonymous requests. The token's signature IS verified: with an
// unchecked `sub`, every made-up token got a fresh bucket and the limit meant nothing.
// In-memory + per-instance, so it's a soft guard rather than a hard quota.
const verifier = new JwtService({ secret: jwtSecret() });
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 200;
const hits = new Map<string, number[]>();
let lastPrune = 0;

@Injectable()
export class ThrottleGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        try {
            const request = context.switchToHttp().getRequest();
            const now = Date.now();

            // Bound memory: drop stale buckets roughly once per window.
            if (now - lastPrune > WINDOW_MS) {
                lastPrune = now;
                for (const [key, stamps] of hits) {
                    const recent = stamps.filter((stamp) => now - stamp < WINDOW_MS);
                    if (recent.length) {
                        hits.set(key, recent);
                    } else {
                        hits.delete(key);
                    }
                }
            }

            const key = identify(request);
            const stamps = (hits.get(key) || []).filter((stamp) => now - stamp < WINDOW_MS);
            stamps.push(now);
            hits.set(key, stamps);

            if (stamps.length > MAX_REQUESTS) {
                throw new HttpException(
                    { code: "RATE_LIMIT", message: "Забагато запитів за коротку мить. Зачекай кілька секунд." },
                    HttpStatus.TOO_MANY_REQUESTS
                );
            }
            return true;
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            return true; // never break the API over a throttle bug
        }
    }
}

function identify(request: any): string {
    try {
        let token: string = request?.cookies?.gymos_session || "";
        if (!token) {
            const auth = String(request?.headers?.authorization || "");
            if (auth.startsWith("Bearer ")) {
                token = auth.slice(7);
            }
        }
        if (token) {
            const payload = verifier.verify<{ sub?: string }>(token);
            if (payload?.sub) {
                return "u:" + payload.sub;
            }
        }
    } catch (error) {
        // fall through to IP keying
    }
    const forwarded = String(request?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
    return "ip:" + (forwarded || request?.ip || request?.socket?.remoteAddress || "anon");
}

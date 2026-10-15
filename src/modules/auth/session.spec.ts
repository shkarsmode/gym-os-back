import { JwtService } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { SESSION_RENEW_AFTER_MS, SESSION_TTL, SESSION_TTL_MS, shouldRenewSession } from "./session";

/**
 * Sign-in used to last 14 days from the moment of login and was never renewed, so the
 * app signed everyone out a fortnight later however often they used it. A session now
 * lasts half a year and slides forward when the app starts — except an impersonation
 * session, which must keep dying after 60 minutes.
 */
const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 15, 12, 0, 0);
const iatAgo = (ms: number) => Math.floor((now - ms) / 1000);

describe("shouldRenewSession", () => {
    it("renews a session that is a day old", () => {
        expect(shouldRenewSession({ sub: "u1", iat: iatAgo(SESSION_RENEW_AFTER_MS) }, now)).toBe(true);
        expect(shouldRenewSession({ sub: "u1", iat: iatAgo(13 * DAY) }, now)).toBe(true);
    });

    it("leaves a fresh one alone — no new token on every request", () => {
        expect(shouldRenewSession({ sub: "u1", iat: iatAgo(60 * 60 * 1000) }, now)).toBe(false);
    });

    it("never renews an impersonation session", () => {
        expect(shouldRenewSession({ sub: "u1", imp: "admin", iat: iatAgo(10 * DAY) }, now)).toBe(false);
    });

    it("refuses anything it cannot date or attribute", () => {
        expect(shouldRenewSession({ sub: "u1" }, now)).toBe(false);
        expect(shouldRenewSession({ sub: "", iat: iatAgo(10 * DAY) }, now)).toBe(false);
        expect(shouldRenewSession(null, now)).toBe(false);
    });
});

describe("session lifetime", () => {
    it("signs tokens that last half a year", () => {
        const jwt = new JwtService({ secret: "test-secret", signOptions: { expiresIn: SESSION_TTL } });
        const claims = jwt.decode(jwt.sign({ sub: "u1" })) as { iat: number; exp: number };
        expect(claims.exp - claims.iat).toBe(180 * 24 * 60 * 60);
        expect(SESSION_TTL_MS).toBe(180 * DAY);
    });
});

describe("AuthService.renewSession", () => {
    const jwt = new JwtService({ secret: "test-secret", signOptions: { expiresIn: SESSION_TTL } });
    const auth = new AuthService({} as never, jwt);
    const user = { id: "u1", email: "a@b.c", displayName: "A" };
    const fakeResponse = () => {
        const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
        return { cookies, response: { cookie: (name: string, value: string, options: Record<string, unknown>) => cookies.push({ name, value, options }) } as never };
    };

    it("issues a fresh half-year token and sets it as the cookie", () => {
        const { cookies, response } = fakeResponse();
        const token = auth.renewSession(response, { sub: "u1", iat: Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60 }, user);
        expect(typeof token).toBe("string");
        expect((jwt.decode(token!) as { sub: string }).sub).toBe("u1");
        expect(cookies).toHaveLength(1);
        expect(cookies[0]).toMatchObject({ name: "gymos_session", value: token, options: { httpOnly: true, maxAge: SESSION_TTL_MS } });
    });

    it("logs out with the same cookie attributes it logged in with", () => {
        const previous = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";
        try {
            const set: Record<string, unknown>[] = [];
            const cleared: Record<string, unknown>[] = [];
            const response = {
                cookie: (_name: string, _value: string, options: Record<string, unknown>) => set.push(options),
                clearCookie: (_name: string, options: Record<string, unknown>) => cleared.push(options)
            } as never;
            auth.attachTokenCookie(response, "t");
            auth.clearSessionCookie(response);
            const { maxAge, ...attributes } = set[0];
            expect(maxAge).toBe(SESSION_TTL_MS);
            expect(attributes).toEqual({ httpOnly: true, sameSite: "none", secure: true, path: "/" });
            expect(cleared[0]).toEqual(attributes);
        } finally {
            process.env.NODE_ENV = previous;
        }
    });

    it("does nothing for a fresh session, an impersonation, or someone else's claims", () => {
        const { cookies, response } = fakeResponse();
        const recent = Math.floor(Date.now() / 1000) - 60;
        const old = Math.floor(Date.now() / 1000) - 3 * 24 * 60 * 60;
        expect(auth.renewSession(response, { sub: "u1", iat: recent }, user)).toBeNull();
        expect(auth.renewSession(response, { sub: "u1", iat: old, imp: "admin" }, user)).toBeNull();
        expect(auth.renewSession(response, { sub: "u2", iat: old }, user)).toBeNull();
        expect(auth.renewSession(response, { sub: "u1", iat: old }, null)).toBeNull();
        expect(cookies).toHaveLength(0);
    });
});

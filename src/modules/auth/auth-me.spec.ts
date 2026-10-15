import { JwtService } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SESSION_TTL, SESSION_TTL_MS } from "./session";

/**
 * GET /auth/me end to end through the controller: it is called on every app start, and it
 * is where a half-year session slides forward — the renewed token comes back both as the
 * cookie and in the body (the Bearer copy is what iOS sends).
 */
const SECRET = process.env.JWT_SECRET || "development-only-secret";
const user = { id: "u1", email: "member@example.com", displayName: "Member", profile: null };

function setup() {
    const jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: SESSION_TTL } });
    const prisma = { user: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === user.id ? user : null) } };
    const auth = new AuthService(prisma as never, jwt);
    const controller = new AuthController(auth, prisma as never);
    const cookies: Array<{ value: string; options: Record<string, unknown> }> = [];
    const response = { cookie: (_name: string, value: string, options: Record<string, unknown>) => cookies.push({ value, options }) };
    const request = (token?: string) => ({ headers: token ? { authorization: `Bearer ${token}` } : {}, cookies: {} });
    const tokenAged = (seconds: number) => jwt.sign({ sub: user.id, email: user.email, displayName: user.displayName, iat: Math.floor(Date.now() / 1000) - seconds });
    return { jwt, controller, cookies, response, request, tokenAged };
}

describe("GET /auth/me", () => {
    it("slides a day-old session forward by half a year", async () => {
        const { jwt, controller, cookies, response, request, tokenAged } = setup();
        const body = await controller.me(request(tokenAged(2 * 24 * 60 * 60)) as never, response as never) as { user: unknown; token?: string };
        expect(body.user).toEqual(user);
        expect(typeof body.token).toBe("string");
        const claims = jwt.decode(body.token!) as { sub: string; iat: number; exp: number };
        expect(claims.sub).toBe(user.id);
        expect(claims.exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(179 * 24 * 60 * 60);
        expect(cookies).toEqual([{ value: body.token, options: expect.objectContaining({ maxAge: SESSION_TTL_MS, httpOnly: true }) }]);
    });

    it("answers a fresh session without minting a new token", async () => {
        const { controller, cookies, response, request, tokenAged } = setup();
        const body = await controller.me(request(tokenAged(60)) as never, response as never) as { user: unknown; token?: string };
        expect(body.user).toEqual(user);
        expect(body).not.toHaveProperty("token");
        expect(cookies).toHaveLength(0);
    });

    it("renews nothing for a signed-out request", async () => {
        const { controller, cookies, response, request } = setup();
        const body = await controller.me(request() as never, response as never) as { user: unknown; token?: string };
        expect(body.user).toBeNull();
        expect(body).not.toHaveProperty("token");
        expect(cookies).toHaveLength(0);
    });
});

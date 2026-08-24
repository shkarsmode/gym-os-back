import { Controller, Get, NotFoundException, Query, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { canAssumeAccount, configuredAdminEmails, devLoginAllowed } from "../../shared/dev-environment";
import { AuthService } from "./auth.service";

/**
 * Signing in to the DEVELOPMENT environment without Google.
 *
 * Dev has its own domain, which means its own OAuth redirect URI, which means a change in
 * a Google Cloud project that nobody working on the app can necessarily make. That put the
 * whole dev environment behind somebody else's console — and dev is precisely where you
 * want to be able to log in as eight different people in a row to see how the feed reads.
 *
 * So this mints the same session the Google callback does: same cookie, same token in the
 * URL fragment, same redirect. The SPA cannot tell the difference and needs no changes.
 *
 * WHY THIS IS NOT A BACKDOOR IN PRODUCTION
 *
 * Three conditions, checked on every request, and a failure of ANY of them returns 404
 * rather than 403 — production must not even admit the route exists:
 *
 *   1. DATABASE_URL's host ends in `-dev`. Production and dev share the database NAME, so
 *      the host is the only honest signal, and it is the same check the dev-life generator
 *      makes. A production deployment can never satisfy it.
 *   2. DEV_LOGIN_SECRET is configured, and is not a token anybody would guess.
 *   3. The caller presents it, in the `x-dev-login` header or as `?secret=`.
 *
 * And even with all three, it will only sign you in as an account that is SAFE to be:
 * one of the generated `dev-` people, or an address already listed in ADMIN_EMAILS. It
 * cannot be pointed at an arbitrary email to manufacture an identity.
 *
 * The `?secret=` form is offered because typing a URL is the whole point of the
 * convenience, and it lands in the proxy's access log. That is an acceptable trade for a
 * credential that only opens synthetic accounts on a throwaway host — it would not be for
 * anything else, and this secret must never be reused elsewhere.
 */
@Controller("auth")
export class DevLoginController {
    constructor(
        private readonly authService: AuthService,
        private readonly prisma: PrismaService
    ) {}

    @Get("dev-login")
    async devLogin(
        @Req() request: Request,
        @Res() response: Response,
        @Query("user") userId?: string,
        @Query("email") email?: string,
        @Query("secret") secret?: string
    ) {
        this.assertDevEnvironment(request, secret);

        // No target named: show the roster instead of failing. Picking a person to be is
        // the actual task, and making somebody guess ids for it would be silly.
        if (!userId && !email) {
            const offered = String(request.header("x-dev-login") || secret || "");
            response.type("html").send(await this.rosterPage(offered));
            return;
        }

        const user = await this.resolveTarget(userId, email);
        this.authService.attachSessionCookie(response, user);
        const token = this.authService.createSessionToken(user);
        const frontend = (process.env.FRONTEND_URL || "/").split(",")[0].trim().replace(/\/$/, "");
        response.redirect(`${frontend}/#token=${encodeURIComponent(token)}`);
    }

    private assertDevEnvironment(request: Request, secret?: string): void {
        const offered = request.header("x-dev-login") || secret;
        if (!devLoginAllowed(process.env.DATABASE_URL, process.env.DEV_LOGIN_SECRET, offered)) {
            // 404 rather than 403, and one error for every possible failure: a distinct
            // message per condition would tell an unauthenticated caller which part they
            // got right, and production must not admit the route exists at all.
            throw new NotFoundException("Cannot GET /auth/dev-login");
        }
    }

    /**
     * Only two kinds of account can be assumed, and neither can be conjured.
     *
     * A generated person, or an address that is ALREADY an administrator of this
     * deployment. Anything else is refused — otherwise the secret alone would be enough to
     * invent an identity, and the point of the allow-list is that it is not.
     */
    private async resolveTarget(userId?: string, email?: string) {
        if (userId) {
            if (!userId.startsWith("dev-")) {
                throw new NotFoundException("Only generated dev- accounts can be assumed by id");
            }
            const found = await this.prisma.user.findUnique({ where: { id: userId } });
            if (!found) {
                throw new NotFoundException(`No such generated account: ${userId}`);
            }
            return found;
        }

        const wanted = String(email || "").trim().toLowerCase();
        const admins = configuredAdminEmails(process.env.ADMIN_EMAILS, process.env.DEMO_OWNER_EMAIL);
        const existing = await this.prisma.user.findUnique({ where: { email: wanted } });
        if (existing) {
            if (!canAssumeAccount(existing, admins)) {
                throw new NotFoundException("That account is not a generated one and not an administrator");
            }
            return existing;
        }
        if (!admins.includes(wanted)) {
            throw new NotFoundException("That account is not a generated one and not an administrator");
        }
        // The owner has no account on a freshly provisioned dev database. Creating it here
        // is the one case worth allowing, because the alternative is having nobody who can
        // see the admin surfaces at all.
        return this.prisma.user.create({
            data: {
                email: wanted,
                displayName: wanted.split("@")[0],
                approved: true,
                role: "admin",
                privacyChoiceAt: new Date()
            }
        });
    }

    /** A plain roster: click a person, become them. Deliberately ugly and obvious. */
    private async rosterPage(secret: string): Promise<string> {
        const people = await this.prisma.user.findMany({
            where: { id: { startsWith: "dev-" } },
            orderBy: { id: "asc" },
            take: 120,
            select: { id: true, displayName: true, role: true, hideWorkoutDetails: true }
        });
        const admins = configuredAdminEmails(process.env.ADMIN_EMAILS, process.env.DEMO_OWNER_EMAIL);
        const escape = (value: string) => value.replace(/[&<>"]/g, (char) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char] as string));
        // The secret came in on this request, so keep it on the links — otherwise every
        // row would need it pasted again.
        const rows = people.map((person) => `<a href="?user=${encodeURIComponent(person.id)}&secret=${encodeURIComponent(secret)}">
            <b>${escape(person.displayName)}</b>
            <span>${escape(person.id)}</span>
            <em>${person.role === "pro" ? "PRO" : "free"}${person.hideWorkoutDetails ? " · приватний" : ""}</em>
        </a>`).join("");
        const adminRows = admins.map((address) => `<a href="?email=${encodeURIComponent(address)}&secret=${encodeURIComponent(secret)}">
            <b>${escape(address)}</b><span>адміністратор</span><em>admin</em></a>`).join("");
        return `<!doctype html><meta charset="utf-8"><title>dev login</title>
<style>
 body{font:14px/1.5 system-ui,sans-serif;background:#111;color:#eee;margin:0;padding:24px}
 h1{font-size:18px;margin:0 0 4px} p{color:#888;margin:0 0 20px}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}
 a{display:flex;gap:4px;flex-direction:column;padding:10px 12px;border:1px solid #333;border-radius:8px;
   text-decoration:none;color:#eee;background:#1a1a1a}
 a:hover{border-color:#6cf;background:#20262b}
 span{color:#777;font-size:12px} em{color:#6cf;font-style:normal;font-size:11px}
 h2{font-size:13px;text-transform:uppercase;color:#888;margin:24px 0 8px;letter-spacing:.05em}
</style>
<h1>Вхід у dev без Google</h1>
<p>Обери, ким зайти. Це середовище розробки — усі акаунти нижче згенеровані.</p>
<h2>Адміністратор</h2><div class="grid">${adminRows}</div>
<h2>Згенеровані (${people.length})</h2><div class="grid">${rows}</div>`;
    }
}

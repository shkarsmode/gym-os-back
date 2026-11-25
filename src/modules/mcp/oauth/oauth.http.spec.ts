import { Global, INestApplication, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../../../prisma/prisma.service";
import { configureApp } from "../../../shared/configure-app";
import { McpModule } from "../mcp.module";
import { pkceChallenge, randomToken } from "./crypto";
import { GoogleRedirector } from "./google";
import { McpOAuthService } from "./oauth.service";
import { MemoryOAuthStore, OAuthStore } from "./oauth.store";

const ISSUER = "http://localhost:3999";
const CLAUDE = "https://claude.ai/api/mcp/auth_callback";
const OWNER = { id: "user-owner", email: "owner@example.com", displayName: "Owner", approved: true, role: "free" };

const prisma = {
    $executeRawUnsafe: async () => 0,
    user: { findUnique: async ({ where }: any) => (where.id === OWNER.id || where.googleId === "google-owner" ? OWNER : null) },
    oAuthAccount: { findUnique: async ({ where }: any) => (where.provider_providerAccountId.providerAccountId === "google-owner" ? { user: OWNER } : null) },
    workout: { findMany: async () => [], findUnique: async () => null, count: async () => 0 },
    exercise: { findMany: async () => [] },
    mcpAuditLog: { findMany: async () => [], create: async () => ({}) },
    userBodyweightEntry: { findMany: async () => [] }
};

@Global()
@Module({ providers: [{ provide: PrismaService, useValue: prisma }], exports: [PrismaService] })
class FakePrismaModule {}

let app: INestApplication;
let base: string;
let oauth: McpOAuthService;

beforeAll(async () => {
    process.env.MCP_PUBLIC_URL = ISSUER;
    process.env.MCP_ALLOWED_EMAILS = OWNER.email;
    const moduleRef = await Test.createTestingModule({ imports: [FakePrismaModule, McpModule] })
        .overrideProvider(OAuthStore).useValue(new MemoryOAuthStore())
        .overrideProvider(GoogleRedirector).useValue({
            redirect: (_request: any, response: any, state: string) => response.redirect(302, `https://accounts.google.test/auth?state=${encodeURIComponent(state)}`)
        })
        .compile();
    app = moduleRef.createNestApplication({ bodyParser: false, logger: false });
    configureApp(app);
    await app.listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    oauth = app.get(McpOAuthService);
});

afterAll(async () => {
    await app?.close();
    delete process.env.MCP_PUBLIC_URL;
    delete process.env.MCP_ALLOWED_EMAILS;
});

function form(values: Record<string, string>) {
    return { "content-type": "application/x-www-form-urlencoded", body: new URLSearchParams(values).toString() };
}

async function post(path: string, values: Record<string, string>, headers: Record<string, string> = {}) {
    const { body, ...type } = form(values);
    return fetch(`${base}${path}`, { method: "POST", headers: { ...type, ...headers }, body, redirect: "manual" });
}

async function rpc(token: string | null, method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
    return fetch(`${base}/mcp`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "mcp-protocol-version": "2025-11-25",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...headers
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
    });
}

async function connect(decision: "write" | "read") {
    const registered = await fetch(`${base}/mcp/oauth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_name: "Claude", redirect_uris: [CLAUDE], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"] })
    });
    expect(registered.status).toBe(201);
    const { client_id } = await registered.json();

    const verifier = randomToken(48);
    const query = new URLSearchParams({
        client_id,
        redirect_uri: CLAUDE,
        response_type: "code",
        code_challenge: pkceChallenge(verifier),
        code_challenge_method: "S256",
        scope: "gymos.read gymos.write",
        resource: `${ISSUER}/mcp`,
        state: "xyz"
    });
    const authorize = await fetch(`${base}/mcp/oauth/authorize?${query}`, { redirect: "manual" });
    expect(authorize.status).toBe(302);
    const google = new URL(authorize.headers.get("location") || "");
    expect(google.host).toBe("accounts.google.test");
    const cookie = (authorize.headers.get("set-cookie") || "").split(";")[0];
    expect(cookie).toMatch(/^gymos_mcp_auth=/);
    expect(authorize.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(authorize.headers.get("set-cookie")).toMatch(/SameSite=Lax/i);

    const login = await oauth.finishGoogleLogin(google.searchParams.get("state") || "", decodeURIComponent(cookie.split("=")[1]), { googleId: "google-owner", emailVerified: true });
    expect(login.kind).toBe("redirect");
    const consentPath = (login as { location: string }).location;

    const page = await fetch(`${base}${consentPath}`, { headers: { cookie } });
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(page.headers.get("referrer-policy")).toBe("same-origin");
    const html = await page.text();
    expect(html).toContain(OWNER.email);
    const csrf = /name="csrf" value="([^"]+)"/.exec(html)?.[1] || "";
    const requestId = /name="request" value="([^"]+)"/.exec(html)?.[1] || "";

    const decided = await post("/mcp/oauth/consent", { request: requestId, csrf, decision }, { cookie, origin: ISSUER });
    expect(decided.status).toBe(302);
    const callback = new URL(decided.headers.get("location") || "");
    expect(`${callback.origin}${callback.pathname}`).toBe(CLAUDE);
    expect(callback.searchParams.get("state")).toBe("xyz");
    expect(callback.searchParams.get("iss")).toBe(ISSUER);

    const token = await post("/mcp/oauth/token", {
        grant_type: "authorization_code",
        client_id,
        code: callback.searchParams.get("code") || "",
        code_verifier: verifier,
        redirect_uri: CLAUDE,
        resource: `${ISSUER}/mcp`
    });
    expect(token.status).toBe(200);
    expect(token.headers.get("cache-control")).toBe("no-store");
    return { client_id, tokens: await token.json() };
}

describe("MCP over HTTP", () => {
    it("publishes discovery metadata with open CORS", async () => {
        const resource = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`, { headers: { origin: "http://127.0.0.1:6274" } });
        expect(resource.status).toBe(200);
        expect(resource.headers.get("access-control-allow-origin")).toBe("*");
        expect(await resource.json()).toMatchObject({ resource: `${ISSUER}/mcp`, authorization_servers: [ISSUER] });
        const server = await fetch(`${base}/.well-known/oauth-authorization-server`);
        expect(await server.json()).toMatchObject({ issuer: ISSUER, token_endpoint: `${ISSUER}/mcp/oauth/token` });
    });

    it("answers 401 with a WWW-Authenticate challenge and no data", async () => {
        const anonymous = await rpc(null, "tools/list");
        expect(anonymous.status).toBe(401);
        expect(anonymous.headers.get("www-authenticate")).toBe(`Bearer resource_metadata="${ISSUER}/.well-known/oauth-protected-resource/mcp", scope="gymos.read gymos.write"`);
        expect(await anonymous.json()).toEqual({ error: "invalid_request", error_description: "Authorization required" });

        const forged = await rpc("gma_forged", "tools/list");
        expect(forged.status).toBe(401);
        expect(forged.headers.get("www-authenticate")).toContain('error="invalid_token"');
    });

    it("refuses browser requests from a foreign origin and GET on /mcp", async () => {
        const foreign = await rpc(null, "tools/list", {}, { origin: "https://evil.example" });
        expect(foreign.status).toBe(403);
        const get = await fetch(`${base}/mcp`);
        expect(get.status).toBe(405);
    });

    it("answers CORS preflight for the token endpoint", async () => {
        const preflight = await fetch(`${base}/mcp/oauth/token`, { method: "OPTIONS", headers: { origin: "http://127.0.0.1:6274", "access-control-request-method": "POST" } });
        expect(preflight.status).toBe(204);
        expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    });

    it("runs the whole OAuth flow and serves tools to the token", async () => {
        const { tokens } = await connect("write");
        expect(tokens.scope).toBe("gymos.read gymos.write");

        const initialize = await rpc(tokens.access_token, "initialize", {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "jest", version: "1.0.0" }
        });
        expect(initialize.status).toBe(200);
        const init = await initialize.json();
        expect(init.result.serverInfo.name).toBe("gymos");
        expect(init.result.instructions).toContain("YYYY-MM-DD");

        const list = await (await rpc(tokens.access_token, "tools/list")).json();
        const names = list.result.tools.map((tool: { name: string }) => tool.name);
        expect(names).toEqual(expect.arrayContaining([
            "list_workouts", "get_workout", "get_exercise_history", "search_exercises", "get_bodyweight", "list_templates", "list_changes",
            "create_planned_workout", "copy_weekday_workout", "update_planned_workout", "log_set", "add_bodyweight", "delete_planned_workout"
        ]));

        const call = await (await rpc(tokens.access_token, "tools/call", { name: "list_workouts", arguments: {} })).json();
        expect(call.result.content[0].text).toMatch(/^No workouts/);
    });

    it("hides write tools from a read-only token", async () => {
        const { tokens } = await connect("read");
        expect(tokens.scope).toBe("gymos.read");
        const list = await (await rpc(tokens.access_token, "tools/list")).json();
        const names = list.result.tools.map((tool: { name: string }) => tool.name);
        expect(names).toContain("get_workout");
        expect(names).not.toContain("create_planned_workout");
        expect(names).not.toContain("log_set");
    });

    it("refreshes with a form-encoded request and rejects the old refresh token later", async () => {
        const { client_id, tokens } = await connect("write");
        const refreshed = await post("/mcp/oauth/token", { grant_type: "refresh_token", client_id, refresh_token: tokens.refresh_token });
        expect(refreshed.status).toBe(200);
        const next = await refreshed.json();
        expect(next.access_token).not.toBe(tokens.access_token);
        expect((await rpc(next.access_token, "tools/list")).status).toBe(200);

        const unknown = await post("/mcp/oauth/token", { grant_type: "refresh_token", client_id, refresh_token: "gmr_unknown" });
        expect(unknown.status).toBe(400);
        expect(await unknown.json()).toMatchObject({ error: "invalid_grant" });
    });

    it("revoke-all needs a bearer GymOS session, not a cookie", async () => {
        const response = await fetch(`${base}/mcp/oauth/revoke-all`, { method: "POST", headers: { cookie: "gymos_session=anything" } });
        expect(response.status).toBe(401);
    });
});

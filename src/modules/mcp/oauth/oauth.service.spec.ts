import { JwtService } from "@nestjs/jwt";
import { loadMcpConfig } from "../mcp.config";
import { pkceChallenge, randomToken } from "./crypto";
import { McpOAuthService, OAuthError } from "./oauth.service";
import { MemoryOAuthStore } from "./oauth.store";

const ISSUER = "https://gymos.example";
const RESOURCE = `${ISSUER}/mcp`;
const CLAUDE = "https://claude.ai/api/mcp/auth_callback";
const OWNER = { id: "user-owner", email: "owner@example.com", displayName: "Owner", approved: true, role: "free" };
const STRANGER = { id: "user-stranger", email: "stranger@example.com", displayName: "Stranger", approved: true, role: "free" };

function setup(env: Record<string, string> = {}) {
    const config = loadMcpConfig({ MCP_PUBLIC_URL: ISSUER, MCP_ALLOWED_EMAILS: OWNER.email, ...env } as NodeJS.ProcessEnv);
    const store = new MemoryOAuthStore();
    const users = new Map([[OWNER.id, { ...OWNER }], [STRANGER.id, { ...STRANGER }]]);
    const links = new Map([["google-owner", OWNER.id], ["google-stranger", STRANGER.id]]);
    const writes: string[] = [];
    const prisma = {
        user: {
            findUnique: async ({ where }: any) => {
                const id = where.id || (where.googleId ? links.get(where.googleId) : undefined);
                return (id && users.get(id)) || null;
            },
            upsert: async () => writes.push("user.upsert"),
            update: async () => writes.push("user.update"),
            create: async () => writes.push("user.create")
        },
        oAuthAccount: {
            findUnique: async ({ where }: any) => {
                const id = links.get(where.provider_providerAccountId.providerAccountId);
                return id ? { user: users.get(id) } : null;
            },
            create: async () => writes.push("oAuthAccount.create")
        }
    };
    const service = new McpOAuthService(config, store, prisma as never);
    return { service, store, users, writes, config };
}

async function register(service: McpOAuthService, body: Record<string, unknown> = {}) {
    return service.registerClient({ redirect_uris: [CLAUDE], token_endpoint_auth_method: "none", client_name: "Claude", ...body });
}

async function authorize(service: McpOAuthService, clientId: string, overrides: Record<string, unknown> = {}) {
    const verifier = randomToken(48);
    const binding = randomToken(24);
    const result = await service.startAuthorization({
        client_id: clientId,
        redirect_uri: CLAUDE,
        response_type: "code",
        code_challenge: pkceChallenge(verifier),
        code_challenge_method: "S256",
        scope: "gymos.read gymos.write",
        resource: RESOURCE,
        state: "claude-state",
        ...overrides
    }, binding);
    return { result, verifier, binding };
}

async function codeFor(service: McpOAuthService, clientId: string, decision = "write", googleId = "google-owner") {
    const { result, verifier, binding } = await authorize(service, clientId);
    if (result.kind !== "login") {
        throw new Error(`expected login, got ${result.kind}`);
    }
    const login = await service.finishGoogleLogin(`mcp.${result.requestId}`, binding, { googleId, emailVerified: true });
    if (login.kind !== "redirect") {
        throw new Error(`expected consent redirect, got ${JSON.stringify(login)}`);
    }
    const consent = await service.prepareConsent(result.requestId, binding);
    if (consent.kind !== "consent") {
        throw new Error("expected consent page");
    }
    const decided = await service.decideConsent({ requestId: result.requestId, bindingSecret: binding, csrf: consent.csrf, decision, origin: ISSUER });
    if (decided.kind !== "redirect") {
        throw new Error("expected redirect to the client");
    }
    const url = new URL(decided.location);
    return { url, verifier, code: url.searchParams.get("code") || "" };
}

async function tokensFor(service: McpOAuthService, clientId: string, decision = "write") {
    const { code, verifier } = await codeFor(service, clientId, decision);
    return service.exchangeToken({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: verifier, redirect_uri: CLAUDE, resource: RESOURCE });
}

async function rejects(promise: Promise<unknown>, code: string) {
    await expect(promise).rejects.toMatchObject({ code });
    await promise.catch((error) => expect(error).toBeInstanceOf(OAuthError));
}

describe("MCP OAuth: metadata", () => {
    it("publishes protected resource and authorization server metadata", () => {
        const { service } = setup();
        expect(service.protectedResourceMetadata()).toMatchObject({
            resource: RESOURCE,
            authorization_servers: [ISSUER],
            scopes_supported: ["gymos.read", "gymos.write"]
        });
        const metadata = service.authorizationServerMetadata();
        expect(metadata).toMatchObject({
            issuer: ISSUER,
            authorization_endpoint: `${ISSUER}/mcp/oauth/authorize`,
            token_endpoint: `${ISSUER}/mcp/oauth/token`,
            registration_endpoint: `${ISSUER}/mcp/oauth/register`,
            code_challenge_methods_supported: ["S256"],
            authorization_response_iss_parameter_supported: true
        });
        expect(metadata.scopes_supported).not.toContain("offline_access");
    });

    it("builds a challenge that points at the resource metadata", () => {
        const { service } = setup();
        expect(service.challenge()).toBe(`Bearer resource_metadata="${ISSUER}/.well-known/oauth-protected-resource/mcp", scope="gymos.read gymos.write"`);
        expect(service.challenge({ code: "invalid_token", description: "bad" })).toMatch(/^Bearer error="invalid_token", error_description="bad", resource_metadata=/);
    });

    it("stays disabled without an allowlist", () => {
        const { service } = setup({ MCP_ALLOWED_EMAILS: "" });
        expect(service.enabled).toBe(false);
    });
});

describe("MCP OAuth: dynamic client registration", () => {
    it("registers a public client for Claude's callback", async () => {
        const { service, store } = setup();
        const client = await register(service);
        expect(client.client_id).toMatch(/^mcp-/);
        expect(client).not.toHaveProperty("client_secret");
        expect(store.clients.get(client.client_id)?.secretHash).toBeNull();
    });

    it("stores only a hash of a confidential client's secret", async () => {
        const { service, store } = setup();
        const client = await register(service, { token_endpoint_auth_method: "client_secret_post" });
        expect(typeof client.client_secret).toBe("string");
        expect(store.clients.get(client.client_id)?.secretHash).not.toBe(client.client_secret);
    });

    it("refuses redirect URIs outside the allowlist", async () => {
        const { service } = setup();
        await rejects(register(service, { redirect_uris: ["https://evil.example/callback"] }), "invalid_redirect_uri");
    });

    it("allows loopback redirects only with MCP_ALLOW_LOOPBACK", async () => {
        const inspector = "http://127.0.0.1:6274/oauth/callback";
        await rejects(register(setup().service, { redirect_uris: [inspector] }), "invalid_redirect_uri");
        const client = await register(setup({ MCP_ALLOW_LOOPBACK: "true" }).service, { redirect_uris: [inspector] });
        expect(client.redirect_uris).toEqual([inspector]);
    });

    it("can be switched off for a fixed client", async () => {
        const { service } = setup({ MCP_DCR: "false" });
        await rejects(register(service), "invalid_request");
        expect(service.authorizationServerMetadata()).not.toHaveProperty("registration_endpoint");
    });
});

describe("MCP OAuth: authorization request", () => {
    it("shows an error page for an unknown client or an unregistered redirect", async () => {
        const { service } = setup();
        const unknown = await authorize(service, "mcp-nope");
        expect(unknown.result).toMatchObject({ kind: "page", status: 400 });
        const { client_id } = await register(service);
        const foreign = await authorize(service, client_id, { redirect_uri: "https://claude.ai/other" });
        expect(foreign.result).toMatchObject({ kind: "page", status: 400 });
    });

    it.each([
        ["no PKCE", { code_challenge: undefined }, "invalid_request"],
        ["plain PKCE", { code_challenge_method: "plain" }, "invalid_request"],
        ["an unknown scope", { scope: "gymos.read admin" }, "invalid_scope"],
        ["a foreign resource", { resource: "https://other.example/mcp" }, "invalid_target"],
        ["another response type", { response_type: "token" }, "unsupported_response_type"]
    ])("redirects back with an error for %s", async (_label, overrides, error) => {
        const { service } = setup();
        const { client_id } = await register(service);
        const { result } = await authorize(service, client_id, overrides);
        expect(result.kind).toBe("redirect");
        const url = new URL((result as { location: string }).location);
        expect(url.origin + url.pathname).toBe(CLAUDE);
        expect(url.searchParams.get("error")).toBe(error);
        expect(url.searchParams.get("state")).toBe("claude-state");
        expect(url.searchParams.get("iss")).toBe(ISSUER);
    });

    it("accepts the resource with a trailing slash", async () => {
        const { service } = setup();
        const { client_id } = await register(service);
        const { result } = await authorize(service, client_id, { resource: `${RESOURCE}/` });
        expect(result.kind).toBe("login");
    });
});

describe("MCP OAuth: Google sign-in and consent", () => {
    it("answers 403 to an account outside the allowlist and writes nothing", async () => {
        const { service, writes } = setup();
        const { client_id } = await register(service);
        const { result, binding } = await authorize(service, client_id);
        const requestId = (result as { requestId: string }).requestId;
        const outcome = await service.finishGoogleLogin(`mcp.${requestId}`, binding, { googleId: "google-stranger", emailVerified: true });
        expect(outcome).toMatchObject({ kind: "page", status: 403 });
        expect(writes).toEqual([]);
        expect(await service.prepareConsent(requestId, binding)).toMatchObject({ kind: "page", status: 400 });
    });

    it("refuses an unlinked Google account and an unverified email", async () => {
        const { service } = setup();
        const { client_id } = await register(service);
        const first = await authorize(service, client_id);
        const unlinked = await service.finishGoogleLogin(`mcp.${(first.result as any).requestId}`, first.binding, { googleId: "google-unknown", emailVerified: true });
        expect(unlinked).toMatchObject({ kind: "page", status: 403 });
        const second = await authorize(service, client_id);
        const unverified = await service.finishGoogleLogin(`mcp.${(second.result as any).requestId}`, second.binding, { googleId: "google-owner", emailVerified: false });
        expect(unverified).toMatchObject({ kind: "page", status: 403 });
    });

    it("requires the browser that started the request", async () => {
        const { service } = setup();
        const { client_id } = await register(service);
        const { result } = await authorize(service, client_id);
        const outcome = await service.finishGoogleLogin(`mcp.${(result as any).requestId}`, "another-browser", { googleId: "google-owner", emailVerified: true });
        expect(outcome).toMatchObject({ kind: "page", status: 400 });
    });

    it("sends a cancelled Google sign-in back to Claude as access_denied", async () => {
        const { service } = setup();
        const { client_id } = await register(service);
        const { result, binding } = await authorize(service, client_id);
        const outcome = await service.finishGoogleLogin(`mcp.${(result as any).requestId}`, binding, undefined, "access_denied");
        expect(new URL((outcome as { location: string }).location).searchParams.get("error")).toBe("access_denied");
    });

    it("rejects a consent post without the CSRF token or from another origin", async () => {
        const { service } = setup();
        const { client_id } = await register(service);
        const { result, binding } = await authorize(service, client_id);
        const requestId = (result as { requestId: string }).requestId;
        await service.finishGoogleLogin(`mcp.${requestId}`, binding, { googleId: "google-owner", emailVerified: true });
        const consent = await service.prepareConsent(requestId, binding);
        expect(consent.kind).toBe("consent");
        expect(await service.decideConsent({ requestId, bindingSecret: binding, csrf: "forged", decision: "write" })).toMatchObject({ kind: "page", status: 400 });
        expect(await service.decideConsent({ requestId, bindingSecret: binding, csrf: (consent as any).csrf, decision: "write", origin: "https://evil.example" })).toMatchObject({ kind: "page", status: 403 });
    });

    it("issues a code bound to the state and the issuer", async () => {
        const { service } = setup();
        const { client_id } = await register(service);
        const { url } = await codeFor(service, client_id);
        expect(url.searchParams.get("state")).toBe("claude-state");
        expect(url.searchParams.get("iss")).toBe(ISSUER);
        expect(url.searchParams.get("code")).toBeTruthy();
    });
});

describe("MCP OAuth: tokens", () => {
    it("exchanges a code once, with the right verifier", async () => {
        const { service } = setup();
        const { client_id } = await register(service);
        const { code, verifier } = await codeFor(service, client_id);
        await rejects(service.exchangeToken({ grant_type: "authorization_code", client_id, code, code_verifier: randomToken(48) }), "invalid_grant");
        const tokens = await service.exchangeToken({ grant_type: "authorization_code", client_id, code, code_verifier: verifier, resource: RESOURCE });
        expect(tokens).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "gymos.read gymos.write" });
        expect(tokens.access_token).toMatch(/^gma_/);
        expect(tokens.refresh_token).toMatch(/^gmr_/);
        await rejects(service.exchangeToken({ grant_type: "authorization_code", client_id, code, code_verifier: verifier }), "invalid_grant");
    });

    it("revokes the tokens of a code that is replayed", async () => {
        const { service } = setup();
        const { client_id } = await register(service);
        const { code, verifier } = await codeFor(service, client_id);
        const tokens = await service.exchangeToken({ grant_type: "authorization_code", client_id, code, code_verifier: verifier });
        await rejects(service.exchangeToken({ grant_type: "authorization_code", client_id, code, code_verifier: verifier }), "invalid_grant");
        expect(await service.authenticate(`Bearer ${tokens.access_token}`)).toMatchObject({ ok: false });
    });

    it("rejects a code presented by another client or for another resource", async () => {
        const { service } = setup();
        const first = await register(service);
        const second = await register(service);
        const { code, verifier } = await codeFor(service, first.client_id);
        await rejects(service.exchangeToken({ grant_type: "authorization_code", client_id: second.client_id, code, code_verifier: verifier }), "invalid_grant");
        await rejects(service.exchangeToken({ grant_type: "authorization_code", client_id: first.client_id, code, code_verifier: verifier, resource: "https://other.example/mcp" }), "invalid_target");
    });

    it("authenticates confidential clients with client_secret_basic and client_secret_post", async () => {
        const { service } = setup();
        const client = await register(service, { token_endpoint_auth_method: "client_secret_basic" });
        const basic = `Basic ${Buffer.from(`${client.client_id}:${client.client_secret}`).toString("base64")}`;
        const first = await codeFor(service, client.client_id);
        await rejects(service.exchangeToken({ grant_type: "authorization_code", client_id: client.client_id, code: first.code, code_verifier: first.verifier }), "invalid_client");
        const second = await codeFor(service, client.client_id);
        await expect(service.exchangeToken({ grant_type: "authorization_code", code: second.code, code_verifier: second.verifier }, basic)).resolves.toHaveProperty("access_token");
        const third = await codeFor(service, client.client_id);
        await expect(service.exchangeToken({ grant_type: "authorization_code", client_id: client.client_id, client_secret: client.client_secret, code: third.code, code_verifier: third.verifier })).resolves.toHaveProperty("access_token");
    });

    it("rotates refresh tokens and revokes the family when an old one is replayed", async () => {
        const { service } = setup();
        const { client_id } = await register(service);
        const first = await tokensFor(service, client_id);
        const second = await service.exchangeToken({ grant_type: "refresh_token", client_id, refresh_token: first.refresh_token, resource: RESOURCE });
        expect(second.refresh_token).not.toBe(first.refresh_token);
        expect(await service.authenticate(`Bearer ${second.access_token}`)).toMatchObject({ ok: true });

        jest.useFakeTimers({ now: Date.now() + 60_000, doNotFake: ["nextTick", "queueMicrotask", "setImmediate", "setTimeout", "setInterval"] });
        try {
            await rejects(service.exchangeToken({ grant_type: "refresh_token", client_id, refresh_token: first.refresh_token }), "invalid_grant");
        } finally {
            jest.useRealTimers();
        }
        expect(await service.authenticate(`Bearer ${second.access_token}`)).toMatchObject({ ok: false });
        await rejects(service.exchangeToken({ grant_type: "refresh_token", client_id, refresh_token: second.refresh_token }), "invalid_grant");
    });

    it("lets a refresh retried within the grace window through", async () => {
        const { service } = setup();
        const { client_id } = await register(service);
        const first = await tokensFor(service, client_id);
        await service.exchangeToken({ grant_type: "refresh_token", client_id, refresh_token: first.refresh_token });
        await expect(service.exchangeToken({ grant_type: "refresh_token", client_id, refresh_token: first.refresh_token })).resolves.toHaveProperty("access_token");
    });

    it("never widens the scope on refresh", async () => {
        const { service } = setup();
        const { client_id } = await register(service);
        const readOnly = await tokensFor(service, client_id, "read");
        expect(readOnly.scope).toBe("gymos.read");
        await rejects(service.exchangeToken({ grant_type: "refresh_token", client_id, refresh_token: readOnly.refresh_token, scope: "gymos.read gymos.write" }), "invalid_scope");
    });

    it("stops refreshing once the account leaves the allowlist", async () => {
        const { service, users } = setup();
        const { client_id } = await register(service);
        const tokens = await tokensFor(service, client_id);
        users.set(OWNER.id, { ...OWNER, email: "someone-else@example.com" });
        expect(await service.authenticate(`Bearer ${tokens.access_token}`)).toMatchObject({ ok: false });
        await rejects(service.exchangeToken({ grant_type: "refresh_token", client_id, refresh_token: tokens.refresh_token }), "invalid_grant");
    });
});

describe("MCP OAuth: access tokens and revocation", () => {
    it("accepts a live access token and returns its scopes", async () => {
        const { service } = setup();
        const { client_id } = await register(service);
        const tokens = await tokensFor(service, client_id);
        const auth = await service.authenticate(`Bearer ${tokens.access_token}`);
        expect(auth).toMatchObject({ ok: true, ctx: { userId: OWNER.id, clientId: client_id, scopes: ["gymos.read", "gymos.write"] } });
    });

    it("rejects a missing, unknown or expired token", async () => {
        const { service, store } = setup();
        expect(await service.authenticate(undefined)).toEqual({ ok: false });
        expect(await service.authenticate("Bearer nonsense")).toMatchObject({ ok: false, error: { code: "invalid_token" } });
        const { client_id } = await register(service);
        const tokens = await tokensFor(service, client_id);
        for (const token of store.tokens.values()) {
            token.expiresAt = new Date(Date.now() - 1000);
        }
        expect(await service.authenticate(`Bearer ${tokens.access_token}`)).toMatchObject({ ok: false, error: { code: "invalid_token" } });
    });

    it("rejects a token issued for another resource", async () => {
        const { service, store } = setup();
        const { client_id } = await register(service);
        const tokens = await tokensFor(service, client_id);
        for (const token of store.tokens.values()) {
            token.resource = "https://other.example/mcp";
        }
        expect(await service.authenticate(`Bearer ${tokens.access_token}`)).toMatchObject({ ok: false });
    });

    it("revokes a refresh token together with its access tokens", async () => {
        const { service } = setup();
        const { client_id } = await register(service);
        const tokens = await tokensFor(service, client_id);
        await service.revoke({ client_id, token: tokens.refresh_token });
        expect(await service.authenticate(`Bearer ${tokens.access_token}`)).toMatchObject({ ok: false });
    });

    it("revokes everything with a GymOS session, but not with an impersonation session", async () => {
        const secret = process.env.JWT_SECRET || "development-only-secret";
        const jwt = new JwtService({ secret });
        const { service } = setup();
        const { client_id } = await register(service);
        const tokens = await tokensFor(service, client_id);
        expect(await service.revokeAllWithSession(jwt.sign({ sub: OWNER.id, imp: "admin" }))).toBeNull();
        expect(await service.revokeAllWithSession(jwt.sign({ sub: STRANGER.id }))).toBeNull();
        expect(await service.revokeAllWithSession(jwt.sign({ sub: OWNER.id }))).toBe(2);
        expect(await service.authenticate(`Bearer ${tokens.access_token}`)).toMatchObject({ ok: false });
    });
});

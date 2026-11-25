import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { OAuthClientMetadataSchema } from "@modelcontextprotocol/sdk/shared/auth.js";
import { PrismaService } from "../../../prisma/prisma.service";
import { jwtSecret } from "../../auth/jwt-secret";
import { isAdminUser } from "../../../shared/admin";
import { MCP_CONFIG, MCP_SCOPES, McpConfig, isAllowedUser, isLoopbackHost } from "../mcp.config";
import { isPkceValue, randomToken, safeEqual, sha256, verifyPkce } from "./crypto";
import { AuthRequestRecord, ClientRecord, OAuthStore, TokenRecord } from "./oauth.store";

export const MCP_STATE_PREFIX = "mcp.";
export const BINDING_COOKIE = "gymos_mcp_auth";

const REQUEST_TTL_MS = 10 * 60 * 1000;
const CODE_TTL_MS = 5 * 60 * 1000;
const REFRESH_GRACE_MS = 30 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const UNUSED_CLIENT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CLIENTS = 100;
const AUTH_METHODS = ["none", "client_secret_post", "client_secret_basic"];
const GRANT_TYPES = ["authorization_code", "refresh_token"];

export class OAuthError extends Error {
    constructor(readonly code: string, readonly description: string, readonly status = 400) {
        super(description);
    }

    body() {
        return { error: this.code, error_description: this.description };
    }
}

export interface McpAuthContext {
    userId: string;
    email: string;
    displayName: string;
    role: string;
    approved: boolean;
    clientId: string;
    scopes: string[];
    tokenId: string;
}

export type PageResult = { kind: "page"; status: number; title: string; message: string };
export type RedirectResult = { kind: "redirect"; location: string; clearBinding?: boolean };
export type ConsentResult = {
    kind: "consent";
    requestId: string;
    csrf: string;
    clientName: string;
    redirectOrigin: string;
    email: string;
    scopes: string[];
};
export type LoginResult = { kind: "login"; requestId: string };

export interface GoogleProfile {
    googleId?: string;
    email?: string;
    emailVerified?: boolean;
}

export type AuthenticateResult =
    | { ok: true; ctx: McpAuthContext }
    | { ok: false; error?: { code: string; description: string } };

type Params = Record<string, unknown>;

function text(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function page(status: number, title: string, message: string): PageResult {
    return { kind: "page", status, title, message };
}

function normalizeResource(value: string): string {
    return value.replace(/\/+$/, "");
}

function seconds(date: Date): number {
    return Math.floor(date.getTime() / 1000);
}

@Injectable()
export class McpOAuthService implements OnApplicationBootstrap {
    private readonly logger = new Logger("McpOAuth");
    private readonly sessions = new JwtService();

    constructor(
        @Inject(MCP_CONFIG) private readonly config: McpConfig,
        private readonly store: OAuthStore,
        private readonly prisma: PrismaService
    ) {}

    get enabled() {
        return this.config.enabled;
    }

    async onApplicationBootstrap() {
        if (!this.config.enabled || !this.config.staticClient) {
            return;
        }
        try {
            await this.store.upsertClient({
                id: this.config.staticClient.id,
                secretHash: sha256(this.config.staticClient.secret),
                name: "Claude",
                redirectUris: this.config.redirectUris,
                authMethod: "client_secret_post",
                createdAt: new Date(),
                lastUsedAt: null
            });
        } catch (error) {
            this.logger.error("static client setup failed", error as Error);
        }
    }

    isMcpState(state: unknown): boolean {
        return typeof state === "string" && state.startsWith(MCP_STATE_PREFIX);
    }

    protectedResourceMetadata() {
        return {
            resource: this.config.resource,
            authorization_servers: [this.config.issuer],
            scopes_supported: [...MCP_SCOPES],
            bearer_methods_supported: ["header"],
            resource_name: "GymOS"
        };
    }

    authorizationServerMetadata() {
        const base = this.config.issuer;
        return {
            issuer: base,
            authorization_endpoint: `${base}/mcp/oauth/authorize`,
            token_endpoint: `${base}/mcp/oauth/token`,
            ...(this.config.dcrEnabled ? { registration_endpoint: `${base}/mcp/oauth/register` } : {}),
            revocation_endpoint: `${base}/mcp/oauth/revoke`,
            response_types_supported: ["code"],
            response_modes_supported: ["query"],
            grant_types_supported: GRANT_TYPES,
            code_challenge_methods_supported: ["S256"],
            token_endpoint_auth_methods_supported: AUTH_METHODS,
            revocation_endpoint_auth_methods_supported: AUTH_METHODS,
            scopes_supported: [...MCP_SCOPES],
            authorization_response_iss_parameter_supported: true
        };
    }

    challenge(error?: { code: string; description: string }) {
        const parts = [
            `resource_metadata="${this.config.issuer}/.well-known/oauth-protected-resource/mcp"`,
            `scope="${MCP_SCOPES.join(" ")}"`
        ];
        if (error) {
            parts.unshift(`error="${error.code}"`, `error_description="${error.description}"`);
        }
        return `Bearer ${parts.join(", ")}`;
    }

    isAllowedRedirect(uri: string): boolean {
        if (this.config.redirectUris.includes(uri)) {
            return true;
        }
        if (!this.config.allowLoopback) {
            return false;
        }
        try {
            const url = new URL(uri);
            return url.protocol === "http:" && isLoopbackHost(url.hostname) && !url.hash && !url.username && !url.password;
        } catch {
            return false;
        }
    }

    private redirectMatches(requested: string, registered: string): boolean {
        if (requested === registered) {
            return true;
        }
        if (!this.config.allowLoopback) {
            return false;
        }
        try {
            const a = new URL(requested);
            const b = new URL(registered);
            return a.protocol === "http:" && isLoopbackHost(a.hostname) && a.hostname === b.hostname
                && a.protocol === b.protocol && a.pathname === b.pathname && a.search === b.search;
        } catch {
            return false;
        }
    }

    async registerClient(body: unknown) {
        if (!this.config.dcrEnabled) {
            throw new OAuthError("invalid_request", "Dynamic client registration is disabled", 403);
        }
        const parsed = OAuthClientMetadataSchema.safeParse(body);
        if (!parsed.success) {
            throw new OAuthError("invalid_client_metadata", "Client metadata is invalid");
        }
        const meta = parsed.data;
        const redirectUris = (meta.redirect_uris || []).map(String);
        if (!redirectUris.length) {
            throw new OAuthError("invalid_redirect_uri", "At least one redirect_uri is required");
        }
        const rejected = redirectUris.find((uri) => !this.isAllowedRedirect(uri));
        if (rejected) {
            throw new OAuthError("invalid_redirect_uri", `redirect_uri is not allowed: ${rejected}`);
        }
        const authMethod = meta.token_endpoint_auth_method || "client_secret_basic";
        if (!AUTH_METHODS.includes(authMethod)) {
            throw new OAuthError("invalid_client_metadata", `Unsupported token_endpoint_auth_method: ${authMethod}`);
        }
        const grantTypes = meta.grant_types && meta.grant_types.length ? meta.grant_types : GRANT_TYPES;
        if (grantTypes.some((grant) => !GRANT_TYPES.includes(grant)) || !grantTypes.includes("authorization_code")) {
            throw new OAuthError("invalid_client_metadata", "Only authorization_code and refresh_token grants are supported");
        }
        const responseTypes = meta.response_types && meta.response_types.length ? meta.response_types : ["code"];
        if (responseTypes.some((type) => type !== "code")) {
            throw new OAuthError("invalid_client_metadata", "Only the code response type is supported");
        }

        const now = new Date();
        await this.store.deleteUnusedClients(new Date(now.getTime() - UNUSED_CLIENT_TTL_MS));
        if ((await this.store.countClients()) >= MAX_CLIENTS) {
            throw new OAuthError("invalid_client_metadata", "Too many registered clients", 429);
        }

        const id = `mcp-${randomToken(18)}`;
        const secret = authMethod === "none" ? null : randomToken(32);
        const name = String(meta.client_name || "MCP client").slice(0, 100);
        await this.store.createClient({
            id,
            secretHash: secret ? sha256(secret) : null,
            name,
            redirectUris,
            authMethod,
            createdAt: now,
            lastUsedAt: null
        });
        return {
            client_id: id,
            client_id_issued_at: seconds(now),
            ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
            client_name: name,
            redirect_uris: redirectUris,
            grant_types: grantTypes,
            response_types: ["code"],
            token_endpoint_auth_method: authMethod
        };
    }

    private errorRedirect(redirectUri: string, error: string, description: string, state?: string | null): RedirectResult {
        const url = new URL(redirectUri);
        url.searchParams.set("error", error);
        url.searchParams.set("error_description", description);
        if (state) {
            url.searchParams.set("state", state);
        }
        url.searchParams.set("iss", this.config.issuer);
        return { kind: "redirect", location: url.href, clearBinding: true };
    }

    async startAuthorization(query: Params, bindingSecret: string): Promise<PageResult | RedirectResult | LoginResult> {
        const clientId = text(query.client_id);
        const client = clientId ? await this.store.findClient(clientId) : null;
        if (!client) {
            return page(400, "Невідомий клієнт", "Цей клієнт не зареєстрований у GymOS. Почніть підключення в Claude ще раз.");
        }
        const requested = text(query.redirect_uri);
        const registered = requested !== undefined
            ? client.redirectUris.find((uri) => this.redirectMatches(requested, uri))
            : client.redirectUris.length === 1 ? client.redirectUris[0] : undefined;
        const redirectUri = requested ?? registered;
        if (!registered || !redirectUri || !this.isAllowedRedirect(registered) || !this.isAllowedRedirect(redirectUri)) {
            return page(400, "Невірна адреса повернення", "redirect_uri не збігається з зареєстрованою для цього клієнта.");
        }

        const state = text(query.state);
        if (state !== undefined && state.length > 2048) {
            return this.errorRedirect(redirectUri, "invalid_request", "state is too long");
        }
        if (query.response_type !== "code") {
            return this.errorRedirect(redirectUri, "unsupported_response_type", "Only response_type=code is supported", state);
        }
        if (!isPkceValue(query.code_challenge) || query.code_challenge_method !== "S256") {
            return this.errorRedirect(redirectUri, "invalid_request", "PKCE with code_challenge_method=S256 is required", state);
        }
        const scopeText = text(query.scope);
        const scopes = scopeText === undefined ? [] : [...new Set(scopeText.split(" ").filter(Boolean))];
        if (scopes.some((scope) => !(MCP_SCOPES as readonly string[]).includes(scope))) {
            return this.errorRedirect(redirectUri, "invalid_scope", `Supported scopes: ${MCP_SCOPES.join(" ")}`, state);
        }
        if (Array.isArray(query.resource)) {
            return this.errorRedirect(redirectUri, "invalid_target", "Only one resource is supported", state);
        }
        const resource = text(query.resource);
        if (resource !== undefined && normalizeResource(resource) !== this.config.resource) {
            return this.errorRedirect(redirectUri, "invalid_target", `Unknown resource; expected ${this.config.resource}`, state);
        }

        const now = new Date();
        await this.store.deleteExpiredRequests(now);
        const request: AuthRequestRecord = {
            id: randomToken(24),
            clientId: client.id,
            redirectUri,
            codeChallenge: query.code_challenge as string,
            scope: (scopes.length ? scopes : [...MCP_SCOPES]).join(" "),
            resource: this.config.resource,
            state: state ?? null,
            bindingHash: sha256(bindingSecret),
            csrfHash: null,
            userId: null,
            email: null,
            grantedScope: null,
            codeHash: null,
            codeExpiresAt: null,
            consumedAt: null,
            expiresAt: new Date(now.getTime() + REQUEST_TTL_MS),
            createdAt: now
        };
        await this.store.createRequest(request);
        return { kind: "login", requestId: request.id };
    }

    private async openRequest(requestId: string | undefined, bindingSecret: string | undefined) {
        const request = requestId ? await this.store.findRequest(requestId) : null;
        if (!request || request.expiresAt <= new Date() || request.consumedAt || request.codeHash) {
            return { error: page(400, "Запит застарів", "Час на підтвердження вийшов. Почніть підключення в Claude ще раз.") };
        }
        if (!bindingSecret || !safeEqual(sha256(bindingSecret), request.bindingHash)) {
            return { error: page(400, "Інший браузер", "Завершіть вхід у тому ж браузері, де почали підключення.") };
        }
        return { request };
    }

    async finishGoogleLogin(state: string, bindingSecret: string | undefined, profile: GoogleProfile | undefined, googleError?: string): Promise<PageResult | RedirectResult> {
        const opened = await this.openRequest(state.slice(MCP_STATE_PREFIX.length), bindingSecret);
        if (!opened.request) {
            return opened.error;
        }
        const request = opened.request;
        if (googleError) {
            await this.store.consumeRequest(request.id, new Date());
            return this.errorRedirect(request.redirectUri, "access_denied", "Google sign-in was cancelled", request.state);
        }
        if (!profile?.googleId || profile.emailVerified === false) {
            return page(403, "Доступ заборонено", "Google не підтвердив цей акаунт.");
        }
        const user = await this.findLinkedUser(profile.googleId);
        if (!user || !isAllowedUser(this.config, { id: user.id, emails: [user.email] })) {
            this.logger.warn("Google sign-in refused: account is not on the MCP allowlist");
            return page(403, "Доступ заборонено", "Цей акаунт не має доступу до MCP-сервера GymOS.");
        }
        if (!(user.approved || isAdminUser(user))) {
            return page(403, "Доступ заборонено", "Акаунт GymOS ще не підтверджений.");
        }
        await this.store.updateRequest(request.id, { userId: user.id, email: user.email });
        return { kind: "redirect", location: `/mcp/oauth/consent?request=${encodeURIComponent(request.id)}` };
    }

    private async findLinkedUser(googleId: string) {
        const select = { id: true, email: true, approved: true, role: true } as const;
        const account = await this.prisma.oAuthAccount.findUnique({
            where: { provider_providerAccountId: { provider: "google", providerAccountId: googleId } },
            select: { user: { select } }
        });
        if (account?.user) {
            return account.user;
        }
        return this.prisma.user.findUnique({ where: { googleId }, select });
    }

    async prepareConsent(requestId: string | undefined, bindingSecret: string | undefined): Promise<PageResult | ConsentResult> {
        const opened = await this.openRequest(requestId, bindingSecret);
        if (!opened.request) {
            return opened.error;
        }
        const request = opened.request;
        if (!request.userId || !request.email) {
            return page(400, "Спочатку увійдіть", "Почніть підключення в Claude ще раз.");
        }
        const client = await this.store.findClient(request.clientId);
        if (!client) {
            return page(400, "Невідомий клієнт", "Почніть підключення в Claude ще раз.");
        }
        const csrf = randomToken(24);
        await this.store.updateRequest(request.id, { csrfHash: sha256(csrf) });
        return {
            kind: "consent",
            requestId: request.id,
            csrf,
            clientName: client.name,
            redirectOrigin: new URL(request.redirectUri).origin,
            email: request.email,
            scopes: request.scope.split(" ")
        };
    }

    async decideConsent(input: { requestId?: string; bindingSecret?: string; csrf?: string; decision?: string; origin?: string }): Promise<PageResult | RedirectResult> {
        if (input.origin && input.origin !== new URL(this.config.issuer).origin) {
            return page(403, "Доступ заборонено", "Запит надійшов з чужої сторінки.");
        }
        const opened = await this.openRequest(input.requestId, input.bindingSecret);
        if (!opened.request) {
            return opened.error;
        }
        const request = opened.request;
        if (!request.userId || !request.csrfHash || !input.csrf || !safeEqual(sha256(input.csrf), request.csrfHash)) {
            return page(400, "Запит застарів", "Оновіть сторінку підключення в Claude і спробуйте ще раз.");
        }
        if (!isAllowedUser(this.config, { id: request.userId, emails: [request.email] })) {
            return page(403, "Доступ заборонено", "Цей акаунт не має доступу до MCP-сервера GymOS.");
        }
        if (input.decision !== "write" && input.decision !== "read") {
            await this.store.consumeRequest(request.id, new Date());
            return this.errorRedirect(request.redirectUri, "access_denied", "The user denied access", request.state);
        }
        const requested = request.scope.split(" ");
        const granted = input.decision === "read"
            ? ["gymos.read"]
            : [...new Set(["gymos.read", ...requested])];
        const code = randomToken(32);
        await this.store.updateRequest(request.id, {
            codeHash: sha256(code),
            codeExpiresAt: new Date(Date.now() + CODE_TTL_MS),
            grantedScope: granted.join(" "),
            csrfHash: null
        });
        const url = new URL(request.redirectUri);
        url.searchParams.set("code", code);
        if (request.state) {
            url.searchParams.set("state", request.state);
        }
        url.searchParams.set("iss", this.config.issuer);
        return { kind: "redirect", location: url.href, clearBinding: true };
    }

    private async authenticateClient(body: Params, authorization?: string): Promise<ClientRecord> {
        let clientId = text(body.client_id);
        let secret = text(body.client_secret);
        if (authorization && /^basic\s+/i.test(authorization)) {
            let decoded = "";
            try {
                decoded = Buffer.from(authorization.replace(/^basic\s+/i, ""), "base64").toString("utf8");
            } catch {
                decoded = "";
            }
            const index = decoded.indexOf(":");
            if (index < 0) {
                throw new OAuthError("invalid_client", "Client authentication failed", 401);
            }
            try {
                const basicId = decodeURIComponent(decoded.slice(0, index).replace(/\+/g, " "));
                secret = decodeURIComponent(decoded.slice(index + 1).replace(/\+/g, " "));
                if (clientId && clientId !== basicId) {
                    throw new OAuthError("invalid_request", "client_id does not match the Authorization header");
                }
                clientId = basicId;
            } catch (error) {
                if (error instanceof OAuthError) {
                    throw error;
                }
                throw new OAuthError("invalid_client", "Client authentication failed", 401);
            }
        }
        const client = clientId ? await this.store.findClient(clientId) : null;
        if (!client) {
            throw new OAuthError("invalid_client", "Client authentication failed", 401);
        }
        if (client.secretHash && (!secret || !safeEqual(sha256(secret), client.secretHash))) {
            throw new OAuthError("invalid_client", "Client authentication failed", 401);
        }
        return client;
    }

    async exchangeToken(body: Params, authorization?: string) {
        const client = await this.authenticateClient(body, authorization);
        const grantType = text(body.grant_type);
        if (grantType === "authorization_code") {
            return this.exchangeCode(client, body);
        }
        if (grantType === "refresh_token") {
            return this.refresh(client, body);
        }
        throw new OAuthError("unsupported_grant_type", "Supported grants: authorization_code, refresh_token");
    }

    private checkResource(value: unknown, expected: string) {
        if (value === undefined) {
            return;
        }
        if (typeof value !== "string" || normalizeResource(value) !== expected) {
            throw new OAuthError("invalid_target", `Unknown resource; expected ${expected}`);
        }
    }

    private async exchangeCode(client: ClientRecord, body: Params) {
        const code = text(body.code);
        const request = code ? await this.store.findRequestByCode(sha256(code)) : null;
        const now = new Date();
        if (!request || request.clientId !== client.id) {
            throw new OAuthError("invalid_grant", "Authorization code is invalid");
        }
        if (request.consumedAt) {
            await this.store.revokeByRequest(request.id, now);
            throw new OAuthError("invalid_grant", "Authorization code was already used");
        }
        if (!request.codeExpiresAt || request.codeExpiresAt <= now) {
            throw new OAuthError("invalid_grant", "Authorization code expired");
        }
        const redirectUri = text(body.redirect_uri);
        if (redirectUri !== undefined && redirectUri !== request.redirectUri) {
            throw new OAuthError("invalid_grant", "redirect_uri does not match the authorization request");
        }
        this.checkResource(body.resource, request.resource);
        if (!verifyPkce(body.code_verifier, request.codeChallenge)) {
            throw new OAuthError("invalid_grant", "code_verifier does not match the code_challenge");
        }
        if (!(await this.store.consumeRequest(request.id, now))) {
            await this.store.revokeByRequest(request.id, now);
            throw new OAuthError("invalid_grant", "Authorization code was already used");
        }
        const user = await this.allowedUser(request.userId);
        if (!user || !request.grantedScope) {
            throw new OAuthError("invalid_grant", "Access is not allowed");
        }
        return this.issueTokens(client, user, request.grantedScope, request.resource, randomToken(16), request.id);
    }

    private async refresh(client: ClientRecord, body: Params) {
        const presented = text(body.refresh_token);
        const row = presented ? await this.store.findToken(sha256(presented)) : null;
        const now = new Date();
        if (!row || row.kind !== "refresh" || row.clientId !== client.id || row.revokedAt || row.expiresAt <= now) {
            throw new OAuthError("invalid_grant", "Refresh token is invalid");
        }
        this.checkResource(body.resource, row.resource);
        const scopeText = text(body.scope);
        const current = row.scope.split(" ");
        const scopes = scopeText === undefined ? current : [...new Set(scopeText.split(" ").filter(Boolean))];
        if (!scopes.length || scopes.some((scope) => !current.includes(scope))) {
            throw new OAuthError("invalid_scope", "Requested scope exceeds the original grant");
        }
        if (!(await this.store.markRotated(row.id, now))) {
            const latest = await this.store.findToken(row.tokenHash);
            const rotatedAt = latest?.rotatedAt?.getTime() ?? 0;
            if (!latest || latest.revokedAt || now.getTime() - rotatedAt > REFRESH_GRACE_MS) {
                await this.store.revokeFamily(row.familyId, now);
                this.logger.warn("Refresh token reuse detected; token family revoked");
                throw new OAuthError("invalid_grant", "Refresh token is invalid");
            }
        }
        const user = await this.allowedUser(row.userId);
        if (!user) {
            await this.store.revokeFamily(row.familyId, now);
            throw new OAuthError("invalid_grant", "Access is not allowed");
        }
        return this.issueTokens(client, user, scopes.join(" "), row.resource, row.familyId, row.requestId);
    }

    private async allowedUser(userId: string | null) {
        if (!userId) {
            return null;
        }
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, displayName: true, approved: true, role: true }
        });
        if (!user || !isAllowedUser(this.config, { id: user.id, emails: [user.email] }) || !(user.approved || isAdminUser(user))) {
            return null;
        }
        return user;
    }

    private async issueTokens(client: ClientRecord, user: { id: string; email: string }, scope: string, resource: string, familyId: string, requestId: string | null) {
        const now = new Date();
        const access = `gma_${randomToken(32)}`;
        const refresh = `gmr_${randomToken(32)}`;
        const shared = {
            clientId: client.id,
            userId: user.id,
            email: user.email,
            scope,
            resource,
            familyId,
            requestId,
            revokedAt: null,
            rotatedAt: null,
            lastUsedAt: null,
            createdAt: now
        };
        const tokens: TokenRecord[] = [
            { ...shared, id: randomToken(16), kind: "access", tokenHash: sha256(access), expiresAt: new Date(now.getTime() + this.config.accessTtlSeconds * 1000) },
            { ...shared, id: randomToken(16), kind: "refresh", tokenHash: sha256(refresh), expiresAt: new Date(now.getTime() + this.config.refreshTtlSeconds * 1000) }
        ];
        await this.store.createTokens(tokens);
        await this.store.touchClient(client.id, now);
        return {
            access_token: access,
            token_type: "Bearer",
            expires_in: this.config.accessTtlSeconds,
            refresh_token: refresh,
            scope
        };
    }

    async revoke(body: Params, authorization?: string) {
        const client = await this.authenticateClient(body, authorization);
        const presented = text(body.token);
        const row = presented ? await this.store.findToken(sha256(presented)) : null;
        if (!row || row.clientId !== client.id) {
            return;
        }
        const now = new Date();
        if (row.kind === "refresh") {
            await this.store.revokeFamily(row.familyId, now);
        } else {
            await this.store.revokeToken(row.id, now);
        }
    }

    async revokeAllWithSession(sessionToken: string): Promise<number | null> {
        let claims: { sub?: string; imp?: string } | null = null;
        try {
            claims = await this.sessions.verifyAsync(sessionToken, { secret: jwtSecret() });
        } catch {
            return null;
        }
        if (!claims?.sub || claims.imp) {
            return null;
        }
        const user = await this.allowedUser(claims.sub);
        return user ? this.store.revokeAllForUser(user.id, new Date()) : null;
    }

    async authenticate(authorization?: string): Promise<AuthenticateResult> {
        const match = /^bearer\s+(\S+)\s*$/i.exec(String(authorization || ""));
        if (!match) {
            return { ok: false };
        }
        const invalid = { ok: false as const, error: { code: "invalid_token", description: "The access token is invalid or expired" } };
        const row = await this.store.findToken(sha256(match[1]));
        const now = new Date();
        if (!row || row.kind !== "access" || row.revokedAt || row.expiresAt <= now || row.resource !== this.config.resource) {
            return invalid;
        }
        const user = await this.allowedUser(row.userId);
        if (!user) {
            return invalid;
        }
        if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
            await this.store.touchToken(row.id, now);
        }
        return {
            ok: true,
            ctx: {
                userId: user.id,
                email: user.email,
                displayName: user.displayName,
                role: user.role,
                approved: user.approved,
                clientId: row.clientId,
                scopes: row.scope.split(" "),
                tokenId: row.id
            }
        };
    }
}

import { Controller, Get, Inject, Logger, Post, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { MCP_CONFIG, McpConfig } from "../mcp.config";
import { RateLimiter, clientIp } from "../rate-limit";
import { randomToken } from "./crypto";
import { GoogleRedirector } from "./google";
import { BINDING_COOKIE, MCP_STATE_PREFIX, McpOAuthService, OAuthError } from "./oauth.service";
import { sendResult } from "./pages";

const MINUTE = 60 * 1000;

function text(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

@Controller()
export class McpOAuthController {
    private readonly logger = new Logger("McpOAuth");
    private readonly limits = {
        register: new RateLimiter(10, 60 * MINUTE),
        authorize: new RateLimiter(30, MINUTE),
        consent: new RateLimiter(30, MINUTE),
        token: new RateLimiter(30, MINUTE),
        revoke: new RateLimiter(30, MINUTE)
    };

    constructor(
        private readonly oauth: McpOAuthService,
        private readonly google: GoogleRedirector,
        @Inject(MCP_CONFIG) private readonly config: McpConfig
    ) {}

    private available(response: Response): boolean {
        if (this.oauth.enabled) {
            return true;
        }
        response.status(404).json({ message: "Not Found", statusCode: 404 });
        return false;
    }

    private limited(name: keyof McpOAuthController["limits"], request: Request, response: Response): boolean {
        const key = clientIp(request);
        const limiter = this.limits[name];
        if (limiter.take(key)) {
            return false;
        }
        response.setHeader("Retry-After", String(limiter.retryAfterSeconds(key)));
        response.status(429).json({ error: "slow_down", error_description: "Too many requests" });
        return true;
    }

    private fail(response: Response, error: unknown, basicAuth = false) {
        response.setHeader("Cache-Control", "no-store");
        if (error instanceof OAuthError) {
            if (error.status === 401 && basicAuth) {
                response.setHeader("WWW-Authenticate", 'Basic realm="gymos-mcp"');
            }
            response.status(error.status).json(error.body());
            return;
        }
        this.logger.error(`OAuth endpoint failed: ${error instanceof Error ? error.message : "unknown error"}`);
        response.status(500).json({ error: "server_error", error_description: "Internal error" });
    }

    private failPage(response: Response, error: unknown) {
        this.logger.error(`OAuth page failed: ${error instanceof Error ? error.message : "unknown error"}`);
        sendResult(response, { kind: "page", status: 500, title: "Помилка", message: "Щось пішло не так. Спробуйте підключитися ще раз." }, this.config.secureCookies);
    }

    @Get([".well-known/oauth-protected-resource", ".well-known/oauth-protected-resource/mcp"])
    protectedResource(@Res() response: Response) {
        if (!this.available(response)) {
            return;
        }
        response.setHeader("Cache-Control", "public, max-age=300");
        response.json(this.oauth.protectedResourceMetadata());
    }

    @Get(".well-known/oauth-authorization-server")
    authorizationServer(@Res() response: Response) {
        if (!this.available(response)) {
            return;
        }
        response.setHeader("Cache-Control", "public, max-age=300");
        response.json(this.oauth.authorizationServerMetadata());
    }

    @Post("mcp/oauth/register")
    async register(@Req() request: Request, @Res() response: Response) {
        if (!this.available(response) || this.limited("register", request, response)) {
            return;
        }
        try {
            const client = await this.oauth.registerClient(request.body);
            response.setHeader("Cache-Control", "no-store");
            response.status(201).json(client);
        } catch (error) {
            this.fail(response, error);
        }
    }

    @Get("mcp/oauth/authorize")
    async authorize(@Req() request: Request, @Res() response: Response) {
        if (!this.available(response) || this.limited("authorize", request, response)) {
            return;
        }
        try {
            const binding = randomToken(24);
            const result = await this.oauth.startAuthorization(request.query as Record<string, unknown>, binding);
            if (result.kind !== "login") {
                sendResult(response, result, this.config.secureCookies);
                return;
            }
            response.cookie(BINDING_COOKIE, binding, {
                httpOnly: true,
                sameSite: "lax",
                secure: this.config.secureCookies,
                path: "/",
                maxAge: 10 * MINUTE
            });
            response.setHeader("Cache-Control", "no-store");
            this.google.redirect(request, response, `${MCP_STATE_PREFIX}${result.requestId}`);
        } catch (error) {
            this.failPage(response, error);
        }
    }

    @Get("mcp/oauth/consent")
    async consent(@Req() request: Request, @Res() response: Response) {
        if (!this.available(response) || this.limited("consent", request, response)) {
            return;
        }
        try {
            const result = await this.oauth.prepareConsent(text(request.query.request), request.cookies?.[BINDING_COOKIE]);
            sendResult(response, result, this.config.secureCookies);
        } catch (error) {
            this.failPage(response, error);
        }
    }

    @Post("mcp/oauth/consent")
    async decide(@Req() request: Request, @Res() response: Response) {
        if (!this.available(response) || this.limited("consent", request, response)) {
            return;
        }
        try {
            const body = (request.body || {}) as Record<string, unknown>;
            const result = await this.oauth.decideConsent({
                requestId: text(body.request),
                bindingSecret: request.cookies?.[BINDING_COOKIE],
                csrf: text(body.csrf),
                decision: text(body.decision),
                origin: text(request.headers.origin)
            });
            sendResult(response, result, this.config.secureCookies);
        } catch (error) {
            this.failPage(response, error);
        }
    }

    @Post("mcp/oauth/token")
    async token(@Req() request: Request, @Res() response: Response) {
        if (!this.available(response) || this.limited("token", request, response)) {
            return;
        }
        const authorization = text(request.headers.authorization);
        try {
            const tokens = await this.oauth.exchangeToken((request.body || {}) as Record<string, unknown>, authorization);
            response.setHeader("Cache-Control", "no-store");
            response.setHeader("Pragma", "no-cache");
            response.status(200).json(tokens);
        } catch (error) {
            this.fail(response, error, /^basic\s/i.test(authorization || ""));
        }
    }

    @Post("mcp/oauth/revoke")
    async revoke(@Req() request: Request, @Res() response: Response) {
        if (!this.available(response) || this.limited("revoke", request, response)) {
            return;
        }
        const authorization = text(request.headers.authorization);
        try {
            await this.oauth.revoke((request.body || {}) as Record<string, unknown>, authorization);
            response.setHeader("Cache-Control", "no-store");
            response.status(200).json({});
        } catch (error) {
            this.fail(response, error, /^basic\s/i.test(authorization || ""));
        }
    }

    @Post("mcp/oauth/revoke-all")
    async revokeAll(@Req() request: Request, @Res() response: Response) {
        if (!this.available(response) || this.limited("revoke", request, response)) {
            return;
        }
        const match = /^bearer\s+(\S+)\s*$/i.exec(text(request.headers.authorization) || "");
        if (!match) {
            response.status(401).json({ error: "invalid_token", error_description: "Send your GymOS session token as Authorization: Bearer" });
            return;
        }
        try {
            const revoked = await this.oauth.revokeAllWithSession(match[1]);
            if (revoked === null) {
                response.status(403).json({ error: "access_denied", error_description: "This session may not manage MCP access" });
                return;
            }
            this.logger.warn(`All MCP tokens revoked (${revoked})`);
            response.status(200).json({ revoked });
        } catch (error) {
            this.fail(response, error);
        }
    }
}

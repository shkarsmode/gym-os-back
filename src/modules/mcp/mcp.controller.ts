import { Controller, Delete, Get, Logger, Post, Req, Res } from "@nestjs/common";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Request, Response } from "express";
import { McpGymService } from "./gym.service";
import { buildMcpServer } from "./mcp.server";
import { McpOAuthService } from "./oauth/oauth.service";
import { RateLimiter } from "./rate-limit";

@Controller("mcp")
export class McpController {
    private readonly logger = new Logger("Mcp");
    private readonly limiter = new RateLimiter(60, 60 * 1000);

    constructor(
        private readonly oauth: McpOAuthService,
        private readonly gym: McpGymService
    ) {}

    @Post()
    async handle(@Req() request: Request, @Res() response: Response) {
        if (!this.oauth.enabled) {
            response.status(404).json({ message: "Not Found", statusCode: 404 });
            return;
        }
        const auth = await this.oauth.authenticate(request.headers.authorization);
        if (!auth.ok) {
            response.setHeader("WWW-Authenticate", this.oauth.challenge(auth.error));
            response.status(401).json({
                error: auth.error?.code || "invalid_request",
                error_description: auth.error?.description || "Authorization required"
            });
            return;
        }
        const key = auth.ctx.userId;
        if (!this.limiter.take(key)) {
            response.setHeader("Retry-After", String(this.limiter.retryAfterSeconds(key)));
            response.status(429).json({ jsonrpc: "2.0", error: { code: -32000, message: "Too many requests" }, id: null });
            return;
        }
        const server = buildMcpServer(auth.ctx, this.gym);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        response.on("close", () => {
            void transport.close();
            void server.close();
        });
        try {
            await server.connect(transport);
            await transport.handleRequest(request, response, request.body);
        } catch (error) {
            this.logger.error(`MCP request failed: ${error instanceof Error ? error.message : "unknown error"}`);
            if (!response.headersSent) {
                response.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
            }
        }
    }

    @Get()
    get(@Res() response: Response) {
        this.methodNotAllowed(response);
    }

    @Delete()
    remove(@Res() response: Response) {
        this.methodNotAllowed(response);
    }

    private methodNotAllowed(response: Response) {
        response.setHeader("Allow", "POST");
        response.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
    }
}

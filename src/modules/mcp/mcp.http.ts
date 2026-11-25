import { Logger } from "@nestjs/common";
import express, { NextFunction, Request, Response } from "express";
import { McpConfig, isAllowedOrigin, isMcpPath, loadMcpConfig } from "./mcp.config";

const PUBLIC_OAUTH_PATHS = new Set(["/mcp/oauth/register", "/mcp/oauth/token", "/mcp/oauth/revoke"]);
const FORM_PATHS = new Set(["/mcp/oauth/token", "/mcp/oauth/revoke", "/mcp/oauth/consent"]);

export function mcpHttpMiddleware(config: McpConfig = loadMcpConfig()) {
    const logger = new Logger("McpHttp");
    const form = express.urlencoded({ extended: false, limit: "16kb" });
    return (request: Request, response: Response, next: NextFunction) => {
        const path = request.path;
        if (!isMcpPath(path)) {
            next();
            return;
        }
        const origin = typeof request.headers.origin === "string" ? request.headers.origin : "";
        if (path === "/mcp") {
            if (origin && !isAllowedOrigin(config, origin)) {
                logger.warn(`Refused /mcp request from Origin ${origin.slice(0, 200)}`);
                response.status(403).json({ error: "forbidden_origin" });
                return;
            }
            if (origin) {
                response.setHeader("Access-Control-Allow-Origin", origin);
                response.setHeader("Vary", "Origin");
            }
            response.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
            response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID");
            response.setHeader("Access-Control-Expose-Headers", "WWW-Authenticate, Mcp-Session-Id, MCP-Protocol-Version");
        } else if (PUBLIC_OAUTH_PATHS.has(path) || path.startsWith("/.well-known/")) {
            response.setHeader("Access-Control-Allow-Origin", "*");
            response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, MCP-Protocol-Version");
            response.setHeader("Access-Control-Expose-Headers", "WWW-Authenticate");
        }
        if (request.method === "OPTIONS") {
            response.status(204).end();
            return;
        }
        if (FORM_PATHS.has(path)) {
            form(request, response, next);
            return;
        }
        next();
    };
}

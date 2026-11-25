import { Module } from "@nestjs/common";
import { MCP_CONFIG, loadMcpConfig } from "../mcp.config";
import { McpSchemaService } from "../mcp.schema";
import { GoogleRedirector, McpGoogleCallback } from "./google";
import { McpOAuthController } from "./oauth.controller";
import { McpOAuthService } from "./oauth.service";
import { OAuthStore, PrismaOAuthStore } from "./oauth.store";

@Module({
    controllers: [McpOAuthController],
    providers: [
        { provide: MCP_CONFIG, useFactory: () => loadMcpConfig() },
        { provide: OAuthStore, useClass: PrismaOAuthStore },
        McpSchemaService,
        McpOAuthService,
        GoogleRedirector,
        McpGoogleCallback
    ],
    exports: [MCP_CONFIG, McpOAuthService, McpGoogleCallback]
})
export class McpOAuthModule {}

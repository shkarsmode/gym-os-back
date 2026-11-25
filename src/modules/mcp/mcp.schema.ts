import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { MCP_CONFIG, McpConfig } from "./mcp.config";

const STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS "McpClient" (
        "id" TEXT NOT NULL,
        "secretHash" TEXT,
        "name" TEXT NOT NULL,
        "redirectUris" JSONB NOT NULL,
        "authMethod" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lastUsedAt" TIMESTAMP(3),
        CONSTRAINT "McpClient_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE TABLE IF NOT EXISTS "McpAuthRequest" (
        "id" TEXT NOT NULL,
        "clientId" TEXT NOT NULL,
        "redirectUri" TEXT NOT NULL,
        "codeChallenge" TEXT NOT NULL,
        "scope" TEXT NOT NULL,
        "resource" TEXT NOT NULL,
        "state" TEXT,
        "bindingHash" TEXT NOT NULL,
        "csrfHash" TEXT,
        "userId" TEXT,
        "email" TEXT,
        "grantedScope" TEXT,
        "codeHash" TEXT,
        "codeExpiresAt" TIMESTAMP(3),
        "consumedAt" TIMESTAMP(3),
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "McpAuthRequest_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "McpAuthRequest_codeHash_key" ON "McpAuthRequest"("codeHash")`,
    `CREATE INDEX IF NOT EXISTS "McpAuthRequest_expiresAt_idx" ON "McpAuthRequest"("expiresAt")`,
    `CREATE TABLE IF NOT EXISTS "McpToken" (
        "id" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "tokenHash" TEXT NOT NULL,
        "clientId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "scope" TEXT NOT NULL,
        "resource" TEXT NOT NULL,
        "familyId" TEXT NOT NULL,
        "requestId" TEXT,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "revokedAt" TIMESTAMP(3),
        "rotatedAt" TIMESTAMP(3),
        "lastUsedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "McpToken_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "McpToken_tokenHash_key" ON "McpToken"("tokenHash")`,
    `CREATE INDEX IF NOT EXISTS "McpToken_userId_idx" ON "McpToken"("userId")`,
    `CREATE INDEX IF NOT EXISTS "McpToken_familyId_idx" ON "McpToken"("familyId")`,
    `CREATE INDEX IF NOT EXISTS "McpToken_requestId_idx" ON "McpToken"("requestId")`,
    `CREATE TABLE IF NOT EXISTS "McpAuditLog" (
        "id" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "userId" TEXT NOT NULL,
        "clientId" TEXT,
        "tool" TEXT NOT NULL,
        "target" TEXT,
        "result" TEXT NOT NULL,
        "summary" TEXT,
        "error" TEXT,
        "before" JSONB,
        "after" JSONB,
        CONSTRAINT "McpAuditLog_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "McpAuditLog_userId_createdAt_idx" ON "McpAuditLog"("userId", "createdAt")`
];

@Injectable()
export class McpSchemaService implements OnModuleInit {
    private readonly logger = new Logger("McpSchema");

    constructor(
        private readonly prisma: PrismaService,
        @Inject(MCP_CONFIG) private readonly config: McpConfig
    ) {}

    async onModuleInit() {
        if (!this.config.enabled) {
            return;
        }
        try {
            for (const statement of STATEMENTS) {
                await this.prisma.$executeRawUnsafe(statement);
            }
        } catch (error) {
            this.logger.error("MCP tables could not be created", error as Error);
        }
    }
}

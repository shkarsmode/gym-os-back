import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export interface AuditEntry {
    userId: string;
    clientId: string;
    tool: string;
    target?: string | null;
    result: "ok" | "rejected";
    summary?: string | null;
    error?: string | null;
    before?: unknown;
    after?: unknown;
}

function json(value: unknown) {
    return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

@Injectable()
export class McpAuditService {
    private readonly logger = new Logger("McpAudit");

    constructor(private readonly prisma: PrismaService) {}

    async record(entry: AuditEntry) {
        try {
            await this.prisma.mcpAuditLog.create({
                data: {
                    userId: entry.userId,
                    clientId: entry.clientId,
                    tool: entry.tool,
                    target: entry.target ?? null,
                    result: entry.result,
                    summary: entry.summary ? entry.summary.slice(0, 2000) : null,
                    error: entry.error ? entry.error.slice(0, 1000) : null,
                    before: json(entry.before),
                    after: json(entry.after)
                }
            });
        } catch (error) {
            this.logger.error(`Audit write failed for ${entry.tool}: ${error instanceof Error ? error.message : "unknown error"}`);
        }
    }

    recent(userId: string, limit: number) {
        return this.prisma.mcpAuditLog.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: { createdAt: true, tool: true, target: true, result: true, summary: true, error: true }
        });
    }
}

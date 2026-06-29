import { ForbiddenException, Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RequestUser } from "../../shared/current-user.decorator";
import { isAdminUser, tierOf } from "../../shared/admin";
import { assertFeedbackQuota } from "../../shared/feedback-quota";
import { CreateFeedbackDto } from "./dto/feedback.dto";

@Injectable()
export class FeedbackService implements OnModuleInit {
    private tableReady = false;

    constructor(private readonly prisma: PrismaService) {}

    async onModuleInit() {
        await this.ensureTable();
    }

    // Neon's pooled connection (pgbouncer) can't run `prisma db push`'s session-level
    // DDL, so the FeatureRequest table is never created on deploy. Single DDL
    // statements DO work over the pooler, so create it idempotently here. Best-effort:
    // the queries below degrade gracefully if this somehow fails.
    private async ensureTable() {
        if (this.tableReady) {
            return;
        }
        try {
            await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "FeatureRequest" (
                "id" TEXT NOT NULL,
                "userId" TEXT NOT NULL,
                "type" TEXT NOT NULL,
                "title" TEXT NOT NULL,
                "description" TEXT,
                "status" TEXT NOT NULL DEFAULT 'new',
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "FeatureRequest_pkey" PRIMARY KEY ("id"),
                CONSTRAINT "FeatureRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
            )`);
            await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FeatureRequest_userId_idx" ON "FeatureRequest"("userId")`);
            await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FeatureRequest_status_idx" ON "FeatureRequest"("status")`);
            this.tableReady = true;
        } catch (error) {
            // best-effort — the runtime queries are defensive about a missing table
        }
    }

    async list() {
        await this.ensureTable();
        try {
            return await this.prisma.featureRequest.findMany({ orderBy: { createdAt: "desc" } });
        } catch (error) {
            return [];
        }
    }

    async create(user: RequestUser, dto: CreateFeedbackDto) {
        await this.ensureTable();
        await assertFeedbackQuota(this.prisma, user.id, tierOf(user));
        return this.prisma.featureRequest.create({
            data: {
                userId: user.id,
                type: dto.type,
                title: dto.title.trim(),
                description: (dto.description || "").trim() || null,
                status: "new"
            }
        });
    }

    async updateStatus(user: RequestUser, id: string, status: string) {
        this.assertAdmin(user);
        await this.ensureTable();
        return this.prisma.featureRequest.update({ where: { id }, data: { status } });
    }

    async remove(user: RequestUser, id: string) {
        this.assertAdmin(user);
        await this.ensureTable();
        await this.prisma.featureRequest.delete({ where: { id } });
        return { id, deleted: true };
    }

    private assertAdmin(user: RequestUser) {
        if (!isAdminUser(user)) {
            throw new ForbiddenException("Admin access required");
        }
    }
}

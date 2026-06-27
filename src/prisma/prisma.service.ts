import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);

    async onModuleInit() {
        await this.$connect();
        await this.ensureSchema();
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }

    // Idempotent, additive schema reconciliation for environments where Prisma
    // migrations cannot run DDL through the connection pooler (Neon pgbouncer in
    // transaction mode rejects the advisory locks `prisma db push`/`migrate` need).
    // Each statement is guarded/idempotent, so this is safe to run on every cold
    // start and never blocks boot.
    private async ensureSchema() {
        try {
            // Add the column if missing. The temporary DEFAULT true backfills the
            // rows that already exist, so the approval gate only ever applies to
            // brand-new sign-ups (existing users are grandfathered in).
            await this.$executeRawUnsafe(
                'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "approved" BOOLEAN NOT NULL DEFAULT true;'
            );
            // Align the live default with the Prisma schema (false) for future
            // inserts; the app always sets `approved` explicitly on create anyway.
            await this.$executeRawUnsafe(
                'ALTER TABLE "User" ALTER COLUMN "approved" SET DEFAULT false;'
            );
        } catch (error) {
            this.logger.error("ensureSchema failed", error as Error);
        }
    }
}

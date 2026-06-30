import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

// Indexes that mirror the @@index() declarations in schema.prisma. Names match
// Prisma's default convention (<Table>_<cols>_idx) so a future `prisma db push`
// recognises them as already-present and does not try to recreate them.
const INDEX_STATEMENTS = [
    `CREATE INDEX IF NOT EXISTS "OAuthAccount_userId_idx" ON "OAuthAccount" ("userId");`,
    `CREATE INDEX IF NOT EXISTS "UserBodyweightEntry_userId_idx" ON "UserBodyweightEntry" ("userId");`,
    `CREATE INDEX IF NOT EXISTS "UserBodyweightEntry_userId_date_idx" ON "UserBodyweightEntry" ("userId", "date");`,
    `CREATE INDEX IF NOT EXISTS "Exercise_isCustom_idx" ON "Exercise" ("isCustom");`,
    `CREATE INDEX IF NOT EXISTS "Exercise_createdByUserId_idx" ON "Exercise" ("createdByUserId");`,
    `CREATE INDEX IF NOT EXISTS "WorkoutExercise_workoutId_idx" ON "WorkoutExercise" ("workoutId");`,
    `CREATE INDEX IF NOT EXISTS "WorkoutExercise_exerciseId_idx" ON "WorkoutExercise" ("exerciseId");`,
    `CREATE INDEX IF NOT EXISTS "WorkoutSet_workoutExerciseId_idx" ON "WorkoutSet" ("workoutExerciseId");`,
    `CREATE INDEX IF NOT EXISTS "CardioSession_workoutId_idx" ON "CardioSession" ("workoutId");`,
    `CREATE INDEX IF NOT EXISTS "PersonalRecord_userId_idx" ON "PersonalRecord" ("userId");`,
    `CREATE INDEX IF NOT EXISTS "PersonalRecord_exerciseId_idx" ON "PersonalRecord" ("exerciseId");`,
    `CREATE INDEX IF NOT EXISTS "PersonalRecord_workoutId_idx" ON "PersonalRecord" ("workoutId");`,
    `CREATE INDEX IF NOT EXISTS "StrengthStandard_exerciseId_idx" ON "StrengthStandard" ("exerciseId");`,
    `CREATE INDEX IF NOT EXISTS "WorkoutTemplate_userId_idx" ON "WorkoutTemplate" ("userId");`,
    `CREATE INDEX IF NOT EXISTS "WorkoutTemplateExercise_workoutTemplateId_idx" ON "WorkoutTemplateExercise" ("workoutTemplateId");`,
    `CREATE INDEX IF NOT EXISTS "WorkoutTemplateExercise_exerciseId_idx" ON "WorkoutTemplateExercise" ("exerciseId");`,
    `CREATE INDEX IF NOT EXISTS "Workout_userId_status_idx" ON "Workout" ("userId", "status");`,
    `CREATE INDEX IF NOT EXISTS "Workout_userId_date_idx" ON "Workout" ("userId", "date");`,
    // Created LAST so its presence is the marker that the whole index pass finished.
    `CREATE INDEX IF NOT EXISTS "Workout_userId_idx" ON "Workout" ("userId");`,
];

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
    // Every statement is guarded/idempotent, so this is safe to run on every cold
    // start and never blocks boot.
    private async ensureSchema() {
        try {
            // The `approved` column is cheap to reconcile, so always do it. The
            // temporary DEFAULT true backfills existing rows (grandfathering) so the
            // approval gate only ever applies to brand-new sign-ups.
            await this.$executeRawUnsafe(
                'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "approved" BOOLEAN NOT NULL DEFAULT true;'
            );
            await this.$executeRawUnsafe(
                'ALTER TABLE "User" ALTER COLUMN "approved" SET DEFAULT false;'
            );

            // Manual workout-duration override (minutes). NULL = auto (finishedAt - startedAt).
            // Cheap + idempotent, so reconcile on every cold start like `approved` above.
            await this.$executeRawUnsafe(
                'ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "durationOverride" INTEGER;'
            );

            // Index creation is 19 round-trips, so gate it behind a single cheap
            // marker check: once the last index exists, the whole pass is done.
            const marker = (await this.$queryRawUnsafe(
                `SELECT to_regclass('public."Workout_userId_idx"') AS reg;`
            )) as Array<{ reg: string | null }>;
            if (marker?.[0]?.reg) {
                return;
            }
            for (const statement of INDEX_STATEMENTS) {
                await this.$executeRawUnsafe(statement);
            }
            this.logger.log("ensureSchema: indexes reconciled");
        } catch (error) {
            this.logger.error("ensureSchema failed", error as Error);
        }
    }
}

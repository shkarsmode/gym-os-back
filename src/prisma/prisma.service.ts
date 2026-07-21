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
    `CREATE INDEX IF NOT EXISTS "Workout_userId_idx" ON "Workout" ("userId");`,
];

// BUMP THIS whenever INDEX_STATEMENTS changes.
//
// This replaces a "does the last index exist?" marker check. That marker was created
// last on purpose, but it meant that once it existed the whole pass was skipped
// forever — so every index appended to the array afterwards was silently never
// created on any database that had already booted once. The failure was invisible:
// no error, no log, just a query plan that never got its index.
const INDEX_SET_VERSION = 1;

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

            // Optional per-set duration in seconds for timed sets (planks, static holds,
            // timed carries). NULL for every existing row and all rep-based sets — never
            // backfilled. Idempotent single-statement DDL runs fine over the pooler.
            // (The AiUsageLog table is reconciled separately in AiUsageService, mirroring
            // the ExerciseReaction pattern.)
            await this.$executeRawUnsafe(
                'ALTER TABLE "WorkoutSet" ADD COLUMN IF NOT EXISTS "durationSeconds" INTEGER;'
            );

            // Per-user appearance/settings preferences (theme, accent, compact, workout
            // defaults …) as a JSON blob so they sync across devices. NULL = never saved
            // → client falls back to its local defaults. Idempotent, reconcile every start.
            await this.$executeRawUnsafe(
                'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferences" JSONB;'
            );

            // Index creation is ~19 round-trips, so it stays gated — but on a version
            // counter, not on the existence of one index. Bumping INDEX_SET_VERSION is
            // what makes a newly added index actually get created on an existing DB.
            await this.$executeRawUnsafe(
                'CREATE TABLE IF NOT EXISTS "_gymos_schema_version" ("id" INTEGER PRIMARY KEY, "indexVersion" INTEGER NOT NULL DEFAULT 0);'
            );
            await this.$executeRawUnsafe(
                'INSERT INTO "_gymos_schema_version" ("id", "indexVersion") VALUES (1, 0) ON CONFLICT ("id") DO NOTHING;'
            );

            const versionRows = (await this.$queryRawUnsafe(
                'SELECT "indexVersion" FROM "_gymos_schema_version" WHERE "id" = 1;'
            )) as Array<{ indexVersion: number | null }>;
            const appliedVersion = Number(versionRows?.[0]?.indexVersion ?? 0);
            if (appliedVersion >= INDEX_SET_VERSION) {
                return;
            }

            // Every statement is CREATE INDEX IF NOT EXISTS, so re-running the full set
            // on a database that already has them is cheap and self-healing.
            for (const statement of INDEX_STATEMENTS) {
                await this.$executeRawUnsafe(statement);
            }
            await this.$executeRawUnsafe(
                `UPDATE "_gymos_schema_version" SET "indexVersion" = ${INDEX_SET_VERSION} WHERE "id" = 1;`
            );
            this.logger.log(`ensureSchema: indexes reconciled to v${INDEX_SET_VERSION}`);
        } catch (error) {
            this.logger.error("ensureSchema failed", error as Error);
        }
    }
}

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

// One-off data reconciliations, gated on their own counter so they run once per
// database rather than on every serverless cold start. Bump when adding a statement.
const BACKFILL_VERSION = 1;
const BACKFILL_STATEMENTS = [
    // Product rule (2026-08-20): a completed workout has no unfinished sets. Older
    // sessions were saved with whatever the user happened to tick, which made the feed
    // render real exercises as "0 підходів" and under-counted their volume.
    `UPDATE "WorkoutSet" AS s SET "isCompleted" = true
       FROM "WorkoutExercise" AS we, "Workout" AS w
      WHERE s."workoutExerciseId" = we."id"
        AND we."workoutId" = w."id"
        AND w."status" = 'completed'
        AND s."isCompleted" = false;`
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

            // Gym-clock marks: first and last completed set of a session. Nullable for
            // every workout logged before this shipped — the UI simply shows no clock.
            await this.$executeRawUnsafe(
                'ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "firstSetAt" TIMESTAMP(3);'
            );
            await this.$executeRawUnsafe(
                'ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "lastSetAt" TIMESTAMP(3);'
            );

            // Workout privacy. `hideWorkoutDetails` false for everyone who existed before
            // this shipped — the product decision is that a profile is PUBLIC by default
            // and privacy is opt-in, so the deploy must not silently hide anybody's data.
            // `privacyChoiceAt` records that the person has been ASKED, which is what
            // stops the one-time prompt reappearing on every app open.
            await this.$executeRawUnsafe(
                'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hideWorkoutDetails" BOOLEAN NOT NULL DEFAULT false;'
            );
            await this.$executeRawUnsafe(
                'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "privacyChoiceAt" TIMESTAMP(3);'
            );

            // Who may see a private member's detail. One row per (owner, viewer).
            //
            // `status` is exactly three values and the read path compares against
            // 'accepted' and nothing else — a block is a rejection with an absurdly
            // distant cooldown rather than a fourth status, so no future query can forget
            // to handle it. Rows are never deleted on cancel or unsubscribe: the row also
            // carries the cooldown and the rejection count, and deleting it would let one
            // extra tap reset both.
            await this.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "WorkoutAccessGrant" (
                "id" TEXT NOT NULL,
                "ownerId" TEXT NOT NULL,
                "viewerId" TEXT NOT NULL,
                "status" TEXT NOT NULL DEFAULT 'pending',
                "message" TEXT,
                "rejectedCount" INTEGER NOT NULL DEFAULT 0,
                "cooldownUntil" TIMESTAMP(3),
                "decidedAt" TIMESTAMP(3),
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "WorkoutAccessGrant_pkey" PRIMARY KEY ("id"),
                CONSTRAINT "WorkoutAccessGrant_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
                CONSTRAINT "WorkoutAccessGrant_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
            )`);
            await this.$executeRawUnsafe(
                'CREATE UNIQUE INDEX IF NOT EXISTS "WorkoutAccessGrant_ownerId_viewerId_key" ON "WorkoutAccessGrant"("ownerId","viewerId");'
            );
            await this.$executeRawUnsafe(
                'CREATE INDEX IF NOT EXISTS "WorkoutAccessGrant_viewerId_status_idx" ON "WorkoutAccessGrant"("viewerId","status");'
            );
            await this.$executeRawUnsafe(
                'CREATE INDEX IF NOT EXISTS "WorkoutAccessGrant_ownerId_status_idx" ON "WorkoutAccessGrant"("ownerId","status");'
            );

            // Two people training together and watching each other's sets live.
            //
            // A PAIR, not a group: the product decision is two, and a table shaped for
            // exactly two makes "who else is in this" un-askable rather than answered
            // wrongly later. One row per invitation; `status` is pending until answered
            // and `active` only while both are training.
            await this.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TrainingPartnership" (
                "id" TEXT NOT NULL,
                "hostId" TEXT NOT NULL,
                "guestId" TEXT NOT NULL,
                "status" TEXT NOT NULL DEFAULT 'pending',
                "startedAt" TIMESTAMP(3),
                "endedAt" TIMESTAMP(3),
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "TrainingPartnership_pkey" PRIMARY KEY ("id"),
                CONSTRAINT "TrainingPartnership_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
                CONSTRAINT "TrainingPartnership_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
            )`);
            // Who may edit whose sets during this session.
            //
            // `guestCanEdit` opens the HOST's workout to the guest, so only the HOST may
            // set it — and the reverse for the other. A single "permissions" call that
            // wrote both would let either side grant themselves access to the other's
            // data with no consent from its owner, which is the most likely shortcut and
            // the wrong one.
            await this.$executeRawUnsafe(
                'ALTER TABLE "TrainingPartnership" ADD COLUMN IF NOT EXISTS "guestCanEdit" BOOLEAN NOT NULL DEFAULT false;'
            );
            await this.$executeRawUnsafe(
                'ALTER TABLE "TrainingPartnership" ADD COLUMN IF NOT EXISTS "hostCanEdit" BOOLEAN NOT NULL DEFAULT false;'
            );
            await this.$executeRawUnsafe(
                'CREATE INDEX IF NOT EXISTS "TrainingPartnership_hostId_status_idx" ON "TrainingPartnership"("hostId","status");'
            );
            await this.$executeRawUnsafe(
                'CREATE INDEX IF NOT EXISTS "TrainingPartnership_guestId_status_idx" ON "TrainingPartnership"("guestId","status");'
            );

            // Year of birth, collected in the AI-coach onboarding. NULL for everyone who
            // has not filled it in — the coach simply omits age from its reasoning.
            await this.$executeRawUnsafe(
                'ALTER TABLE "UserProfile" ADD COLUMN IF NOT EXISTS "birthYear" INTEGER;'
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
            await this.$executeRawUnsafe(
                'ALTER TABLE "_gymos_schema_version" ADD COLUMN IF NOT EXISTS "backfillVersion" INTEGER NOT NULL DEFAULT 0;'
            );

            await this.runBackfills();

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

    // Data (not schema) reconciliation. Separate counter from the index set so a data
    // fix is not held hostage by the index gate, and vice versa.
    private async runBackfills() {
        const rows = (await this.$queryRawUnsafe(
            'SELECT "backfillVersion" FROM "_gymos_schema_version" WHERE "id" = 1;'
        )) as Array<{ backfillVersion: number | null }>;
        if (Number(rows?.[0]?.backfillVersion ?? 0) >= BACKFILL_VERSION) {
            return;
        }
        for (const statement of BACKFILL_STATEMENTS) {
            await this.$executeRawUnsafe(statement);
        }
        await this.$executeRawUnsafe(
            `UPDATE "_gymos_schema_version" SET "backfillVersion" = ${BACKFILL_VERSION} WHERE "id" = 1;`
        );
        this.logger.log(`ensureSchema: backfills applied to v${BACKFILL_VERSION}`);
    }
}

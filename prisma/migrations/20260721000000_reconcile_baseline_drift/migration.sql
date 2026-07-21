-- Reconciles the gap between the baselined schema (0_init) and what production
-- actually contains.
--
-- Background: this database has never had a migration applied. Its schema was built
-- entirely by runtime `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` calls, because the
-- build hook that was supposed to run `prisma db push` never executed at all (see
-- scripts/postinstall.mjs). 0_init is therefore marked applied by hand — the 18 tables
-- it declares really do exist — but two things it declares were never created:
--
--   1. Twenty indexes. PrismaService.ensureSchema() is meant to create these on cold
--      start; in production not one of them exists, so that pass is failing before or
--      inside its loop and its catch only logs. Among the missing are
--      Workout_userId_date_idx, Workout_userId_idx and WorkoutSet_workoutExerciseId_idx
--      — the indexes every workout and export query depends on.
--
--   2. Two column defaults that exist in the database but not in schema.prisma.
--      The runtime DDL declared `"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT
--      CURRENT_TIMESTAMP`, but Prisma's @updatedAt is applied by the client, not the
--      database. Dropping the default is safe here: the only raw INSERT anywhere in
--      src/ targets _gymos_schema_version, so every write to these two tables goes
--      through Prisma, which always supplies updatedAt.
--
-- IF NOT EXISTS is used on the indexes even though `migrate diff` emits plain
-- CREATE INDEX: the runtime index pass is still deployed and could succeed on a cold
-- start between now and this migration running, which would make a plain CREATE INDEX
-- fail. It produces an identical final schema, so future diffs stay clean.
--
-- CONCURRENTLY is deliberately not used: Prisma runs migrations inside a transaction,
-- which forbids it, and at this database's size (~33 MB) these build in seconds.

-- AlterTable
ALTER TABLE "ExerciseReaction" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "FeatureRequest" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CardioSession_workoutId_idx" ON "CardioSession"("workoutId");
CREATE INDEX IF NOT EXISTS "Exercise_isCustom_idx" ON "Exercise"("isCustom");
CREATE INDEX IF NOT EXISTS "Exercise_createdByUserId_idx" ON "Exercise"("createdByUserId");
CREATE INDEX IF NOT EXISTS "Exercise_status_idx" ON "Exercise"("status");
CREATE INDEX IF NOT EXISTS "OAuthAccount_userId_idx" ON "OAuthAccount"("userId");
CREATE INDEX IF NOT EXISTS "PersonalRecord_userId_idx" ON "PersonalRecord"("userId");
CREATE INDEX IF NOT EXISTS "PersonalRecord_exerciseId_idx" ON "PersonalRecord"("exerciseId");
CREATE INDEX IF NOT EXISTS "PersonalRecord_workoutId_idx" ON "PersonalRecord"("workoutId");
CREATE INDEX IF NOT EXISTS "StrengthStandard_exerciseId_idx" ON "StrengthStandard"("exerciseId");
CREATE INDEX IF NOT EXISTS "UserBodyweightEntry_userId_idx" ON "UserBodyweightEntry"("userId");
CREATE INDEX IF NOT EXISTS "UserBodyweightEntry_userId_date_idx" ON "UserBodyweightEntry"("userId", "date");
CREATE INDEX IF NOT EXISTS "Workout_userId_idx" ON "Workout"("userId");
CREATE INDEX IF NOT EXISTS "Workout_userId_status_idx" ON "Workout"("userId", "status");
CREATE INDEX IF NOT EXISTS "Workout_userId_date_idx" ON "Workout"("userId", "date");
CREATE INDEX IF NOT EXISTS "WorkoutExercise_workoutId_idx" ON "WorkoutExercise"("workoutId");
CREATE INDEX IF NOT EXISTS "WorkoutExercise_exerciseId_idx" ON "WorkoutExercise"("exerciseId");
CREATE INDEX IF NOT EXISTS "WorkoutSet_workoutExerciseId_idx" ON "WorkoutSet"("workoutExerciseId");
CREATE INDEX IF NOT EXISTS "WorkoutTemplate_userId_idx" ON "WorkoutTemplate"("userId");
CREATE INDEX IF NOT EXISTS "WorkoutTemplateExercise_workoutTemplateId_idx" ON "WorkoutTemplateExercise"("workoutTemplateId");
CREATE INDEX IF NOT EXISTS "WorkoutTemplateExercise_exerciseId_idx" ON "WorkoutTemplateExercise"("exerciseId");

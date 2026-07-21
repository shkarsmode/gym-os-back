import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const prismaCliPath = join(rootDirectory, "node_modules", "prisma", "build", "index.js");

run(process.execPath, [prismaCliPath, "generate"]);

// THIS FILE IS THE ONLY BUILD HOOK VERCEL ACTUALLY RUNS.
//
// vercel.json declares a legacy `builds` array, and when that is present Vercel
// ignores `buildCommand` entirely — the deploy log says so explicitly
// ("Due to `builds` existing in your configuration file, the Build and Development
// Settings ... will not apply"). scripts/vercel-build.mjs was therefore never
// executed, and there has never been a `vercel-build` npm script either. That is why
// the schema was only ever reconciled by runtime CREATE TABLE IF NOT EXISTS calls:
// no migration channel existed at all. Anything that must happen at build time has to
// live here until vercel.json is modernised.
//
// Rollout order matters, and skipping a step breaks the deploy:
//   1. Baseline production ONCE, out of band:
//        prisma migrate resolve --applied 0_init
//      Without this, `migrate deploy` tries to run 0_init against a database that
//      already has every table, and fails on the first CREATE TABLE.
//   2. Deploy with GYMOS_MIGRATE_ON_DEPLOY unset — this block stays off, nothing
//      changes, and you confirm the rest of the build is unaffected.
//   3. Set GYMOS_MIGRATE_ON_DEPLOY=warn. Migrations run but a failure only logs, so a
//      bad migration cannot take production down while you are still proving the path.
//   4. Once two consecutive deploys are green, set GYMOS_MIGRATE_ON_DEPLOY=strict so a
//      failed migration fails the build. Silent schema failures are what got us here.
const migrateMode = String(process.env.GYMOS_MIGRATE_ON_DEPLOY || "").trim().toLowerCase();

if (migrateMode === "warn" || migrateMode === "strict") {
    if (!process.env.DATABASE_URL) {
        fail("GYMOS_MIGRATE_ON_DEPLOY is set but DATABASE_URL is not — refusing to guess a target.", migrateMode);
    } else if (!process.env.DATABASE_URL_UNPOOLED) {
        // schema.prisma declares DATABASE_URL_UNPOOLED as `directUrl`. Neon's pooled
        // endpoint (pgbouncer, transaction mode) cannot take the advisory locks
        // migrations need, so without it this fails in a confusing way.
        fail("GYMOS_MIGRATE_ON_DEPLOY is set but DATABASE_URL_UNPOOLED is not — migrations cannot run over the pooled endpoint.", migrateMode);
    } else {
        console.log(`[postinstall] prisma migrate deploy (mode: ${migrateMode})`);
        const result = spawnSync(process.execPath, [prismaCliPath, "migrate", "deploy"], {
            cwd: rootDirectory,
            stdio: "inherit",
            shell: false
        });

        if (result.status !== 0) {
            fail(`prisma migrate deploy exited with ${result.status ?? "unknown"}.`, migrateMode);
        }
    }
} else if (isEnabled(process.env.GYMOS_AUTO_DB_PUSH)) {
    // Legacy escape hatch, kept for local/throwaway databases only. `db push` and
    // `prisma migrate` are mutually exclusive workflows: a push against a migrated
    // database drifts it away from the migration history without recording anything.
    // Do not enable this anywhere that GYMOS_MIGRATE_ON_DEPLOY is used.
    console.warn("[postinstall] GYMOS_AUTO_DB_PUSH is on — using db push, NOT migrations.");
    run(process.execPath, [prismaCliPath, "db", "push", "--skip-generate"]);
}

if (isEnabled(process.env.GYMOS_AUTO_IMPORT_EXRX)) {
    console.warn("GYMOS_AUTO_IMPORT_EXRX is deprecated and ignored. Use POST /import/exercises for manual imports.");
}

function fail(message, mode) {
    if (mode === "strict") {
        console.error(`[postinstall] ${message}`);
        process.exit(1);
    }
    console.warn(`[postinstall] ${message} Continuing because mode is "warn".`);
}

function run(command, args) {
    const result = spawnSync(command, args, {
        cwd: rootDirectory,
        stdio: "inherit",
        shell: false
    });

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

function isEnabled(value) {
    return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

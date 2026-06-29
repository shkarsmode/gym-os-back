import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const prismaCliPath = join(rootDirectory, "node_modules", "prisma", "build", "index.js");

// Apply additive schema changes (e.g. the ExerciseReaction table) on every deploy.
// db push refuses destructive changes in CI mode (no --accept-data-loss), so it is
// safe for additive ones. Run it NON-fatally and unconditionally: a push hiccup must
// not take prod down, because the runtime is defensive about not-yet-migrated tables.
// (Was gated on GYMOS_SKIP_DB_PUSH, which left newly added tables uncreated.)
runSoft(process.execPath, [prismaCliPath, "db", "push", "--skip-generate"]);

if (isEnabled(process.env.GYMOS_AUTO_IMPORT_EXRX)) {
    console.warn("GYMOS_AUTO_IMPORT_EXRX is deprecated and ignored. Use POST /import/exercises for manual imports.");
}

// Run a build step but never fail the build on it (logs and continues).
function runSoft(command, args) {
    const result = spawnSync(command, args, {
        cwd: rootDirectory,
        stdio: "inherit",
        shell: false
    });

    if (result.status !== 0) {
        console.warn(`[vercel-build] non-fatal step exited with ${result.status ?? "unknown"} — continuing.`);
    }
}

function isEnabled(value) {
    return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

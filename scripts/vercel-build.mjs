import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const prismaCliPath = join(rootDirectory, "node_modules", "prisma", "build", "index.js");

if (isEnabled(process.env.GYMOS_AUTO_DB_PUSH)) {
    run(process.execPath, [prismaCliPath, "db", "push", "--skip-generate"]);
}

if (isEnabled(process.env.GYMOS_AUTO_IMPORT_EXRX)) {
    console.warn("GYMOS_AUTO_IMPORT_EXRX is deprecated and ignored. Use POST /import/exercises for manual imports.");
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

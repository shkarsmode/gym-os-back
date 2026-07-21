/**
 * Runtime smoke check for the vendored scoring kernel.
 *
 *   node scripts/verify-kernel.mjs [dist|src]
 *
 * Separate from the Jest suite on purpose. The kernel is untranspiled ESM inside a
 * CommonJS build, and Jest's VM sandbox refuses to load ES modules without
 * --experimental-vm-modules — so a Jest "pass" would say nothing about whether the
 * real process can load it. This runs in plain Node, which is what production runs.
 *
 * Checks the failure mode that would otherwise only appear in production: the kernel
 * files must actually be present in the build output and loadable from there. They are
 * copied by the `assets` rule in nest-cli.json, and if that rule ever stops matching,
 * the build still succeeds and every scoring request 500s.
 */
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2] === "src" ? "src" : "dist";
const kernelDirectory = join(rootDirectory, target, "shared", "scoring");

const required = ["scoring.js", "achievements.js", "levels.js", "package.json"];
const missing = required.filter((file) => !fs.existsSync(join(kernelDirectory, file)));

if (missing.length) {
    console.error(`Kernel files missing from ${target}/shared/scoring: ${missing.join(", ")}`);
    if (target === "dist") {
        console.error("The `assets` rule in nest-cli.json is what copies them. Without it the build");
        console.error("succeeds and every scoring request fails at runtime.");
    }
    process.exit(1);
}

const kernel = await import(pathToFileURL(join(kernelDirectory, "scoring.js")).href);

// A user with no workouts whose account is old enough for three tenure badges:
// 1 month (100) + 6 months (200) + 1 year (400) = 700 XP, and nothing else.
const result = kernel.scoreAll({
    users: [{ id: "u1", createdAt: "2025-01-01T00:00:00.000Z" }],
    workouts: [],
    exercises: [],
    featureRequests: [],
    now: new Date("2026-07-21T12:00:00.000Z")
});

const xp = result.users.u1.xp;
if (xp !== 700) {
    console.error(`Kernel loaded but scored unexpectedly: expected 700 XP from tenure badges, got ${xp}.`);
    process.exit(1);
}

if (result.users.u1.records.length !== 0) {
    console.error("Kernel produced records for a user with no workouts.");
    process.exit(1);
}

console.log(`kernel OK (${target}): loaded as ESM from CommonJS and scored correctly`);

/**
 * READ-ONLY production database diagnostic.
 *
 * Runs exactly two Prisma commands, both of which only READ:
 *   1. `migrate status` — reports whether _prisma_migrations exists and what is applied.
 *   2. `migrate diff`   — GENERATES SQL describing the gap between the live database
 *                         and prisma/schema.prisma. It prints the SQL; it never runs it.
 *
 * It deliberately cannot apply anything. The commands that WOULD change the database —
 * `migrate dev`, `migrate reset`, `db push`, `migrate deploy` — are not invoked here,
 * and `migrate dev` / `migrate reset` must never be pointed at production at all:
 * on a drifted database `migrate dev` offers to RESET it, which drops every row.
 *
 * Usage:
 *   DATABASE_URL=... DATABASE_URL_UNPOOLED=... node scripts/db-check.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const prismaCliPath = join(rootDirectory, "node_modules", "prisma", "build", "index.js");

const pooledUrl = process.env.DATABASE_URL || "";
const directUrl = process.env.DATABASE_URL_UNPOOLED || "";

if (!pooledUrl) {
    console.error("DATABASE_URL is not set. Nothing to inspect.");
    process.exit(1);
}

console.log("Target        :", maskUrl(pooledUrl));
console.log("Direct (DDL)  :", directUrl ? maskUrl(directUrl) : "NOT SET");

if (!directUrl) {
    console.warn([
        "",
        "WARNING: DATABASE_URL_UNPOOLED is not set.",
        "schema.prisma declares it as `directUrl`. Neon's pooled endpoint (pgbouncer in",
        "transaction mode) cannot take the advisory locks migrations need, so schema",
        "changes will fail — and scripts/vercel-build.mjs runs them non-fatally, so they",
        "fail silently. Set this before attempting any migration.",
        ""
    ].join("\n"));
}

console.log("\n=== 1/2  migrate status (read-only) ===");
const status = run([prismaCliPath, "migrate", "status"]);
console.log(`\n[exit ${status}] ${status === 0
    ? "migration history is readable."
    : "no readable migration history — expected before baselining."}`);

console.log("\n=== 2/2  migrate diff: live database -> schema.prisma (read-only) ===");
console.log("Any SQL below is DRIFT: changes present in schema.prisma but missing from the");
console.log("live database. Empty output means the database already matches the schema.\n");
const diff = run([
    prismaCliPath, "migrate", "diff",
    "--from-url", directUrl || pooledUrl,
    "--to-schema-datamodel", join(rootDirectory, "prisma", "schema.prisma"),
    "--script"
]);
console.log(`\n[exit ${diff}]`);

console.log([
    "",
    "Nothing was modified. This script only reads.",
    "Review the drift above before deciding whether to baseline.",
    ""
].join("\n"));

function run(args) {
    const result = spawnSync(process.execPath, args, {
        cwd: rootDirectory,
        stdio: "inherit",
        shell: false
    });
    return result.status ?? 1;
}

function maskUrl(value) {
    try {
        const url = new URL(value);
        return `${url.protocol}//${url.username}:***@${url.host}${url.pathname}`;
    } catch (error) {
        return "<unparseable>";
    }
}

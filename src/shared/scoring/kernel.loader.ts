import * as path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Loads the vendored scoring kernel, which is untranspiled ESM inside a CommonJS build.
 *
 * WHY THIS IS NOT JUST `await import("./scoring.js")`:
 *
 * tsconfig sets `module: "commonjs"`, and under that setting TypeScript rewrites a
 * dynamic `import()` into `Promise.resolve().then(() => require(...))`. `require()`
 * cannot load an ES module, so the naive version compiles cleanly, passes review, and
 * then throws ERR_REQUIRE_ESM the first time it runs in production.
 *
 * `new Function` produces a genuine dynamic import that the compiler cannot see and so
 * cannot rewrite. It is the standard escape hatch for this exact situation, not a trick
 * to dodge a lint rule.
 *
 * The kernel stays untranspiled on purpose: it must remain byte-identical to the
 * browser's copy, because both runtimes compute XP, levels, records and achievements
 * from it and any divergence shows a member two different levels with nothing failing.
 * See kernel-parity.spec.ts and scripts/sync-kernel.mjs.
 */
const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<ScoringKernel>;

export interface ScoreAllInput {
    users: Array<{ id: string; createdAt?: string | Date }>;
    // Must be newest-first: recordsFor breaks 1RM ties by visit order, so ascending
    // input silently moves personal-record dates and every date derived from them.
    workouts: unknown[];
    exercises: unknown[];
    featureRequests: unknown[];
    now: Date;
}

export interface ScoringKernel {
    scoreAll(input: ScoreAllInput): {
        users: Record<string, {
            stats: Record<string, unknown>;
            records: Array<Record<string, unknown>>;
            achievements: Array<{ id: string; unlockedAt: string }>;
            xpLedger: Array<{ date: string; amount: number; kind: string; refId: string; meta: unknown }>;
            xp: number;
            level: unknown;
        }>;
        team: Record<string, unknown>;
    };
}

let cached: Promise<ScoringKernel> | null = null;

export function loadScoringKernel(): Promise<ScoringKernel> {
    if (!cached) {
        // A file URL, not a bare path: on Windows an absolute path like C:\... is read
        // as a protocol by the ESM resolver.
        cached = dynamicImport(pathToFileURL(path.join(__dirname, "scoring.js")).href);
    }
    return cached;
}

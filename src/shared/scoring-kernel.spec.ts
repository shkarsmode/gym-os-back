import { createHash } from "node:crypto";
// Namespace imports: tsconfig sets allowSyntheticDefaultImports without
// esModuleInterop, so a default import of a CommonJS builtin resolves to undefined
// at runtime even though it typechecks.
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * The vendored scoring kernel must stay byte-identical to the frontend's copy.
 *
 * Both runtimes compute XP, levels, personal records and all 39 achievements from
 * these files. If the copies drift, a member sees one level on the leaderboard —
 * computed by the server — and a different one on their own tab, computed in the
 * browser. Nothing throws. Nobody can say which number is right.
 *
 * This suite does not compare against the frontend repo (it may not be checked out
 * next to this one). It compares against committed checksums, which means:
 *   - hand-editing a vendored file turns the build red
 *   - a deliberate sync appears as a checksum change in review
 *
 * To sync: edit lib/*.js in the frontend, then `node scripts/sync-kernel.mjs`.
 */
const here = path.join(__dirname, "scoring");
const manifest = JSON.parse(fs.readFileSync(path.join(here, "kernel.checksums.json"), "utf8"));

describe("vendored scoring kernel", () => {
    const files = Object.keys(manifest.files);

    it("has a checksum recorded for every kernel file", () => {
        expect(files.sort()).toEqual(["achievements.js", "levels.js", "scoring.js"]);
    });

    it.each(Object.entries(manifest.files))("%s is unmodified since the last sync", (file, expected) => {
        const actual = createHash("sha256").update(fs.readFileSync(path.join(here, file as string))).digest("hex");
        expect(actual).toBe(expected);
    });

    it("is marked as ESM so Node does not have to sniff the module type", () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(here, "package.json"), "utf8"));
        expect(pkg.type).toBe("module");
    });

    // The runtime load — untranspiled ESM imported from a CommonJS build — is verified
    // by scripts/verify-kernel.mjs instead. Jest's VM sandbox refuses ES modules
    // without --experimental-vm-modules, so a pass here would prove nothing about
    // whether the real process can load the kernel.
});

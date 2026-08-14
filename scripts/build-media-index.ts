/*
 * Regenerates prisma/data/fitnessprogramer-index.json from fitnessprogramer.com's own
 * sitemap. Run it by hand or from a monthly cron:
 *
 *     npm run build:media-index
 *
 * The output is committed. It is the permanent floor for the GIF-suggestion feature: if
 * the live sitemap ever goes away or starts returning garbage, the app keeps serving
 * this snapshot and degrades to "slightly stale" instead of "dead". Never on the request
 * path - MediaIndexService refreshes in the background and never awaits the network.
 */

import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { MEDIA_INDEX_MIN_ENTRIES } from "../src/modules/exercise-media/media.constants";
import { fetchMediaIndexSnapshot } from "../src/modules/exercise-media/media-sitemap";
import { MediaIndexSnapshot } from "../src/modules/exercise-media/media.types";

const OUTPUT_PATH = join(__dirname, "..", "prisma", "data", "fitnessprogramer-index.json");

// One entry per line: still valid JSON, but a monthly regeneration produces a diff you
// can actually read instead of a single 140 KB line or a 4x-inflated pretty-print.
function serialize(snapshot: MediaIndexSnapshot): string {
    const head = [
        `    "schemaVersion": ${JSON.stringify(snapshot.schemaVersion)}`,
        `    "source": ${JSON.stringify(snapshot.source)}`,
        `    "fetchedAt": ${JSON.stringify(snapshot.fetchedAt)}`,
        `    "count": ${JSON.stringify(snapshot.count)}`
    ].join(",\n");
    const entries = snapshot.entries.map((entry) => `        ${JSON.stringify(entry)}`).join(",\n");
    return `{\n${head},\n    "entries": [\n${entries}\n    ]\n}\n`;
}

async function main() {
    const startedAt = Date.now();
    const snapshot = await fetchMediaIndexSnapshot();

    // Refuse to overwrite a good snapshot with a broken harvest. Writing a stub would
    // silently disable the whole feature, which is far worse than an obvious failure.
    if (snapshot.count < MEDIA_INDEX_MIN_ENTRIES) {
        throw new Error(`harvest yielded only ${snapshot.count} entries (minimum ${MEDIA_INDEX_MIN_ENTRIES}), refusing to write`);
    }

    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
    writeFileSync(OUTPUT_PATH, serialize(snapshot), "utf8");

    const gifs = snapshot.entries.filter((entry) => entry.isGif).length;
    const bytes = statSync(OUTPUT_PATH).size;

    console.log(`wrote ${OUTPUT_PATH}`);
    console.log(`entries: ${snapshot.count} (${gifs} gif, ${snapshot.count - gifs} static)`);
    console.log(`size:    ${(bytes / 1024).toFixed(1)} KB`);
    console.log(`took:    ${Date.now() - startedAt} ms`);
}

main().catch((error) => {
    console.error(`build-media-index failed: ${(error as Error).message}`);
    process.exit(1);
});

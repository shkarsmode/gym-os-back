import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { duplicateKeys, normalizeExerciseCatalogPayload } from "../src/modules/import-export/exercise-catalog-importer";

const prisma = new PrismaClient();

async function main() {
    const payload = JSON.parse(readFileSync(join(__dirname, "data", "exrx-exercises.json"), "utf8"));
    const existing = await prisma.exercise.findMany({
        select: {
            slug: true,
            originalName: true,
            sourceUrl: true
        }
    });
    const existingKeys = new Set(existing.flatMap((exercise) => duplicateKeys({
        slug: exercise.slug,
        originalName: exercise.originalName,
        sourceUrl: exercise.sourceUrl
    })));
    const result = normalizeExerciseCatalogPayload(payload, existingKeys);

    for (const exercise of result.exercises) {
        await prisma.exercise.create({ data: exercise as any });
    }

    console.log(`Imported ${result.exercises.length} ExRx reference exercises, skipped ${result.skipped}.`);
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (error) => {
        console.error(error);
        await prisma.$disconnect();
        process.exit(1);
    });

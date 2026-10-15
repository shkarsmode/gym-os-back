/**
 * Catalogue maintenance — the deliberate way to change the live exercise catalogue.
 *
 * On the server (the compiled form that ships inside the API image):
 *   docker exec gymos-api node dist/modules/exercises/catalog-cli.js plan
 *   docker exec gymos-api node dist/modules/exercises/catalog-cli.js apply --yes
 *
 * `plan` prints what `apply` would do and writes nothing. `apply` runs, in one transaction:
 *   1. CATALOG_MERGES  — each duplicate's workouts, template slots, records and reactions
 *      move to the exercise that stays, its names become aliases there, and it is deleted;
 *   2. CATALOG_PATCHES — corrections, each field only while it still holds the value the
 *      patch was written against (an edit made in the app since always wins);
 *   3. the catalogue exercises the database is missing (create-only, by slug and by name).
 *
 * Deleting an exercise through the app removes every set ever logged against it, which is
 * why a duplicate is never cleaned up that way. Everything here is idempotent: a second run
 * finds nothing left to do.
 */

import { PrismaClient } from "@prisma/client";
import { CATALOG_MERGES, CATALOG_PATCHES, extraCuratedExercises } from "./catalog.data";
import { applyCatalogMaintenance, CatalogPlan, planCatalogMaintenance } from "./catalog-maintenance";

function printPlan(plan: CatalogPlan): number {
    let pending = 0;

    console.log("\nДУБЛІКАТИ");
    for (const { merge, from, into, counts } of plan.merges) {
        if (!from) {
            console.log(`  = ${merge.from} → ${merge.into}: дубля вже немає`);
        } else if (!into) {
            console.log(`  ! ${merge.from} → ${merge.into}: немає вправи, в яку зливати — пропущено`);
        } else {
            pending += 1;
            const moved = counts ? `тренувань ${counts.workouts}, шаблонів ${counts.templates}, рекордів ${counts.records}, реакцій ${counts.reactions}` : "";
            console.log(`  ~ «${from.name}» → «${into.name}» (${moved}) — ${merge.reason}`);
        }
    }

    console.log("\nВИПРАВЛЕННЯ");
    for (const patch of plan.patches) {
        if (!patch.row) {
            console.log(`  ? ${patch.patch.slug}: не знайдено`);
            continue;
        }
        if (patch.keptEdits.length) {
            console.log(`  ! «${patch.row.name}»: змінено в застосунку, лишаю як є — ${patch.keptEdits.join("; ")}`);
        }
        if (patch.changes.length) {
            pending += 1;
            console.log(`  ~ «${patch.row.name}»: ${patch.changes.join("; ")}`);
        }
    }

    console.log(`\nНОВІ ВПРАВИ (${plan.inserts.length})`);
    let group = "";
    for (const exercise of [...plan.inserts].sort((a, b) => a.primaryMuscleGroup.localeCompare(b.primaryMuscleGroup, "uk"))) {
        if (exercise.primaryMuscleGroup !== group) {
            group = exercise.primaryMuscleGroup;
            console.log(`  ${group}`);
        }
        console.log(`    + ${exercise.name} · ${exercise.equipment}${exercise.isTimed ? " · на час" : ""} (${exercise.slug})`);
    }
    pending += plan.inserts.length;

    return pending;
}

async function main() {
    const [command, ...flags] = process.argv.slice(2);
    if (command !== "plan" && command !== "apply") {
        console.error("Usage: node dist/modules/exercises/catalog-cli.js plan | apply --yes");
        process.exit(2);
    }
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL is not set.");
        process.exit(2);
    }

    const prisma = new PrismaClient();
    try {
        const before = await prisma.exercise.count();
        const plan = await planCatalogMaintenance(prisma, extraCuratedExercises, CATALOG_MERGES, CATALOG_PATCHES);
        console.log(`Каталог зараз: ${before} вправ.`);
        const pending = printPlan(plan);

        if (command === "plan") {
            console.log(pending ? `\nЗмін до застосування: ${pending}. Запуск: apply --yes` : "\nУсе вже застосовано.");
            return;
        }
        if (!flags.includes("--yes")) {
            console.error("\napply пише в базу. Додай --yes, щоб підтвердити.");
            process.exit(2);
        }
        if (!pending) {
            console.log("\nНічого застосовувати.");
            return;
        }

        const report = await applyCatalogMaintenance(prisma, plan);
        const after = await prisma.exercise.count();
        console.log(`\nГотово: злито ${report.merged.length}, виправлено ${report.patched.length}, додано ${report.created.length}. Каталог: ${before} → ${after}.`);
        for (const merge of report.merged) {
            console.log(`  ${merge.from} → ${merge.into}: ${JSON.stringify(merge.moved)}`);
        }
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

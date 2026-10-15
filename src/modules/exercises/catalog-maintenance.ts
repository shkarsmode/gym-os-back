import { Prisma, PrismaClient } from "@prisma/client";
import { CatalogExercise, CatalogMerge, CatalogPatch } from "./catalog.data";

// Changing the live exercise catalogue: which catalogue exercises a database is missing,
// what a correction would change, and how a duplicate is merged without losing anyone's
// history. The decisions are pure functions (catalog.spec.ts); applyCatalogMaintenance()
// is the only part that writes, and catalog-cli.ts is the only thing that calls it.

/** Names compare case-insensitively and ignore apostrophe variants and spacing. */
export function catalogNameKey(name: string): string {
    return String(name || "")
        .toLowerCase()
        .replace(/[’ʼ`]/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

export interface CatalogRowKey {
    slug: string;
    name: string;
}

/**
 * The catalogue exercises a database does not have yet, matched on slug AND on name.
 *
 * Name matters as much as slug. An exercise created in the app gets a cyrillic slug
 * («тяга-штанги-в-нахилі»), so a slug-only check saw no conflict and seeded the English
 * twin («barbell-bent-over-row») next to it: the catalogue then showed the same movement
 * twice, both approved.
 */
export function missingCatalogExercises(list: CatalogExercise[], existing: CatalogRowKey[]): CatalogExercise[] {
    const slugs = new Set(existing.map((row) => row.slug));
    const names = new Set(existing.map((row) => catalogNameKey(row.name)));
    return list.filter((exercise) => !slugs.has(exercise.slug) && !names.has(catalogNameKey(exercise.name)));
}

export function catalogCreateData(exercise: CatalogExercise): Prisma.ExerciseCreateManyInput {
    return {
        slug: exercise.slug,
        name: exercise.name,
        aliases: [...exercise.aliases],
        primaryMuscleGroup: exercise.primaryMuscleGroup,
        secondaryMuscleGroups: [...exercise.secondaryMuscleGroups],
        movementPattern: exercise.movementPattern,
        equipment: exercise.equipment,
        category: exercise.category,
        difficulty: exercise.difficulty,
        description: exercise.description,
        techniqueSteps: [...exercise.techniqueSteps],
        commonMistakes: [...exercise.commonMistakes],
        safetyTips: [...exercise.safetyTips],
        mediaUrl: exercise.mediaUrl,
        mediaType: exercise.mediaType || "gif",
        isTimed: Boolean(exercise.isTimed),
        originalName: exercise.name,
        isCustom: false,
        status: "approved",
        createdByUserId: null
    };
}

export function stringList(value: unknown): string[] {
    return Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
}

/** `aliases` plus `add`, minus `remove` and the exercise's own name, de-duplicated by name key. */
export function mergedAliases(name: string, aliases: unknown, add: string[] = [], remove: string[] = []): string[] {
    const own = catalogNameKey(name);
    const removed = new Set(remove.map(catalogNameKey));
    const seen = new Set<string>();
    const result: string[] = [];
    for (const alias of [...stringList(aliases), ...add]) {
        const value = String(alias || "").trim();
        const key = catalogNameKey(value);
        if (!value || key === own || removed.has(key) || seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(value);
    }
    return result;
}

function sameList(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((value, index) => value === b[index]);
}

// ---- Patches ---------------------------------------------------------------------------

export interface PatchableRow {
    id: string;
    slug: string;
    name: string;
    aliases: unknown;
    primaryMuscleGroup: string;
    secondaryMuscleGroups: unknown;
    movementPattern: string;
    equipment: string;
    mediaUrl: string | null;
}

export interface PatchPlan {
    patch: CatalogPatch;
    row?: PatchableRow;
    /** Only the fields that actually change, in Prisma update shape. */
    data: Record<string, unknown>;
    /** Human-readable "field: old → new" lines. */
    changes: string[];
    /** Fields left alone because the row no longer holds the value the patch was written against. */
    keptEdits: string[];
}

export function planPatch(row: PatchableRow | undefined, patch: CatalogPatch): PatchPlan {
    const plan: PatchPlan = { patch, row, data: {}, changes: [], keptEdits: [] };
    if (!row) {
        return plan;
    }

    for (const [field, next] of Object.entries(patch.set || {})) {
        const current = (row as unknown as Record<string, unknown>)[field] ?? "";
        if (current === next) {
            continue;
        }
        const expected = patch.was?.[field as keyof NonNullable<CatalogPatch["was"]>];
        if (expected !== undefined && current !== expected) {
            plan.keptEdits.push(`${field}: «${current}» (очікувалось «${expected}»)`);
            continue;
        }
        plan.data[field] = next;
        plan.changes.push(`${field}: «${current}» → «${next}»`);
    }

    const secondary = stringList(row.secondaryMuscleGroups);
    if (patch.secondaryMuscleGroups?.length && !secondary.length) {
        plan.data.secondaryMuscleGroups = [...patch.secondaryMuscleGroups];
        plan.changes.push(`secondaryMuscleGroups: [] → [${patch.secondaryMuscleGroups.join(", ")}]`);
    }

    const name = typeof plan.data.name === "string" ? plan.data.name : row.name;
    const aliases = stringList(row.aliases);
    const nextAliases = mergedAliases(name, aliases, patch.addAliases, patch.removeAliases);
    if (!sameList(aliases, nextAliases)) {
        plan.data.aliases = nextAliases;
        const added = nextAliases.filter((alias) => !aliases.includes(alias));
        const removed = aliases.filter((alias) => !nextAliases.includes(alias));
        plan.changes.push(`aliases: ${[...added.map((alias) => `+${alias}`), ...removed.map((alias) => `−${alias}`)].join(" ")}`);
    }

    return plan;
}

// ---- Merges ----------------------------------------------------------------------------

export interface RecordRow {
    id: string;
    userId: string;
    type: string;
    value: number;
}

export interface RecordMergePlan {
    /** The duplicate's records that move over as they are. */
    repoint: string[];
    /** Records deleted because the merged exercise keeps a better one of the same kind. */
    drop: string[];
}

/**
 * One personal record per person, type and exercise must survive a merge, and it must be
 * the better one. Where only the duplicate holds a record it simply moves. Where both do,
 * the higher value stays (the surviving exercise's own record on a tie) and the rest go —
 * the feed updates "the" record with findFirst, so two of them would make it pick at random.
 */
export function planRecordMerge(fromRecords: RecordRow[], intoRecords: RecordRow[]): RecordMergePlan {
    const plan: RecordMergePlan = { repoint: [], drop: [] };
    const key = (record: RecordRow) => `${record.userId}\u0000${record.type}`;
    const groups = new Map<string, { from: RecordRow[]; into: RecordRow[] }>();
    for (const record of fromRecords) {
        const group = groups.get(key(record)) || { from: [], into: [] };
        group.from.push(record);
        groups.set(key(record), group);
    }
    for (const record of intoRecords) {
        groups.get(key(record))?.into.push(record);
    }

    for (const group of groups.values()) {
        const bestInto = [...group.into].sort((a, b) => b.value - a.value)[0];
        const bestFrom = [...group.from].sort((a, b) => b.value - a.value)[0];
        if (bestInto && bestInto.value >= bestFrom.value) {
            plan.drop.push(...group.from.map((record) => record.id));
            continue;
        }
        plan.repoint.push(bestFrom.id);
        plan.drop.push(...group.from.filter((record) => record !== bestFrom).map((record) => record.id));
        plan.drop.push(...group.into.map((record) => record.id));
    }
    return plan;
}

export interface MergeCounts {
    workouts: number;
    templates: number;
    records: number;
    reactions: number;
    standards: number;
}

export interface MergePlan {
    merge: CatalogMerge;
    from?: PatchableRow;
    into?: PatchableRow;
    counts?: MergeCounts;
}

type Db = PrismaClient | Prisma.TransactionClient;

const ROW_SELECT = {
    id: true, slug: true, name: true, aliases: true, primaryMuscleGroup: true,
    secondaryMuscleGroups: true, movementPattern: true, equipment: true, mediaUrl: true
} as const;

export async function loadCatalogRows(db: Db): Promise<PatchableRow[]> {
    return db.exercise.findMany({ select: ROW_SELECT, orderBy: { name: "asc" } });
}

export async function countReferences(db: Db, exerciseId: string): Promise<MergeCounts> {
    const [workouts, templates, records, reactions, standards] = await Promise.all([
        db.workoutExercise.count({ where: { exerciseId } }),
        db.workoutTemplateExercise.count({ where: { exerciseId } }),
        db.personalRecord.count({ where: { exerciseId } }),
        db.exerciseReaction.count({ where: { exerciseId } }),
        db.strengthStandard.count({ where: { exerciseId } })
    ]);
    return { workouts, templates, records, reactions, standards };
}

/** Moves everything that points at `from` over to `into`, folds its names into `into`'s aliases, then deletes it. */
async function mergeExercise(tx: Prisma.TransactionClient, from: PatchableRow, into: PatchableRow): Promise<MergeCounts> {
    const moved = { exerciseId: into.id };
    const workouts = await tx.workoutExercise.updateMany({ where: { exerciseId: from.id }, data: moved });
    const templates = await tx.workoutTemplateExercise.updateMany({ where: { exerciseId: from.id }, data: moved });

    const recordSelect = { id: true, userId: true, type: true, value: true } as const;
    const toRows = (rows: Array<{ id: string; userId: string; type: string; value: Prisma.Decimal }>) =>
        rows.map((row) => ({ id: row.id, userId: row.userId, type: row.type, value: Number(row.value) }));
    const fromRecords = toRows(await tx.personalRecord.findMany({ where: { exerciseId: from.id }, select: recordSelect }));
    const intoRecords = toRows(await tx.personalRecord.findMany({ where: { exerciseId: into.id }, select: recordSelect }));
    const records = planRecordMerge(fromRecords, intoRecords);
    if (records.drop.length) {
        await tx.personalRecord.deleteMany({ where: { id: { in: records.drop } } });
    }
    if (records.repoint.length) {
        await tx.personalRecord.updateMany({ where: { id: { in: records.repoint } }, data: moved });
    }

    // One reaction per person per exercise (unique index): move a reaction only where the
    // person has not already reacted to the surviving exercise.
    const reacted = new Set((await tx.exerciseReaction.findMany({ where: { exerciseId: into.id }, select: { userId: true } })).map((row) => row.userId));
    const reactions = await tx.exerciseReaction.updateMany({ where: { exerciseId: from.id, userId: { notIn: [...reacted] } }, data: moved });

    // Strength standards describe an exercise, not a person: keep the survivor's own set if
    // it has one; otherwise adopt the duplicate's. Anything left on `from` cascades with it.
    const hasStandards = (await tx.strengthStandard.count({ where: { exerciseId: into.id } })) > 0;
    const standards = hasStandards ? { count: 0 } : await tx.strengthStandard.updateMany({ where: { exerciseId: from.id }, data: moved });

    await tx.exercise.update({
        where: { id: into.id },
        data: { aliases: mergedAliases(into.name, into.aliases, [from.name, ...stringList(from.aliases)]) }
    });
    await tx.exercise.delete({ where: { id: from.id } });

    return {
        workouts: workouts.count,
        templates: templates.count,
        records: records.repoint.length,
        reactions: reactions.count,
        standards: standards.count
    };
}

// ---- Planning the whole run --------------------------------------------------------------

export interface CatalogPlan {
    merges: MergePlan[];
    patches: PatchPlan[];
    inserts: CatalogExercise[];
}

export async function planCatalogMaintenance(db: Db, list: CatalogExercise[], merges: CatalogMerge[], patches: CatalogPatch[]): Promise<CatalogPlan> {
    const rows = await loadCatalogRows(db);
    const bySlug = new Map(rows.map((row) => [row.slug, row]));

    const mergePlans: MergePlan[] = [];
    for (const merge of merges) {
        const from = bySlug.get(merge.from);
        const into = bySlug.get(merge.into);
        mergePlans.push({ merge, from, into, counts: from && into ? await countReferences(db, from.id) : undefined });
    }
    const mergedAway = new Set(mergePlans.filter((plan) => plan.from && plan.into).map((plan) => plan.from!.slug));

    const patchPlans = patches.map((patch) => planPatch(mergedAway.has(patch.slug) ? undefined : bySlug.get(patch.slug), patch));
    const renamed = new Map(patchPlans.filter((plan) => plan.row && typeof plan.data.name === "string").map((plan) => [plan.row!.slug, plan.data.name as string]));

    // What the catalogue will look like once the merges and patches have run — the inserts
    // are decided against that, not against the rows as they are now.
    const after = rows
        .filter((row) => !mergedAway.has(row.slug))
        .map((row) => ({ slug: row.slug, name: renamed.get(row.slug) ?? row.name }));

    return { merges: mergePlans, patches: patchPlans, inserts: missingCatalogExercises(list, after) };
}

export interface CatalogReport {
    merged: Array<{ from: string; into: string; moved: MergeCounts }>;
    patched: Array<{ slug: string; changes: string[] }>;
    created: string[];
}

/** Applies a plan in one transaction: merges, then patches, then the missing exercises. */
export async function applyCatalogMaintenance(prisma: PrismaClient, plan: CatalogPlan): Promise<CatalogReport> {
    return prisma.$transaction(async (tx) => {
        const report: CatalogReport = { merged: [], patched: [], created: [] };

        for (const merge of plan.merges) {
            if (!merge.from || !merge.into) {
                continue;
            }
            // Re-read inside the transaction: the plan may be minutes old.
            const from = await tx.exercise.findUnique({ where: { id: merge.from.id }, select: ROW_SELECT });
            const into = await tx.exercise.findUnique({ where: { id: merge.into.id }, select: ROW_SELECT });
            if (!from || !into) {
                continue;
            }
            report.merged.push({ from: from.slug, into: into.slug, moved: await mergeExercise(tx, from, into) });
        }

        for (const patch of plan.patches) {
            if (!patch.row || !Object.keys(patch.data).length) {
                continue;
            }
            const current = await tx.exercise.findUnique({ where: { id: patch.row.id }, select: ROW_SELECT });
            const fresh = planPatch(current ?? undefined, patch.patch);
            if (!fresh.row || !Object.keys(fresh.data).length) {
                continue;
            }
            await tx.exercise.update({ where: { id: fresh.row.id }, data: fresh.data as Prisma.ExerciseUpdateInput });
            report.patched.push({ slug: fresh.row.slug, changes: fresh.changes });
        }

        const existing = await tx.exercise.findMany({ select: { slug: true, name: true } });
        const inserts = missingCatalogExercises(plan.inserts, existing);
        if (inserts.length) {
            await tx.exercise.createMany({ data: inserts.map(catalogCreateData), skipDuplicates: true });
            report.created.push(...inserts.map((exercise) => exercise.slug));
        }

        return report;
    }, { timeout: 60000 });
}

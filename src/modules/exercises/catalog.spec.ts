import { CATALOG_EQUIPMENT, CATALOG_MERGES, CATALOG_MUSCLES, CATALOG_PATCHES, CATALOG_PATTERNS, CatalogExercise, extraCuratedExercises } from "./catalog.data";
import { catalogCreateData, catalogNameKey, mergedAliases, missingCatalogExercises, PatchableRow, planPatch, planRecordMerge } from "./catalog-maintenance";

/**
 * The catalogue is data, and the failures it can produce are quiet ones: a muscle group
 * the filter has no chip for, a pattern the editor cannot show (and rewrites on the next
 * save), the same movement listed twice, or a seed that re-creates an exercise somebody
 * deleted as a duplicate.
 */
describe("the hand-picked catalogue", () => {
    it("speaks the frontend's vocabulary", () => {
        for (const exercise of extraCuratedExercises) {
            expect(CATALOG_MUSCLES).toContain(exercise.primaryMuscleGroup);
            for (const muscle of exercise.secondaryMuscleGroups) {
                expect(CATALOG_MUSCLES).toContain(muscle);
            }
            expect(CATALOG_PATTERNS).toContain(exercise.movementPattern);
            expect(CATALOG_EQUIPMENT).toContain(exercise.equipment);
            expect(["Початковий", "Середній", "Просунутий"]).toContain(exercise.difficulty);
        }
    });

    it("never lists a movement twice — by slug, by name, by alias or by animation", () => {
        const slugs = new Set<string>();
        const names = new Map<string, string>();
        const media = new Map<string, string>();
        for (const exercise of extraCuratedExercises) {
            expect(slugs.has(exercise.slug)).toBe(false);
            slugs.add(exercise.slug);
            expect(names.get(catalogNameKey(exercise.name))).toBeUndefined();
            names.set(catalogNameKey(exercise.name), exercise.slug);
            expect(media.get(exercise.mediaUrl)).toBeUndefined();
            media.set(exercise.mediaUrl, exercise.slug);
        }
        for (const exercise of extraCuratedExercises) {
            for (const alias of exercise.aliases) {
                const owner = names.get(catalogNameKey(alias));
                expect(owner === undefined || owner === exercise.slug).toBe(true);
            }
        }
    });

    it("is complete enough to show and to log", () => {
        for (const exercise of extraCuratedExercises) {
            expect(exercise.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
            expect(exercise.name.trim()).toBe(exercise.name);
            expect(exercise.aliases.length).toBeGreaterThan(0);
            expect(exercise.secondaryMuscleGroups.length).toBeLessThanOrEqual(4);
            expect(exercise.description.length).toBeGreaterThan(20);
            expect(exercise.techniqueSteps.length).toBeGreaterThanOrEqual(3);
            expect(exercise.commonMistakes.length).toBeGreaterThanOrEqual(2);
            expect(exercise.safetyTips.length).toBeGreaterThanOrEqual(2);
            expect(exercise.mediaUrl).toMatch(/^https:\/\/fitnessprogramer\.com\/wp-content\/uploads\/\d{4}\/\d{2}\/[^/]+$/);
            const extension = exercise.mediaType === "image" ? /\.(png|jpe?g)$/i : /\.gif$/i;
            expect(exercise.mediaUrl).toMatch(extension);
        }
    });

    it("measures static holds in seconds", () => {
        const timed = extraCuratedExercises.filter((exercise) => exercise.isTimed).map((exercise) => exercise.slug);
        expect(timed).toEqual(expect.arrayContaining(["wall-sit", "hollow-hold", "l-sit", "jump-rope", "battle-rope"]));
        expect(catalogCreateData(extraCuratedExercises.find((exercise) => exercise.slug === "wall-sit")!).isTimed).toBe(true);
        expect(catalogCreateData(extraCuratedExercises.find((exercise) => exercise.slug === "dumbbell-curl")!).isTimed).toBe(false);
    });

    it("creates rows the way the catalogue stores them", () => {
        const still = catalogCreateData(extraCuratedExercises.find((exercise) => exercise.slug === "wall-sit")!);
        expect(still.mediaType).toBe("image");
        const row = catalogCreateData(extraCuratedExercises.find((exercise) => exercise.slug === "burpee")!);
        expect(row).toMatchObject({ mediaType: "gif", isCustom: false, status: "approved", createdByUserId: null, originalName: "Берпі" });
    });
});

describe("missingCatalogExercises", () => {
    const exercise = (slug: string, name: string) => ({ ...extraCuratedExercises[0], slug, name }) as CatalogExercise;

    it("skips what a database already has by slug", () => {
        expect(missingCatalogExercises([exercise("a", "Вправа А")], [{ slug: "a", name: "Інша назва" }])).toEqual([]);
    });

    it("skips what a database already has under its own slug but the same name — in any case", () => {
        const list = [exercise("barbell-bent-over-row", "Тяга штанги в нахилі")];
        expect(missingCatalogExercises(list, [{ slug: "тяга-штанги-в-нахилі", name: "тяга штанги  в нахилі" }])).toEqual([]);
    });

    it("returns the rest", () => {
        const list = [exercise("a", "А"), exercise("b", "Б")];
        expect(missingCatalogExercises(list, [{ slug: "a", name: "А" }]).map((item) => item.slug)).toEqual(["b"]);
    });

    it("does not resurrect a merged duplicate: its list entry carries the surviving row's name", () => {
        // The live catalogue after the merges: the English duplicates are gone, the rows
        // that kept the movement remain under their own (cyrillic) slugs.
        const live = [
            { slug: "біцепс-зі-штангою", name: "Біцепс зі штангою" },
            { slug: "махи-гантелей-через-сторони", name: "Махи гантелей через сторони" },
            { slug: "тяга-т-грифа-в-нахилі", name: "Тяга Т-грифа в нахилі" },
            { slug: "rope-pushdown", name: "Розгинання на блоці з канатом" }
        ];
        const missing = missingCatalogExercises(extraCuratedExercises, live).map((item) => item.slug);
        expect(missing).not.toContain("barbell-curl");
        expect(missing).not.toContain("dumbbell-lateral-raise");
        expect(missing).not.toContain("t-bar-row");
        expect(missing).not.toContain("rope-pushdown");
    });
});

describe("catalogue corrections", () => {
    it("merge into a row that stays, never into another duplicate", () => {
        const from = new Set(CATALOG_MERGES.map((merge) => merge.from));
        for (const merge of CATALOG_MERGES) {
            expect(merge.from).not.toBe(merge.into);
            expect(from.has(merge.into)).toBe(false);
        }
    });

    it("never patch a row that a merge removes", () => {
        const from = new Set(CATALOG_MERGES.map((merge) => merge.from));
        for (const patch of CATALOG_PATCHES) {
            expect(from.has(patch.slug)).toBe(false);
        }
    });

    it("only write values the editor can show", () => {
        for (const patch of CATALOG_PATCHES) {
            if (patch.set?.primaryMuscleGroup) expect(CATALOG_MUSCLES).toContain(patch.set.primaryMuscleGroup);
            if (patch.set?.movementPattern) expect(CATALOG_PATTERNS).toContain(patch.set.movementPattern);
            if (patch.set?.equipment) expect(CATALOG_EQUIPMENT).toContain(patch.set.equipment);
            for (const muscle of patch.secondaryMuscleGroups || []) expect(CATALOG_MUSCLES).toContain(muscle);
        }
    });
});

describe("mergedAliases", () => {
    it("appends, de-duplicates by name and drops the exercise's own name", () => {
        expect(mergedAliases("Біцепс зі штангою", ["біцепс", "Barbell Curl"], ["barbell curl", "Біцепс зі штангою", "EZ Bar Curl"]))
            .toEqual(["біцепс", "Barbell Curl", "EZ Bar Curl"]);
    });

    it("removes names that now belong to another exercise", () => {
        expect(mergedAliases("Підйом колін у висі", ["Hanging Knee Raise", "Hanging Leg Raise", "Підйом ніг у висі"], [], ["hanging leg raise", "Підйом ніг у висі"]))
            .toEqual(["Hanging Knee Raise"]);
    });

    it("survives aliases that are not an array", () => {
        expect(mergedAliases("А", null, ["Б"])).toEqual(["Б"]);
    });
});

describe("planPatch", () => {
    const row = (overrides: Partial<PatchableRow> = {}): PatchableRow => ({
        id: "x", slug: "віджимання-від-підлоги", name: "Віджимання від підлоги", aliases: [],
        primaryMuscleGroup: "Груди", secondaryMuscleGroups: [], movementPattern: "Горизонтальний жим",
        equipment: "Тренажер", mediaUrl: null, ...overrides
    });
    const patch = { slug: "віджимання-від-підлоги", set: { equipment: "Вага тіла" }, was: { equipment: "Тренажер" }, secondaryMuscleGroups: ["Трицепс"], addAliases: ["Push-Up"], reason: "" };

    it("changes what still holds the old value", () => {
        const plan = planPatch(row(), patch);
        expect(plan.data).toEqual({ equipment: "Вага тіла", secondaryMuscleGroups: ["Трицепс"], aliases: ["Push-Up"] });
        expect(plan.keptEdits).toEqual([]);
    });

    it("keeps an edit made in the app since the patch was written", () => {
        const plan = planPatch(row({ equipment: "Інше", secondaryMuscleGroups: ["Плечі"] }), patch);
        expect(plan.data).toEqual({ aliases: ["Push-Up"] });
        expect(plan.keptEdits).toHaveLength(1);
    });

    it("is a no-op once applied", () => {
        const plan = planPatch(row({ equipment: "Вага тіла", secondaryMuscleGroups: ["Трицепс"], aliases: ["Push-Up"] }), patch);
        expect(plan.data).toEqual({});
        expect(plan.changes).toEqual([]);
    });

    it("reports a row that is not there instead of guessing", () => {
        const plan = planPatch(undefined, patch);
        expect(plan.row).toBeUndefined();
        expect(plan.data).toEqual({});
    });
});

describe("planRecordMerge", () => {
    const record = (id: string, userId: string, value: number, type = "estimated_1rm") => ({ id, userId, type, value });

    it("moves a record the surviving exercise does not have", () => {
        expect(planRecordMerge([record("f1", "u1", 80)], [])).toEqual({ repoint: ["f1"], drop: [] });
    });

    it("keeps the surviving exercise's record when it is at least as good", () => {
        expect(planRecordMerge([record("f1", "u1", 80)], [record("i1", "u1", 80)])).toEqual({ repoint: [], drop: ["f1"] });
    });

    it("keeps the duplicate's record when it is better, and only one", () => {
        expect(planRecordMerge([record("f1", "u1", 90), record("f2", "u1", 85)], [record("i1", "u1", 80)]))
            .toEqual({ repoint: ["f1"], drop: ["f2", "i1"] });
    });

    it("treats people and record types separately and leaves unrelated records alone", () => {
        const plan = planRecordMerge(
            [record("f1", "u1", 90), record("f2", "u2", 50), record("f3", "u1", 12, "max_reps")],
            [record("i1", "u1", 100), record("i2", "u3", 70)]
        );
        expect(plan.repoint.sort()).toEqual(["f2", "f3"]);
        expect(plan.drop).toEqual(["f1"]);
    });
});

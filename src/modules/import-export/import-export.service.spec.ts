import { BadRequestException } from "@nestjs/common";
import { readImportResources } from "./import-export.service";

/**
 * Regression tests for the /import/start destructive-scope guard.
 *
 * This function decides what startImport() DELETES before any replacement data is
 * written. It used to fall back to all three resources whenever `resources` was not a
 * recognisable array, which made a ~30-byte `POST /import/start {}` erase every workout,
 * bodyweight entry and custom exercise belonging to the caller.
 *
 * The invariant under test: missing, malformed or unrecognised input must THROW, never
 * widen the scope.
 */
describe("readImportResources", () => {
    describe("refuses to infer a destructive scope", () => {
        const badInputs: Array<[string, unknown]> = [
            ["undefined (empty POST body)", undefined],
            ["null", null],
            ["an empty array", []],
            ["a plain object", { workouts: true }],
            ["a bare string", "workouts"],
            ["a number", 1],
            ["only unrecognised names", ["everything", "all", "../../etc"]]
        ];

        it.each(badInputs)("throws on %s", (_label, input) => {
            expect(() => readImportResources(input)).toThrow(BadRequestException);
        });
    });

    describe("accepts an explicit, valid scope", () => {
        it("returns exactly the named resources", () => {
            expect(readImportResources(["workouts"])).toEqual(["workouts"]);
        });

        it("preserves all three when all three are named", () => {
            const result = readImportResources(["customExercises", "bodyweightEntries", "workouts"]);
            expect(result).toHaveLength(3);
            expect(new Set(result)).toEqual(new Set(["customExercises", "bodyweightEntries", "workouts"]));
        });

        it("drops unrecognised names but keeps recognised ones", () => {
            expect(readImportResources(["workouts", "users", "exercises"])).toEqual(["workouts"]);
        });

        it("deduplicates so a repeated name cannot double a delete", () => {
            expect(readImportResources(["workouts", "workouts", "workouts"])).toEqual(["workouts"]);
        });

        it("never returns a resource that was not requested", () => {
            const result = readImportResources(["bodyweightEntries"]);
            expect(result).not.toContain("workouts");
            expect(result).not.toContain("customExercises");
        });
    });
});

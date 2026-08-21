import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { CreateExerciseDto, UpdateExerciseDto } from "./dto/exercise.dto";
import { exerciseData } from "../import-export/import-export.service";

/**
 * `isTimed` marks a static hold — a plank, a hang, a timed carry — so sets added from
 * that exercise are measured in seconds instead of repetitions.
 *
 * The two things worth pinning are both silent failures. The ValidationPipe runs with
 * `forbidNonWhitelisted`, so a field missing from the DTO is rejected with a 400 that
 * names a property the client believes it is allowed to send; and a field missing from
 * `exerciseData` is dropped on restore, which looks exactly like a user who never
 * turned the flag on.
 */
const base = {
    name: "Планка",
    primaryMuscleGroup: "Прес",
    movementPattern: "Кор",
    equipment: "Вага тіла",
    category: "Custom",
    difficulty: "Початковий"
};

describe("isTimed on the exercise DTOs", () => {
    it("is accepted on create", async () => {
        const dto = plainToInstance(CreateExerciseDto, { ...base, isTimed: true });
        expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
        expect(dto.isTimed).toBe(true);
    });

    it("is optional — every existing client omits it", async () => {
        const dto = plainToInstance(CreateExerciseDto, base);
        expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
        expect(dto.isTimed).toBeUndefined();
    });

    it("is accepted on update, in both directions", async () => {
        for (const value of [true, false]) {
            const dto = plainToInstance(UpdateExerciseDto, { isTimed: value });
            expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
            expect(dto.isTimed).toBe(value);
        }
    });

    it("rejects a non-boolean rather than coercing it", async () => {
        const dto = plainToInstance(CreateExerciseDto, { ...base, isTimed: "yes" });
        const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
        expect(errors.map((error) => error.property)).toContain("isTimed");
    });
});

describe("isTimed survives an import", () => {
    it("carries a true flag through", () => {
        expect(exerciseData({ ...base, isTimed: true }, "user-1").isTimed).toBe(true);
    });

    it("defaults to rep-based when absent, which is what every old export looks like", () => {
        expect(exerciseData(base, "user-1").isTimed).toBe(false);
        expect(exerciseData({ ...base, isTimed: null }, "user-1").isTimed).toBe(false);
    });

    it("never lets a truthy string become a timed exercise by accident", () => {
        // Boolean("false") is true — the guard has to be the DTO, and this pins that
        // the mapper is not the place a stray string sneaks in from.
        expect(exerciseData({ ...base, isTimed: 0 }, "user-1").isTimed).toBe(false);
    });
});

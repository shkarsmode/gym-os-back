import {
    buildPersonas, trainsOn, sessionKind, workingWeight, weeksTrained, bodyweightOn,
    isDeloadWeek, makeRng, hashSeed, roundToPlate, SPLITS, PersonaBankInput
} from "./personas";
import {
    bytesPerWorkout, steadyStateBytes, judgeDisk, judgeMemory, judgeCpu, capacityReport,
    HostStat, GrowthInput, GIB, MIB
} from "./capacity";

const BANK: PersonaBankInput = {
    givenMale: ["Андрій", "Богдан", "Данило"],
    givenFemale: ["Аліна", "Марія"],
    family: ["Ткаченко", "Мельник"],
    handleSuffixes: ["", "fit"],
    goals: ["Набрати масу", "Схуднути"],
    experience: ["1 рік", "3 роки"],
    muscleGroups: ["Спина", "Ноги"]
};

describe("dev-life personas", () => {
    it("is deterministic — the same seed rebuilds the same population", () => {
        const first = buildPersonas(40, BANK);
        const second = buildPersonas(40, BANK);
        expect(second).toEqual(first);
    });

    it("keeps existing people byte-identical when the population grows", () => {
        // The point of seeding per INDEX. A bug filed against dev user 12 has to still be
        // there after somebody raises the population from 60 to 100.
        const small = buildPersonas(30, BANK);
        const large = buildPersonas(90, BANK);
        expect(large.slice(0, 30)).toEqual(small);
    });

    it("gives everybody a stable dev- id and an unroutable email", () => {
        for (const persona of buildPersonas(50, BANK)) {
            // The id prefix is the safety net: cleanup only ever deletes `dev-` rows, so a
            // generator pointed at the wrong database still cannot touch real data.
            expect(persona.id.startsWith("dev-u-")).toBe(true);
            expect(persona.email.endsWith("@dev.gymos.invalid")).toBe(true);
        }
    });

    it("produces a plausible spread rather than one kind of person", () => {
        const people = buildPersonas(90, BANK);
        const archetypes = new Set(people.map((person) => person.archetype));
        const splits = new Set(people.map((person) => person.split));
        expect(archetypes.size).toBeGreaterThanOrEqual(4);
        expect(splits.size).toBeGreaterThanOrEqual(3);
        // Both privacy branches and both tiers must actually occur, or the dev environment
        // silently stops exercising half the client.
        expect(people.some((person) => person.hideWorkoutDetails)).toBe(true);
        expect(people.some((person) => !person.hideWorkoutDetails)).toBe(true);
        expect(people.some((person) => person.role === "pro")).toBe(true);
        expect(people.some((person) => person.role === "free")).toBe(true);
    });

    it("keeps body measurements inside human bounds", () => {
        for (const persona of buildPersonas(120, BANK)) {
            expect(persona.height).toBeGreaterThanOrEqual(150);
            expect(persona.height).toBeLessThanOrEqual(200);
            expect(persona.startBodyweight).toBeGreaterThanOrEqual(45);
            expect(persona.startBodyweight).toBeLessThanOrEqual(130);
            expect(persona.consistency).toBeGreaterThan(0.4);
            expect(persona.consistency).toBeLessThanOrEqual(1);
        }
    });
});

describe("dev-life schedule", () => {
    const people = buildPersonas(60, BANK);

    it("never trains on a rest day of the chosen split", () => {
        for (const persona of people) {
            for (let day = 0; day < 140; day += 1) {
                const weekday = ((day % 7) + 7) % 7;
                if (SPLITS[persona.split][weekday] === null) {
                    expect(trainsOn(persona, day)).toBe(false);
                }
            }
        }
    });

    it("answers the same for a given day however often it is asked", () => {
        // The incremental tick asks about one day in isolation; the backfill asks about a
        // range. They must agree or the two would write contradictory histories.
        const persona = people[7];
        const answers = [0, 1, 2].map(() => Array.from({ length: 60 }, (_, day) => trainsOn(persona, day)));
        expect(answers[1]).toEqual(answers[0]);
        expect(answers[2]).toEqual(answers[0]);
    });

    it("misses sessions — nobody is perfect and nobody is absent", () => {
        for (const persona of people) {
            const days = Array.from({ length: 210 }, (_, day) => trainsOn(persona, day));
            const trained = days.filter(Boolean).length;
            expect(trained).toBeGreaterThan(10);
            expect(trained).toBeLessThan(210);
        }
    });

    it("produces between 1 and 6 sessions in a typical week", () => {
        for (const persona of people) {
            for (let week = 0; week < 12; week += 1) {
                const count = Array.from({ length: 7 }, (_, offset) => trainsOn(persona, week * 7 + offset))
                    .filter(Boolean).length;
                expect(count).toBeLessThanOrEqual(6);
            }
        }
    });

    it("names a session kind for every day it trains", () => {
        for (const persona of people.slice(0, 20)) {
            for (let day = 0; day < 40; day += 1) {
                if (trainsOn(persona, day)) {
                    expect(SPLITS[persona.split][((day % 7) + 7) % 7]).toBe(sessionKind(persona, day));
                }
            }
        }
    });
});

describe("dev-life progression", () => {
    const people = buildPersonas(60, BANK);

    it("grows over time and saturates instead of running away", () => {
        const persona = people.find((person) => person.archetype === "novice") ?? people[0];
        // Averaged across lifts: a single draw carries +/-4% daily jitter, and a test that
        // fails one run in twenty is worse than no test.
        const lifts = ["bench", "squat", "row", "press", "curl", "deadlift"];
        const at = (weeks: number) =>
            lifts.reduce((sum, lift) => sum + workingWeight(persona, 100, weeks, lift), 0) / lifts.length;
        const early = at(2);
        const mid = at(20);
        const late = at(200);
        expect(mid).toBeGreaterThan(early);
        expect(late).toBeGreaterThanOrEqual(mid);
        // The whole point of the saturating curve: two hundred weeks does not produce a
        // 400 kg bench.
        expect(late).toBeLessThanOrEqual(100 * 1.05 * 1.05);
        // Later gains are smaller than earlier ones — that IS the saturation.
        expect(late - mid).toBeLessThan(mid - early);
    });

    it("never prescribes a weight off a real bar", () => {
        for (const persona of people.slice(0, 25)) {
            for (const weeks of [0, 3, 17, 60]) {
                const weight = workingWeight(persona, 80, weeks, "squat");
                expect(Math.round(weight * 100) % 250).toBe(0);
                expect(weight).toBeGreaterThan(0);
            }
        }
    });

    it("counts training weeks from the day the person joined", () => {
        const persona = { ...people[0], joinedDaysAgo: 70 };
        expect(weeksTrained(persona, 1000, 1000)).toBeCloseTo(10, 5);
        // Before they joined there is no history to invent.
        expect(weeksTrained(persona, 900, 1000)).toBe(0);
    });

    it("deloads sometimes, but never for a novice", () => {
        const novice = people.find((person) => person.archetype === "novice");
        if (novice) {
            const weeks = Array.from({ length: 60 }, (_, week) => isDeloadWeek(novice, week * 7));
            expect(weeks.every((value) => value === false)).toBe(true);
        }
        const experienced = people.filter((person) => person.archetype !== "novice");
        const anyDeload = experienced.some((person) =>
            Array.from({ length: 80 }, (_, week) => isDeloadWeek(person, week * 7)).some(Boolean));
        expect(anyDeload).toBe(true);
    });

    it("drifts bodyweight slowly and in the archetype's direction", () => {
        const cardio = people.find((person) => person.archetype === "cardio");
        if (cardio) {
            expect(bodyweightOn(cardio, 40)).toBeLessThan(cardio.startBodyweight + 1);
        }
        for (const persona of people.slice(0, 20)) {
            const after = bodyweightOn(persona, 52);
            expect(Math.abs(after - persona.startBodyweight)).toBeLessThan(6);
        }
    });
});

describe("dev-life rng helpers", () => {
    it("hashes stably and differs between inputs", () => {
        expect(hashSeed("a", 1)).toBe(hashSeed("a", 1));
        expect(hashSeed("a", 1)).not.toBe(hashSeed("a", 2));
    });

    it("stays inside [0, 1)", () => {
        const rng = makeRng(12345);
        for (let index = 0; index < 500; index += 1) {
            const value = rng();
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });

    it("rounds to plates and never goes negative", () => {
        expect(roundToPlate(61.3)).toBe(62.5);
        expect(roundToPlate(63.8)).toBe(65);
        expect(roundToPlate(-20)).toBe(0);
        expect(roundToPlate(7.4, 1)).toBe(7);
    });
});

describe("dev-life capacity", () => {
    const HOST: HostStat = {
        diskTotalBytes: 38 * GIB,
        diskUsedBytes: 19 * GIB,
        memTotalMb: 3819,
        memAvailableMb: 2444,
        swapUsedMb: 213,
        vcpu: 2,
        loadAvg1: 0.95
    };
    const GROWTH: GrowthInput = { workoutsPerDay: 40, bytesPerWorkout: 9000, retentionDays: 120 };

    it("measures cost per workout from real table sizes, indexes included", () => {
        const tables = [
            { name: "Workout", rows: 1000, bytes: 2 * MIB },
            { name: "WorkoutSet", rows: 20000, bytes: 6 * MIB },
            { name: "Exercise", rows: 149, bytes: 5 * MIB } // not workout-shaped — excluded
        ];
        expect(bytesPerWorkout(tables, 1000)).toBe(Math.round((8 * MIB) / 1000));
        expect(bytesPerWorkout(tables, 0)).toBe(0);
    });

    it("settles instead of growing for ever, because pruning bounds it", () => {
        const settled = steadyStateBytes(GROWTH, 40 * MIB);
        expect(settled).toBe(40 * MIB + 40 * 120 * 9000);
        // Doubling retention doubles only the variable part.
        const longer = steadyStateBytes({ ...GROWTH, retentionDays: 240 }, 40 * MIB);
        expect(longer - settled).toBe(40 * 120 * 9000);
    });

    it("calls disk a non-issue when the settled size fits in the free space", () => {
        const verdict = judgeDisk(HOST, GROWTH, 9 * MIB, 40 * MIB);
        expect(verdict.daysToThreshold).toBeNull();
        expect(verdict.severity).toBe("ok");
        expect(verdict.headline).toContain("never");
    });

    it("counts down the days when the settled size does NOT fit", () => {
        const tight: HostStat = { ...HOST, diskUsedBytes: 30 * GIB };
        const heavy: GrowthInput = { workoutsPerDay: 4000, bytesPerWorkout: 900000, retentionDays: 365 };
        const verdict = judgeDisk(tight, heavy, 100 * MIB, 40 * MIB);
        expect(verdict.daysToThreshold).not.toBeNull();
        expect(verdict.severity).toBe("upgrade");
    });

    it("treats swap in use as a warning even with RAM apparently free", () => {
        expect(judgeMemory({ ...HOST, swapUsedMb: 0 }, 120).severity).toBe("ok");
        expect(judgeMemory({ ...HOST, swapUsedMb: 400 }, 120).severity).toBe("watch");
        // No room left for the tick process itself.
        expect(judgeMemory({ ...HOST, memAvailableMb: 250 }, 120).severity).toBe("upgrade");
    });

    it("reads cpu per core, not as a raw load number", () => {
        expect(judgeCpu({ ...HOST, loadAvg1: 0.95, vcpu: 2 }).severity).toBe("ok");
        expect(judgeCpu({ ...HOST, loadAvg1: 1.6, vcpu: 2 }).severity).toBe("watch");
        expect(judgeCpu({ ...HOST, loadAvg1: 3.8, vcpu: 2 }).severity).toBe("upgrade");
        // The same load on a bigger box is fine, which is the entire question being asked.
        expect(judgeCpu({ ...HOST, loadAvg1: 1.6, vcpu: 4 }).severity).toBe("ok");
    });

    it("reports the worst resource, not an average", () => {
        const report = capacityReport({ ...HOST, loadAvg1: 3.9 }, GROWTH, 9 * MIB, 40 * MIB, 120);
        expect(report.overall).toBe("upgrade");
        expect(report.recommendation).toContain("CX32");
        const calm = capacityReport({ ...HOST, swapUsedMb: 0 }, GROWTH, 9 * MIB, 40 * MIB, 120);
        expect(calm.overall).toBe("ok");
        expect(calm.recommendation).toContain("CX22");
    });
});

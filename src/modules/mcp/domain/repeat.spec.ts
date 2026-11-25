import { buildRepeatDraft, pickRepeatSource } from "./repeat";
import { DraftSet, DraftWorkout } from "./workout";

const today = "2026-11-25";

describe("MCP repeat: choosing the source like the app's «Повторити»", () => {
    const candidates = [
        { id: "today-wed", date: "2026-11-25", exerciseCount: 5 },
        { id: "mon", date: "2026-11-23", exerciseCount: 4 },
        { id: "fri-cardio", date: "2026-11-20", exerciseCount: 0 },
        { id: "prev-wed", date: "2026-11-18", exerciseCount: 6 },
        { id: "fri", date: "2026-11-13", exerciseCount: 3 }
    ];

    it("takes the newest completed workout on the same weekday before today", () => {
        expect(pickRepeatSource(candidates, "2026-11-25", today)?.id).toBe("prev-wed");
        expect(pickRepeatSource(candidates, "2026-12-02", today)?.id).toBe("prev-wed");
    });

    it("skips sessions without exercises", () => {
        expect(pickRepeatSource(candidates, "2026-11-27", today)?.id).toBe("fri");
    });

    it("falls back to the newest completed workout", () => {
        expect(pickRepeatSource(candidates, "2026-11-29", today)?.id).toBe("today-wed");
        expect(pickRepeatSource([], "2026-11-29", today)).toBeNull();
    });
});

describe("MCP repeat: building the plan", () => {
    const set = (weight: number, reps: number, extra: Partial<DraftSet> = {}): DraftSet => ({
        id: `set-${weight}-${reps}`, type: "working", weight, repetitions: reps, durationSeconds: null, rpe: 8, restSeconds: 120, isCompleted: true, notes: "felt heavy", ...extra
    });
    const source: DraftWorkout = {
        id: "prev-wed",
        userId: "user-owner",
        date: "2026-11-18",
        title: "Груди",
        status: "completed",
        workoutType: "push",
        notes: "good day",
        durationOverride: 80,
        startedAt: new Date(),
        finishedAt: new Date(),
        firstSetAt: new Date(),
        lastSetAt: new Date(),
        updatedAt: new Date(),
        supersetGroups: [{ id: "g1", restSeconds: 90 }],
        exercises: [
            { id: "we-1", exerciseId: "ex-bench", name: "Жим лежачи", isTimed: false, notes: "pause", supersetGroupId: "g1", sets: [set(80, 8), set(80, 8)] },
            { id: "we-2", exerciseId: "ex-fly", name: "Зведення", isTimed: false, notes: null, supersetGroupId: "g1", sets: [set(20, 12, { restSeconds: 0 })] }
        ],
        cardio: [{ type: "treadmill", durationMinutes: 10, distance: 1.5, calories: null, averageHeartRate: null, intensity: "medium", notes: "warm" }]
    };
    let counter = 0;
    const makeId = (prefix: string) => `${prefix}-fresh-${++counter}`;

    it("uses the last time each exercise was done, otherwise the source sets", () => {
        const latestDone = new Map([["ex-bench", [set(85, 6), set(85, 5)]]]);
        const plan = buildRepeatDraft({ source, latestDone, targetDate: "2026-11-25", id: "workout-new", makeId });
        expect(plan.exercises[0].sets.map((item) => [item.weight, item.repetitions])).toEqual([[85, 6], [85, 5]]);
        expect(plan.exercises[1].sets.map((item) => [item.weight, item.repetitions, item.restSeconds])).toEqual([[20, 12, 90]]);
    });

    it("plans fresh rows: no RPE, nothing done, no notes, no supersets, new ids", () => {
        const plan = buildRepeatDraft({ source, latestDone: new Map(), targetDate: "2026-11-25", id: "workout-new", makeId });
        expect(plan).toMatchObject({ id: "workout-new", date: "2026-11-25", status: "planned", title: "Тренування", workoutType: "push", notes: null, durationOverride: null, supersetGroups: [] });
        for (const item of plan.exercises) {
            expect(item).toMatchObject({ notes: null, supersetGroupId: null });
            expect(item.id).not.toMatch(/^we-/);
            for (const planned of item.sets) {
                expect(planned).toMatchObject({ rpe: null, isCompleted: false, notes: null });
                expect(planned.id).toMatch(/fresh/);
            }
        }
        expect(plan.cardio).toEqual([{ ...source.cardio[0], notes: null }]);
    });
});

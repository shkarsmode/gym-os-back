import { applyOps, ResolvedExercise, UpdateOp } from "./ops";
import { McpToolError } from "./rules";
import { DraftExercise, DraftSet, DraftWorkout } from "./workout";

let counter = 0;
const makeId = (prefix: string) => `${prefix}-new-${++counter}`;

function set(overrides: Partial<DraftSet> = {}): DraftSet {
    return { id: `set-${++counter}`, type: "working", weight: 80, repetitions: 8, durationSeconds: null, rpe: 8, restSeconds: 120, isCompleted: false, notes: null, ...overrides };
}

function exercise(name: string, overrides: Partial<DraftExercise> = {}): DraftExercise {
    return { id: `we-${name}`, exerciseId: `ex-${name}`, name, isTimed: false, notes: null, supersetGroupId: null, sets: [set(), set()], ...overrides };
}

function workout(exercises: DraftExercise[], groups: string[] = []): DraftWorkout {
    return {
        id: "workout-1",
        userId: "user-owner",
        date: "2026-11-27",
        title: "Груди",
        status: "planned",
        workoutType: "push",
        notes: null,
        durationOverride: 75,
        startedAt: null,
        finishedAt: null,
        firstSetAt: null,
        lastSetAt: null,
        updatedAt: new Date("2026-11-25T10:00:00.123Z"),
        supersetGroups: groups.map((id) => ({ id, restSeconds: 90 })),
        exercises,
        cardio: []
    };
}

const resolved = (entries: Array<[number, ResolvedExercise]>) => new Map(entries);

function apply(draft: DraftWorkout, ops: UpdateOp[], map = resolved([])) {
    return applyOps(draft, ops, map, makeId);
}

function code(run: () => unknown) {
    try {
        run();
    } catch (error) {
        return (error as McpToolError).code;
    }
    return "no error";
}

describe("MCP ops: sets", () => {
    it("changes a planned set without touching its RPE", () => {
        const draft = workout([exercise("bench")]);
        const changes = apply(draft, [{ op: "set_set", exercise: 1, set: 2, weight: 82.5, reps: 6 }]);
        expect(draft.exercises[0].sets[1]).toMatchObject({ weight: 82.5, repetitions: 6, rpe: 8 });
        expect(changes[0]).toContain("bench set 2");
    });

    it("refuses to change or remove a completed set", () => {
        const draft = workout([exercise("bench", { sets: [set({ isCompleted: true })] })]);
        expect(code(() => apply(draft, [{ op: "set_set", exercise: 1, set: 1, weight: 90 }]))).toBe("SET_COMPLETED");
        expect(code(() => apply(draft, [{ op: "remove_set", exercise: 1, set: 1 }]))).toBe("SET_COMPLETED");
    });

    it("adds a set without RPE, inheriting the rest of the set before it", () => {
        const draft = workout([exercise("bench")]);
        apply(draft, [{ op: "add_set", exercise: 1, position: 1, type: "warmup", weight: 40, reps: 12 }]);
        expect(draft.exercises[0].sets[0]).toMatchObject({ type: "warmup", weight: 40, repetitions: 12, rpe: null, isCompleted: false, restSeconds: 120 });
        expect(draft.exercises[0].sets).toHaveLength(3);
    });

    it("stores seconds instead of reps for a timed set", () => {
        const draft = workout([exercise("plank", { isTimed: true, sets: [] })]);
        apply(draft, [{ op: "add_set", exercise: 1, weight: 0, seconds: 60 }]);
        expect(draft.exercises[0].sets[0]).toMatchObject({ durationSeconds: 60, repetitions: 0, restSeconds: 90 });
    });

    it("rejects an index that does not exist", () => {
        const draft = workout([exercise("bench")]);
        expect(code(() => apply(draft, [{ op: "set_set", exercise: 3, set: 1, weight: 1 }]))).toBe("INVALID_OP");
        expect(code(() => apply(draft, [{ op: "remove_set", exercise: 1, set: 9 }]))).toBe("INVALID_OP");
    });
});

describe("MCP ops: exercises", () => {
    const row: ResolvedExercise = { id: "ex-row", name: "row", isTimed: false };

    it("adds an exercise at the end by default", () => {
        const draft = workout([exercise("bench")]);
        apply(draft, [{ op: "add_exercise", exerciseId: "ex-row", sets: [{ weight: 60, reps: 10 }] }], resolved([[0, row]]));
        expect(draft.exercises.map((item) => item.name)).toEqual(["bench", "row"]);
        expect(draft.exercises[1].sets[0]).toMatchObject({ weight: 60, repetitions: 10, rpe: null });
    });

    it("replaces an exercise but keeps its sets, note and superset slot", () => {
        const draft = workout([exercise("bench", { notes: "pause", supersetGroupId: "g1" }), exercise("fly", { supersetGroupId: "g1" })], ["g1"]);
        const sets = draft.exercises[0].sets.map((item) => item.id);
        apply(draft, [{ op: "replace_exercise", exercise: 1, exerciseId: "ex-row" }], resolved([[0, row]]));
        expect(draft.exercises[0]).toMatchObject({ exerciseId: "ex-row", name: "row", notes: "pause", supersetGroupId: "g1" });
        expect(draft.exercises[0].sets.map((item) => item.id)).toEqual(sets);
    });

    it("refuses to replace or remove an exercise with completed sets", () => {
        const done = () => workout([exercise("bench", { sets: [set({ isCompleted: true })] })]);
        expect(code(() => apply(done(), [{ op: "replace_exercise", exercise: 1, exerciseId: "ex-row" }], resolved([[0, row]])))).toBe("SET_COMPLETED");
        expect(code(() => apply(done(), [{ op: "remove_exercise", exercise: 1 }]))).toBe("SET_COMPLETED");
    });

    it("dissolves a superset that is left with one member", () => {
        const draft = workout([exercise("bench", { supersetGroupId: "g1" }), exercise("fly", { supersetGroupId: "g1" }), exercise("dip")], ["g1"]);
        apply(draft, [{ op: "remove_exercise", exercise: 2 }]);
        expect(draft.exercises.map((item) => item.supersetGroupId)).toEqual([null, null]);
        expect(draft.supersetGroups).toEqual([]);
    });

    it("refuses to insert into the middle of a superset", () => {
        const draft = workout([exercise("bench", { supersetGroupId: "g1" }), exercise("fly", { supersetGroupId: "g1" })], ["g1"]);
        expect(code(() => apply(draft, [{ op: "add_exercise", exerciseId: "ex-row", position: 2 }], resolved([[0, row]])))).toBe("INVALID_OP");
    });

    it("reorders by current numbers and keeps supersets together", () => {
        const draft = workout([exercise("bench"), exercise("row"), exercise("dip")]);
        apply(draft, [{ op: "reorder", order: [3, 1, 2] }]);
        expect(draft.exercises.map((item) => item.name)).toEqual(["dip", "bench", "row"]);

        const grouped = workout([exercise("bench", { supersetGroupId: "g1" }), exercise("fly", { supersetGroupId: "g1" }), exercise("dip")], ["g1"]);
        expect(code(() => apply(grouped, [{ op: "reorder", order: [1, 3, 2] }]))).toBe("SUPERSET_SPLIT");
        expect(code(() => apply(workout([exercise("bench"), exercise("row")]), [{ op: "reorder", order: [1, 1] }]))).toBe("INVALID_OP");
    });

    it("applies ops in order, so numbers refer to the state after the previous op", () => {
        const draft = workout([exercise("bench"), exercise("row")]);
        apply(draft, [{ op: "remove_exercise", exercise: 1 }, { op: "set_set", exercise: 1, set: 1, weight: 70 }]);
        expect(draft.exercises[0]).toMatchObject({ name: "row" });
        expect(draft.exercises[0].sets[0].weight).toBe(70);
    });
});

describe("MCP ops: notes and date", () => {
    it("sets and clears notes", () => {
        const draft = workout([exercise("bench")]);
        apply(draft, [{ op: "set_workout_notes", notes: "  deload week " }, { op: "set_exercise_notes", exercise: 1, notes: "slow eccentric" }]);
        expect(draft.notes).toBe("deload week");
        expect(draft.exercises[0].notes).toBe("slow eccentric");
        apply(draft, [{ op: "set_workout_notes", notes: " " }]);
        expect(draft.notes).toBeNull();
    });

    it("moves the date and rejects an invalid one", () => {
        const draft = workout([exercise("bench")]);
        apply(draft, [{ op: "set_date", date: "2026-11-28" }]);
        expect(draft.date).toBe("2026-11-28");
        expect(code(() => apply(draft, [{ op: "set_date", date: "2026-13-01" }]))).toBe("INVALID_DATE");
    });

    it("never touches durationOverride", () => {
        const draft = workout([exercise("bench")]);
        apply(draft, [{ op: "set_date", date: "2026-11-29" }, { op: "remove_set", exercise: 1, set: 1 }]);
        expect(draft.durationOverride).toBe(75);
    });
});

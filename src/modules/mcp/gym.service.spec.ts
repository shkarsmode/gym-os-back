import { ConflictException } from "@nestjs/common";
import { McpGymService } from "./gym.service";
import { loadMcpConfig } from "./mcp.config";
import { McpAuthContext } from "./oauth/oauth.service";

const CTX: McpAuthContext = {
    userId: "user-owner",
    email: "owner@example.com",
    displayName: "Owner",
    role: "free",
    approved: true,
    clientId: "mcp-client",
    scopes: ["gymos.read", "gymos.write"],
    tokenId: "token-1"
};
const VERSION_DATE = new Date("2026-11-25T08:00:00.123Z");
const VERSION = VERSION_DATE.getTime().toString(36);
const CATALOG = [
    { id: "ex-bench", name: "Жим лежачи", aliases: ["Bench Press"], primaryMuscleGroup: "Груди", secondaryMuscleGroups: ["Трицепс"], equipment: "Штанга", isTimed: false },
    { id: "ex-bench-close", name: "Жим лежачи вузьким хватом", aliases: [], primaryMuscleGroup: "Трицепс", secondaryMuscleGroups: [], equipment: "Штанга", isTimed: false },
    { id: "ex-row", name: "Тяга штанги в нахилі", aliases: ["Barbell Row"], primaryMuscleGroup: "Спина", secondaryMuscleGroups: [], equipment: "Штанга", isTimed: false }
];

function set(id: string, overrides: Record<string, unknown> = {}) {
    return { id, type: "working", weight: "80.00", repetitions: 8, durationSeconds: null, rpe: "8.0", restSeconds: 120, isCompleted: false, notes: null, ...overrides };
}

function row(overrides: Record<string, unknown> = {}) {
    return {
        id: "w-plan",
        userId: CTX.userId,
        date: new Date("2026-11-27T12:00:00.000Z"),
        title: "Груди",
        status: "planned",
        workoutType: "push",
        notes: null,
        durationOverride: 75,
        startedAt: null,
        finishedAt: null,
        firstSetAt: null,
        lastSetAt: null,
        updatedAt: VERSION_DATE,
        supersetGroups: [],
        cardioSessions: [],
        exercises: [{
            id: "we-1",
            exerciseId: "ex-bench",
            order: 1,
            notes: null,
            supersetGroupId: null,
            exercise: { id: "ex-bench", name: "Жим лежачи", isTimed: false },
            sets: [set("s1"), set("s2")]
        }],
        ...overrides
    };
}

function setup(rows: any[] = [row()]) {
    const entries: any[] = [];
    const audit = { record: async (entry: unknown) => void entries.push(entry), recent: async () => [] };
    const workouts = {
        saveFull: jest.fn(async (_user: string, id: string) => ({ ok: true, id, updatedAt: "2026-11-25T10:00:00.456Z" })),
        remove: jest.fn(async () => ({ ok: true }))
    };
    const bodyweight = {
        findMine: jest.fn(async () => [] as any[]),
        createMine: jest.fn(async (_user: string, dto: any) => ({ id: "bw-1", ...dto }))
    };
    const templates = { findMine: async () => [], findAll: async () => [] };
    const prisma = {
        workout: {
            findUnique: async ({ where }: any) => rows.find((item) => item.id === where.id) ?? null,
            findMany: async ({ where }: any) => rows
                .filter((item) => item.userId === where.userId)
                .filter((item) => !where.status || item.status === where.status)
                .filter((item) => !where.date || (item.date >= where.date.gte && item.date < where.date.lt))
                .map((item) => ({ ...item, _count: { exercises: item.exercises.length } })),
            count: async () => 0
        },
        workoutExercise: { findFirst: async () => null, findMany: async () => [] },
        exercise: { findMany: async () => CATALOG }
    };
    const config = loadMcpConfig({ MCP_PUBLIC_URL: "https://gymos.example", MCP_ALLOWED_EMAILS: CTX.email } as NodeJS.ProcessEnv);
    const service = new McpGymService(prisma as never, workouts as never, bodyweight as never, templates as never, audit as never, config);
    return { service, workouts, bodyweight, entries };
}

function at(iso: string) {
    jest.useFakeTimers({ now: new Date(iso), doNotFake: ["nextTick", "queueMicrotask", "setImmediate", "setTimeout", "setInterval"] });
}

async function failure(promise: Promise<unknown>) {
    try {
        await promise;
    } catch (error) {
        return (error as { code?: string }).code;
    }
    return "no error";
}

const plan = (overrides: Record<string, unknown> = {}) => ({
    date: "2026-11-28",
    workoutType: "push",
    exercises: [{ exerciseId: "ex-bench", sets: [{ weight: 60, reps: 10 }, { type: "working" as const, weight: 80, reps: 8, restSeconds: 150 }] }],
    ...overrides
});

beforeEach(() => at("2026-11-25T10:00:00Z"));
afterEach(() => jest.useRealTimers());

describe("MCP writes: planning", () => {
    it("never plans on a past date, with today computed in Kyiv", async () => {
        at("2026-11-25T22:30:00Z");
        const { service, workouts, entries } = setup([]);
        expect(await failure(service.createPlanned(CTX, plan({ date: "2026-11-25" })))).toBe("PAST_DATE");
        expect(workouts.saveFull).not.toHaveBeenCalled();
        expect(entries[0]).toMatchObject({ tool: "create_planned_workout", result: "rejected" });
    });

    it("creates a planned workout without RPE, through saveFull with a strict base", async () => {
        const { service, workouts, entries } = setup([]);
        const text = await service.createPlanned(CTX, plan());
        expect(text).toContain("Created planned workout");
        const [, id, dto, isAdmin, , options] = workouts.saveFull.mock.calls[0] as any[];
        expect(id).toMatch(/^workout-/);
        expect(isAdmin).toBe(false);
        expect(options).toEqual({ strictBase: true });
        expect(dto).toMatchObject({ date: "2026-11-28", status: "planned", workoutType: "push", title: "Тренування" });
        expect(dto.durationOverride).toBeUndefined();
        expect(dto.baseUpdatedAt).toBeUndefined();
        for (const planned of dto.exercises[0].sets) {
            expect(planned.rpe).toBeUndefined();
            expect(planned.isCompleted).toBe(false);
        }
        expect(dto.exercises[0].sets[1]).toMatchObject({ weight: 80, repetitions: 8, restSeconds: 150 });
        expect(entries[0]).toMatchObject({ result: "ok", before: null, after: expect.objectContaining({ date: "2026-11-28" }) });
    });

    it("refuses a second workout on the same date", async () => {
        const { service, workouts } = setup();
        expect(await failure(service.createPlanned(CTX, plan({ date: "2026-11-27" })))).toBe("DATE_TAKEN");
        expect(workouts.saveFull).not.toHaveBeenCalled();
    });

    it("replaces only a planned workout, in place and without touching durationOverride", async () => {
        const { service, workouts } = setup();
        await service.createPlanned(CTX, plan({ date: "2026-11-27", replace: true }));
        const [, id, dto] = workouts.saveFull.mock.calls[0] as any[];
        expect(id).toBe("w-plan");
        expect(dto.baseUpdatedAt).toBe(VERSION_DATE.toISOString());
        expect(dto.durationOverride).toBe(75);

        const completed = setup([row({ status: "completed" })]);
        expect(await failure(completed.service.createPlanned(CTX, plan({ date: "2026-11-27", replace: true })))).toBe("REPLACE_NOT_ALLOWED");
        expect(completed.workouts.saveFull).not.toHaveBeenCalled();
    });

    it("resolves a clear exercise name and refuses an ambiguous one", async () => {
        const { service, workouts } = setup([]);
        await service.createPlanned(CTX, plan({ exercises: [{ exerciseName: "Bench Press", sets: [{ weight: 60, reps: 10 }] }] }));
        expect((workouts.saveFull.mock.calls[0] as any[])[2].exercises[0].exerciseId).toBe("ex-bench");
        expect(await failure(service.createPlanned(CTX, plan({ exercises: [{ exerciseName: "Жим", sets: [{ weight: 60, reps: 10 }] }] })))).toBe("AMBIGUOUS_EXERCISE");
        expect(await failure(service.createPlanned(CTX, plan({ exercises: [{ exerciseId: "ex-unknown", sets: [{ weight: 60, reps: 10 }] }] })))).toBe("UNKNOWN_EXERCISE");
    });
});

describe("MCP writes: editing a plan", () => {
    const bump = { op: "set_set" as const, exercise: 1, set: 2, weight: 82.5 };

    it("does not edit completed or active workouts", async () => {
        expect(await failure(setup([row({ status: "completed" })]).service.updatePlanned(CTX, { id: "w-plan", version: VERSION, ops: [bump] }))).toBe("NOT_PLANNED");
        expect(await failure(setup([row({ status: "active", date: new Date("2026-11-25T12:00:00Z") })]).service.updatePlanned(CTX, { id: "w-plan", version: VERSION, ops: [bump] }))).toBe("NOT_PLANNED");
    });

    it("answers CONFLICT for a stale version and writes nothing", async () => {
        const { service, workouts, entries } = setup();
        const stale = (VERSION_DATE.getTime() - 1).toString(36);
        expect(await failure(service.updatePlanned(CTX, { id: "w-plan", version: stale, ops: [bump] }))).toBe("CONFLICT");
        expect(workouts.saveFull).not.toHaveBeenCalled();
        expect(entries[0]).toMatchObject({ result: "rejected", error: expect.stringContaining("CONFLICT") });
    });

    it("saves with the version as a strict base and keeps what it did not touch", async () => {
        const { service, workouts, entries } = setup([row({ firstSetAt: null, notes: "keep" })]);
        const text = await service.updatePlanned(CTX, { id: "w-plan", version: VERSION, ops: [bump] });
        expect(text).toContain("Жим лежачи set 2");
        const [, , dto, , , options] = workouts.saveFull.mock.calls[0] as any[];
        expect(options).toEqual({ strictBase: true });
        expect(dto.baseUpdatedAt).toBe(VERSION_DATE.toISOString());
        expect(dto.durationOverride).toBe(75);
        expect(dto.notes).toBe("keep");
        expect(dto.exercises[0].sets.map((item: any) => [item.id, item.weight, item.rpe])).toEqual([["s1", 80, 8], ["s2", 82.5, 8]]);
        expect(entries[0].before.exercises[0].sets[1].weight).toBe(80);
        expect(entries[0].after.exercises[0].sets[1].weight).toBe(82.5);
    });

    it("refuses to change a completed set inside a plan", async () => {
        const rows = [row({ exercises: [{ ...row().exercises[0], sets: [set("s1", { isCompleted: true }), set("s2")] }] })];
        expect(await failure(setup(rows).service.updatePlanned(CTX, { id: "w-plan", version: VERSION, ops: [{ op: "set_set", exercise: 1, set: 1, weight: 90 }] }))).toBe("SET_COMPLETED");
    });

    it("makes a missed plan move to today or later", async () => {
        const missed = () => setup([row({ date: new Date("2026-11-20T12:00:00Z") })]);
        expect(await failure(missed().service.updatePlanned(CTX, { id: "w-plan", version: VERSION, ops: [bump] }))).toBe("PAST_DATE");
        const moved = missed();
        await moved.service.updatePlanned(CTX, { id: "w-plan", version: VERSION, ops: [bump, { op: "set_date", date: "2026-11-29" }] });
        expect((moved.workouts.saveFull.mock.calls[0] as any[])[2].date).toBe("2026-11-29");
    });

    it("refuses to move a plan onto a date that already has a workout", async () => {
        const rows = [row(), row({ id: "w-other", status: "completed", date: new Date("2026-11-29T12:00:00Z") })];
        expect(await failure(setup(rows).service.updatePlanned(CTX, { id: "w-plan", version: VERSION, ops: [{ op: "set_date", date: "2026-11-29" }] }))).toBe("DATE_TAKEN");
    });

    it("never leaves a workout empty", async () => {
        expect(await failure(setup().service.updatePlanned(CTX, { id: "w-plan", version: VERSION, ops: [{ op: "remove_exercise", exercise: 1 }] }))).toBe("EMPTY");
    });

    it("reports a concurrent save in the app as CONFLICT", async () => {
        const { service, workouts } = setup();
        workouts.saveFull.mockRejectedValueOnce(new ConflictException({ code: "STALE_WORKOUT", message: "changed" }));
        expect(await failure(service.updatePlanned(CTX, { id: "w-plan", version: VERSION, ops: [bump] }))).toBe("CONFLICT");
    });

    it("treats another member's workout as missing", async () => {
        expect(await failure(setup([row({ userId: "someone-else" })]).service.getWorkout(CTX, { id: "w-plan" }))).toBe("NOT_FOUND");
    });
});

describe("MCP writes: logging during a workout", () => {
    const active = (sets = [set("s1", { isCompleted: true }), set("s2")]) => row({
        status: "active",
        date: new Date("2026-11-25T12:00:00Z"),
        firstSetAt: new Date("2026-11-25T09:30:00Z"),
        exercises: [{ ...row().exercises[0], sets }]
    });

    it("works only on an active workout and needs the version", async () => {
        expect(await failure(setup().service.logSet(CTX, { workoutId: "w-plan", version: VERSION, exerciseIndex: 1, weight: 80, reps: 8 }))).toBe("NOT_ACTIVE");
        expect(await failure(setup([active()]).service.logSet(CTX, { workoutId: "w-plan", version: "", exerciseIndex: 1, weight: 80, reps: 8 }))).toBe("VERSION_REQUIRED");
    });

    it("fills the next undone set and moves the gym clock", async () => {
        const { service, workouts } = setup([active()]);
        const text = await service.logSet(CTX, { workoutId: "w-plan", version: VERSION, exerciseIndex: 1, weight: 85, reps: 6 });
        expect(text).toContain("set 2");
        const [, , dto] = workouts.saveFull.mock.calls[0] as any[];
        expect(dto.status).toBe("active");
        expect(dto.exercises[0].sets[1]).toMatchObject({ id: "s2", weight: 85, repetitions: 6, isCompleted: true, rpe: 8 });
        expect(dto.firstSetAt).toBe("2026-11-25T09:30:00.000Z");
        expect(dto.lastSetAt).toBe("2026-11-25T10:00:00.000Z");
    });

    it("refuses to rewrite a completed set and to guess when everything is done", async () => {
        expect(await failure(setup([active()]).service.logSet(CTX, { workoutId: "w-plan", version: VERSION, exerciseIndex: 1, setIndex: 1, weight: 90, reps: 5 }))).toBe("SET_COMPLETED");
        const finished = setup([active([set("s1", { isCompleted: true })])]);
        expect(await failure(finished.service.logSet(CTX, { workoutId: "w-plan", version: VERSION, exerciseIndex: 1, weight: 90, reps: 5 }))).toBe("ALL_SETS_DONE");
        await finished.service.logSet(CTX, { workoutId: "w-plan", version: VERSION, exerciseIndex: 1, setIndex: 2, weight: 90, reps: 5 });
        expect((finished.workouts.saveFull.mock.calls[0] as any[])[2].exercises[0].sets).toHaveLength(2);
    });
});

describe("MCP writes: deleting and bodyweight", () => {
    it("deletes only a planned workout, guarded by status and version", async () => {
        const { service, workouts } = setup();
        expect(await failure(service.deletePlanned(CTX, { id: "w-plan", confirm: false }))).toBe("CONFIRM_REQUIRED");
        await service.deletePlanned(CTX, { id: "w-plan", confirm: true, version: VERSION });
        expect(workouts.remove).toHaveBeenCalledWith(CTX.userId, "w-plan", false, { status: "planned", updatedAt: VERSION_DATE });
        expect(await failure(setup([row({ status: "completed" })]).service.deletePlanned(CTX, { id: "w-plan", confirm: true }))).toBe("NOT_PLANNED");
    });

    it("logs bodyweight through the existing service and validation", async () => {
        const { service, bodyweight } = setup();
        expect(await failure(service.addBodyweight(CTX, { date: "2026-11-26", kg: 82 }))).toBe("FUTURE_DATE");
        expect(await failure(service.addBodyweight(CTX, { date: "2026-11-25", kg: 500 }))).toBe("INVALID_INPUT");
        await service.addBodyweight(CTX, { date: "2026-11-25", kg: 82.4 });
        expect(bodyweight.createMine).toHaveBeenCalledWith(CTX.userId, expect.objectContaining({ date: "2026-11-25", bodyweight: 82.4 }));
    });
});

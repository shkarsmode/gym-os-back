import { PrismaService } from "../../prisma/prisma.service";
import { SaveWorkoutDto } from "./dto/workout.dto";
import { WorkoutsService } from "./workouts.service";

/**
 * The product rule: a COMPLETED workout has no unfinished sets. No exceptions, no dialog.
 *
 * A session could be finished with sets still unticked — the client only ticks a set when
 * the user taps it, and nobody taps the last one. Those rows reached the DB with
 * isCompleted: false, and every consumer that counts "performed" sets then read the
 * exercise as empty: the feed rendered a real chest day as "Прес 0 підходів" and the
 * volume totals silently lost that work.
 *
 * Every path that moves a workout into "completed" — saveFull, finish(), and the
 * supersede branches of start()/saveFull-active — must close its sets. These tests drive
 * the service with a stub PrismaService and assert on what it ASKED the database to do,
 * because the ordering and the filters are where this rule actually lives.
 */

type Op = { model: string; method: string; args: any };

interface StubOptions {
    /** What workout.findUnique answers — the pre-existing row, or null for a new workout. */
    workout?: any;
    /** What workout.findMany answers — the sessions a new "active" one supersedes. */
    activeWorkouts?: Array<{ id: string }>;
}

function createPrisma(options: StubOptions = {}) {
    const writes: Op[] = [];
    const transactions: Op[][] = [];
    const write = (model: string, method: string) => (args: any) => {
        const op: Op = { model, method, args };
        writes.push(op);
        return op;
    };

    const prisma: any = {
        workout: {
            findUnique: async () => options.workout ?? null,
            findMany: async () => options.activeWorkouts ?? [],
            count: async () => 0,
            create: write("workout", "create"),
            update: write("workout", "update"),
            updateMany: write("workout", "updateMany")
        },
        workoutExercise: {
            deleteMany: write("workoutExercise", "deleteMany")
        },
        workoutSet: {
            updateMany: write("workoutSet", "updateMany"),
            deleteMany: write("workoutSet", "deleteMany")
        },
        cardioSession: {
            deleteMany: write("cardioSession", "deleteMany")
        },
        // saveFull drops sets for exercises the catalogue does not know; treat every id
        // in the payload as real so that filter never quietly swallows a test fixture.
        exercise: {
            findMany: async ({ where }: any) => (where?.id?.in ?? []).map((id: string) => ({ id }))
        },
        // The batch-array form: the service must never hand Prisma a callback, so the
        // stub only accepts the array and records it.
        $transaction: async (ops: Op[]) => {
            transactions.push(ops);
            return ops;
        }
    };

    return { prisma: prisma as PrismaService, writes, transactions };
}

const USER = "user-owner";
const WORKOUT = "workout-today";

function existingRow(overrides: Record<string, unknown> = {}) {
    return {
        id: WORKOUT,
        userId: USER,
        startedAt: null,
        finishedAt: null,
        _count: { exercises: 1 },
        ...overrides
    };
}

function saveDto(
    status: "planned" | "active" | "completed",
    sets: Array<Record<string, unknown>>
): SaveWorkoutDto {
    return {
        date: "2026-08-20",
        title: "Груди",
        status,
        workoutType: "custom",
        exercises: [{ exerciseId: "ex-bench", order: 1, sets }]
    } as unknown as SaveWorkoutDto;
}

const opsOf = (ops: Op[], model: string, method: string) =>
    ops.filter((op) => op.model === model && op.method === method);

const oneOp = (ops: Op[], model: string, method: string) => {
    const found = opsOf(ops, model, method);
    expect(found).toHaveLength(1);
    return found[0];
};

/** The set rows a create/update operation would insert, flattened across exercises. */
const setsWrittenBy = (op: Op) =>
    (op.args.data.exercises.create as any[]).flatMap((exercise) => exercise.sets.create as any[]);

/** The op that writes the workout itself — create for a new row, update for an existing one. */
const workoutWriteIn = (ops: Op[]) =>
    ops.find((op) => op.model === "workout" && (op.method === "create" || op.method === "update"))!;

describe("saveFull marks the sets of a completed workout", () => {
    it("completes sets the payload still says are unfinished", async () => {
        const { prisma, transactions } = createPrisma({ workout: existingRow() });
        const service = new WorkoutsService(prisma);

        await service.saveFull(USER, WORKOUT, saveDto("completed", [
            { type: "working", weight: 60, repetitions: 10, isCompleted: true },
            { type: "working", weight: 60, repetitions: 9, isCompleted: false },
            { type: "working", weight: 60, repetitions: 8, isCompleted: false }
        ]));

        const written = setsWrittenBy(workoutWriteIn(transactions[0]));
        // The exact shape that rendered "Прес 0 підходів" in the feed: three real sets,
        // two of them never tapped.
        expect(written.map((set) => set.isCompleted)).toEqual([true, true, true]);
    });

    it("completes a set whose isCompleted the payload omits entirely", async () => {
        const { prisma, transactions } = createPrisma({ workout: existingRow() });
        const service = new WorkoutsService(prisma);

        await service.saveFull(USER, WORKOUT, saveDto("completed", [
            { type: "working", weight: 80, repetitions: 5 }
        ]));

        // The client drops isCompleted from sets it never rendered a tick for, so the
        // rule cannot rely on the flag being present and false.
        expect(setsWrittenBy(workoutWriteIn(transactions[0]))[0].isCompleted).toBe(true);
    });

    it("keeps the incoming ticks verbatim while the session is still active", async () => {
        const { prisma, transactions } = createPrisma({ workout: existingRow() });
        const service = new WorkoutsService(prisma);

        await service.saveFull(USER, WORKOUT, saveDto("active", [
            { type: "working", weight: 60, repetitions: 10, isCompleted: true },
            { type: "working", weight: 60, repetitions: 10, isCompleted: false }
        ]));

        // A live session is exactly where an unticked set is meaningful — it is the set
        // the user has not done yet, and the app renders it as the next one up.
        const written = setsWrittenBy(workoutWriteIn(transactions[0]));
        expect(written.map((set) => set.isCompleted)).toEqual([true, false]);
    });

    it("keeps the incoming ticks verbatim on a planned session", async () => {
        const { prisma, transactions } = createPrisma({ workout: existingRow() });
        const service = new WorkoutsService(prisma);

        await service.saveFull(USER, WORKOUT, saveDto("planned", [
            { type: "working", weight: 100, repetitions: 5, isCompleted: false },
            { type: "warmup", weight: 40, repetitions: 10, isCompleted: false }
        ]));

        const written = setsWrittenBy(workoutWriteIn(transactions[0]));
        expect(written.every((set) => set.isCompleted === false)).toBe(true);
    });
});

describe("starting a session closes the previous one", () => {
    it("completes the sets of the user's previously active workout", async () => {
        const { prisma, transactions } = createPrisma({ workout: existingRow() });
        const service = new WorkoutsService(prisma);

        await service.saveFull(USER, WORKOUT, saveDto("active", [
            { type: "working", weight: 60, repetitions: 10, isCompleted: false }
        ]));

        const closeSets = oneOp(transactions[0], "workoutSet", "updateMany");
        expect(closeSets.args.data).toEqual({ isCompleted: true });
        expect(closeSets.args.where).toEqual({
            isCompleted: false,
            workoutExercise: { workout: { userId: USER, status: "active", id: { not: WORKOUT } } }
        });
    });

    it("never touches the sets of the session being saved", async () => {
        const { prisma, transactions } = createPrisma({ workout: existingRow() });
        const service = new WorkoutsService(prisma);

        await service.saveFull(USER, WORKOUT, saveDto("active", [
            { type: "working", weight: 60, repetitions: 10, isCompleted: false }
        ]));

        // Without `id: { not: ... }` starting a workout would instantly tick every set
        // in it, and the user would open a session with nothing left to do.
        const closeSets = oneOp(transactions[0], "workoutSet", "updateMany");
        expect(closeSets.args.where.workoutExercise.workout.id).toEqual({ not: WORKOUT });
    });

    it("never touches another user's unfinished sets", async () => {
        const { prisma, transactions } = createPrisma({ workout: existingRow() });
        const service = new WorkoutsService(prisma);

        await service.saveFull(USER, WORKOUT, saveDto("active", [
            { type: "working", weight: 60, repetitions: 10, isCompleted: false }
        ]));

        const closeSets = oneOp(transactions[0], "workoutSet", "updateMany");
        expect(closeSets.args.where.workoutExercise.workout.userId).toBe(USER);
    });

    it("closes the sets before flipping the old session to completed, in the same transaction", async () => {
        const { prisma, transactions } = createPrisma({ workout: existingRow() });
        const service = new WorkoutsService(prisma);

        await service.saveFull(USER, WORKOUT, saveDto("active", [
            { type: "working", weight: 60, repetitions: 10, isCompleted: false }
        ]));

        // One batch, so a crash between the two cannot leave a completed workout with
        // half its sets unfinished — the state the feed reads as "0 підходів".
        expect(transactions).toHaveLength(1);
        const batch = transactions[0];
        const closeSets = batch.indexOf(oneOp(batch, "workoutSet", "updateMany"));
        const flipStatus = batch.indexOf(oneOp(batch, "workout", "updateMany"));
        expect(closeSets).toBeLessThan(flipStatus);
    });

    it("leaves other sessions alone when the save is not a start", async () => {
        const { prisma, transactions } = createPrisma({ workout: existingRow() });
        const service = new WorkoutsService(prisma);

        await service.saveFull(USER, WORKOUT, saveDto("completed", [
            { type: "working", weight: 60, repetitions: 10, isCompleted: false }
        ]));

        // Only the deletes that precede the full replace of THIS workout.
        expect(opsOf(transactions[0], "workoutSet", "updateMany")).toHaveLength(0);
        expect(opsOf(transactions[0], "workout", "updateMany")).toHaveLength(0);
    });
});

describe("finish()", () => {
    it("completes the sets and flips the workout in one transaction", async () => {
        const { prisma, transactions } = createPrisma({ workout: { id: WORKOUT, userId: USER } });
        const service = new WorkoutsService(prisma);

        await service.finish(USER, WORKOUT);

        expect(transactions).toHaveLength(1);
        const batch = transactions[0];
        const completeSets = oneOp(batch, "workoutSet", "updateMany");
        const flip = oneOp(batch, "workout", "update");
        expect(completeSets.args.data).toEqual({ isCompleted: true });
        expect(flip.args.data.status).toBe("completed");
        expect(flip.args.data.finishedAt).toBeInstanceOf(Date);
    });

    it("touches only the sets of the workout being finished", async () => {
        const { prisma, transactions } = createPrisma({ workout: { id: WORKOUT, userId: USER } });
        const service = new WorkoutsService(prisma);

        await service.finish(USER, WORKOUT);

        const completeSets = oneOp(transactions[0], "workoutSet", "updateMany");
        expect(completeSets.args.where.workoutExercise).toEqual({ workoutId: WORKOUT });
    });

    it("only rewrites sets that are still incomplete", async () => {
        const { prisma, transactions } = createPrisma({ workout: { id: WORKOUT, userId: USER } });
        const service = new WorkoutsService(prisma);

        await service.finish(USER, WORKOUT);

        // Filtering on isCompleted: false keeps the write off rows that are already
        // done, so finishing a long session is one small update rather than a rewrite
        // of every set in it.
        const completeSets = oneOp(transactions[0], "workoutSet", "updateMany");
        expect(completeSets.args.where.isCompleted).toBe(false);
    });

    it("refuses to finish another user's workout", async () => {
        const { prisma, transactions } = createPrisma({ workout: { id: WORKOUT, userId: "someone-else" } });
        const service = new WorkoutsService(prisma);

        await expect(service.finish(USER, WORKOUT)).rejects.toThrow();
        expect(transactions).toHaveLength(0);
    });
});

describe("start()", () => {
    it("completes the sets of every superseded active session", async () => {
        const { prisma, writes } = createPrisma({
            workout: { id: WORKOUT, userId: USER },
            activeWorkouts: [{ id: "stale-monday" }, { id: "stale-tuesday" }]
        });
        const service = new WorkoutsService(prisma);

        await service.start(USER, WORKOUT);

        // Two forgotten sessions left running on two devices: both get closed properly,
        // not just the most recent one.
        const closed = opsOf(writes, "workoutSet", "updateMany").map(
            (op) => op.args.where.workoutExercise.workoutId
        );
        expect(closed).toEqual(["stale-monday", "stale-tuesday"]);
    });

    it("closes their sets before flipping them to completed", async () => {
        const { prisma, writes } = createPrisma({
            workout: { id: WORKOUT, userId: USER },
            activeWorkouts: [{ id: "stale-monday" }]
        });
        const service = new WorkoutsService(prisma);

        await service.start(USER, WORKOUT);

        // The status flip narrows `status: "active"`, so once it runs the superseded
        // sets can no longer be found by that filter.
        const closeSets = writes.indexOf(oneOp(writes, "workoutSet", "updateMany"));
        const flipStatus = writes.indexOf(oneOp(writes, "workout", "updateMany"));
        expect(closeSets).toBeLessThan(flipStatus);
    });

    it("leaves the sets of the session being started untouched", async () => {
        const { prisma, writes } = createPrisma({
            workout: { id: WORKOUT, userId: USER },
            activeWorkouts: [{ id: "stale-monday" }]
        });
        const service = new WorkoutsService(prisma);

        await service.start(USER, WORKOUT);

        const touched = opsOf(writes, "workoutSet", "updateMany").map(
            (op) => op.args.where.workoutExercise.workoutId
        );
        expect(touched).not.toContain(WORKOUT);
        expect(oneOp(writes, "workout", "update").args.data.status).toBe("active");
    });

    it("writes nothing when there is no other active session", async () => {
        const { prisma, writes } = createPrisma({
            workout: { id: WORKOUT, userId: USER },
            activeWorkouts: []
        });
        const service = new WorkoutsService(prisma);

        await service.start(USER, WORKOUT);

        expect(opsOf(writes, "workoutSet", "updateMany")).toHaveLength(0);
    });
});

describe("the timestamps saveFull derives from the status", () => {
    const timingsOf = (op: Op) => op.args.data;

    it("keeps the finishedAt a completed workout already had", async () => {
        const finishedAt = new Date("2026-07-04T18:30:00.000Z");
        const { prisma, transactions } = createPrisma({ workout: existingRow({ finishedAt }) });
        const service = new WorkoutsService(prisma);

        await service.saveFull(USER, WORKOUT, saveDto("completed", [
            { type: "working", weight: 60, repetitions: 10, isCompleted: true }
        ]));

        // Re-saving an old session (editing a note on a July workout) must not stamp it
        // with today — the feed orders on this clock and it would jump to the top.
        expect(timingsOf(workoutWriteIn(transactions[0])).finishedAt).toBe(finishedAt);
    });

    it("invents a finishedAt when a completed workout has none", async () => {
        const { prisma, transactions } = createPrisma({ workout: existingRow({ finishedAt: null }) });
        const service = new WorkoutsService(prisma);

        await service.saveFull(USER, WORKOUT, saveDto("completed", [
            { type: "working", weight: 60, repetitions: 10, isCompleted: true }
        ]));

        // A completed workout with finishedAt NULL was invisible in the feed forever.
        expect(timingsOf(workoutWriteIn(transactions[0])).finishedAt).toBeInstanceOf(Date);
    });

    it("clears finishedAt when a session goes back to active", async () => {
        const finishedAt = new Date("2026-08-19T18:30:00.000Z");
        const { prisma, transactions } = createPrisma({ workout: existingRow({ finishedAt }) });
        const service = new WorkoutsService(prisma);

        await service.saveFull(USER, WORKOUT, saveDto("active", [
            { type: "working", weight: 60, repetitions: 10, isCompleted: false }
        ]));

        // Resuming a session that was finished by mistake: a live workout that still
        // carries a finish time shows up in the feed as done.
        expect(timingsOf(workoutWriteIn(transactions[0])).finishedAt).toBeNull();
    });

    it("keeps the original startedAt of a session that is resumed", async () => {
        const startedAt = new Date("2026-08-20T17:00:00.000Z");
        const { prisma, transactions } = createPrisma({ workout: existingRow({ startedAt }) });
        const service = new WorkoutsService(prisma);

        await service.saveFull(USER, WORKOUT, saveDto("active", [
            { type: "working", weight: 60, repetitions: 10, isCompleted: false }
        ]));

        // Duration is finishedAt - startedAt; restamping the start on every autosave
        // would report a two-hour session as two minutes.
        expect(timingsOf(workoutWriteIn(transactions[0])).startedAt).toBe(startedAt);
    });

    it("leaves both timestamps null on a planned workout", async () => {
        // tier "admin" so the quota check on a brand-new workout does not depend on
        // which calendar week the suite happens to run in.
        const { prisma, transactions } = createPrisma({ workout: null });
        const service = new WorkoutsService(prisma);

        await service.saveFull(USER, WORKOUT, saveDto("planned", [
            { type: "working", weight: 60, repetitions: 10 }
        ]), false, "admin");

        const created = timingsOf(oneOp(transactions[0], "workout", "create"));
        expect(created.startedAt).toBeNull();
        expect(created.finishedAt).toBeNull();
    });
});

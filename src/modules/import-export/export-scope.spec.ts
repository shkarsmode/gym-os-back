import { ImportExportService } from "./import-export.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ScoringService } from "../scoring/scoring.service";
import { RequestUser } from "../../shared/current-user.decorator";

/**
 * /export must never hand a caller another member's sets.
 *
 * `shape` is an unvalidated @Query parameter, so BOTH shapes are reachable by anyone —
 * a client simply omits it. The legacy branch used to pass `where: undefined` to the
 * workout fetch, which meant every workout of every member, fully hydrated: exercises,
 * sets, weights, reps and notes for the whole gym, to any approved account. That defeated
 * the entire point of the windowed payload, whose peer branch was written specifically so
 * that not a single set crosses the wire.
 *
 * These tests pin the property that matters and is easy to regress: whatever the shape,
 * the hydrated rows belong to the caller and everyone else arrives as a summary.
 */

const CALLER: RequestUser = { id: "user-caller", email: "caller@example.com", displayName: "Caller" };

const workoutRow = (id: string, userId: string) => ({
    id,
    userId,
    date: new Date("2026-08-20T00:00:00.000Z"),
    title: "Груди",
    status: "completed",
    workoutType: "custom",
    notes: "секретна нотатка",
    startedAt: null,
    finishedAt: null,
    updatedAt: new Date("2026-08-20T10:00:00.000Z"),
    createdAt: new Date("2026-08-20T09:00:00.000Z"),
    durationOverride: null,
    exercises: [
        {
            id: `${id}-we`,
            exerciseId: "ex-bench",
            order: 1,
            notes: "",
            sets: [
                { id: `${id}-s1`, type: "working", weight: 100, repetitions: 5, durationSeconds: null, rpe: null, restSeconds: 90, isCompleted: true, notes: "" }
            ]
        }
    ],
    cardioSessions: []
});

/**
 * Records every where-clause the workout table is queried with, so the tests can assert
 * on the SCOPE of the read rather than only on what survived serialization. A leak that
 * is filtered after the fact still pulled the data into the process.
 */
function createPrisma(rows: Record<string, unknown>[]) {
    const workoutQueries: any[] = [];
    const empty = { findMany: async () => [], findUnique: async () => null, aggregate: async () => ({ _max: {} }) };
    const prisma: any = {
        user: { findMany: async () => [{ id: CALLER.id, email: CALLER.email, displayName: "Caller", profile: null, createdAt: new Date(), updatedAt: new Date() }] },
        exercise: { findMany: async () => [], aggregate: async () => ({ _max: { updatedAt: null } }) },
        exerciseReaction: { ...empty, aggregate: async () => ({ _max: { updatedAt: null } }) },
        userBodyweightEntry: { findMany: async () => [] },
        featureRequest: { findMany: async () => [] },
        userAchievement: { ...empty },
        personalRecord: { ...empty },
        workout: {
            findMany: async (args: any) => {
                workoutQueries.push(args);
                const where = args?.where || {};
                let result = rows as any[];
                if (typeof where.userId === "string") {
                    result = result.filter((row) => row.userId === where.userId);
                } else if (where.userId && where.userId.not) {
                    result = result.filter((row) => row.userId !== where.userId.not);
                }
                // The windowed shape asks a second time for any active session that fell
                // outside the page. Honour both filters, or that query returns the same
                // rows again and the service legitimately concatenates duplicates.
                if (where.status) {
                    result = result.filter((row) => row.status === where.status);
                }
                if (where.id && Array.isArray(where.id.notIn)) {
                    result = result.filter((row) => !where.id.notIn.includes(row.id));
                }
                return result;
            }
        },
        $queryRaw: async () => []
    };
    return { prisma: prisma as PrismaService, workoutQueries };
}

const scoring = { scoreEveryone: async () => ({ users: {} }) } as unknown as ScoringService;

const ROWS = [workoutRow("mine", CALLER.id), workoutRow("theirs", "user-peer")];

const hydrated = (result: any) => result.workouts.filter((row: any) => Array.isArray(row.exercises));

describe("/export never ships a peer's sets", () => {
    it.each([
        ["the windowed shape", true],
        ["the legacy shape, which anyone reaches by omitting the parameter", false]
    ])("%s hydrates only the caller's own workouts", async (_label, windowed) => {
        const { prisma } = createPrisma(ROWS);
        const service = new ImportExportService(prisma, scoring);

        const result: any = await service.export(CALLER, { windowed });

        const own = hydrated(result);
        expect(own).toHaveLength(1);
        expect(own[0].userId).toBe(CALLER.id);
        // The peer is present — the calendar and activity feed need to know they trained
        // — but carries no exercises key at all, so any set-level function throws on it
        // rather than quietly computing zero.
        const peer = result.workouts.find((row: any) => row.userId === "user-peer");
        expect(peer).toBeDefined();
        expect(peer.exercises).toBeUndefined();
    });

    it.each([
        ["the windowed shape", true],
        ["the legacy shape", false]
    ])("%s reads the hydrated rows scoped to the caller, not filtered afterwards", async (_label, windowed) => {
        // Filtering after the read would still have pulled every member's sets into the
        // process — and one refactor away from serializing them again.
        const { prisma, workoutQueries } = createPrisma(ROWS);
        const service = new ImportExportService(prisma, scoring);

        await service.export(CALLER, { windowed });

        const unscoped = workoutQueries.filter((args) => !args?.where?.userId);
        expect(unscoped).toEqual([]);
    });

    it("does not leak a peer's set data through the serialized payload in any shape", async () => {
        for (const windowed of [true, false]) {
            const { prisma } = createPrisma(ROWS);
            const service = new ImportExportService(prisma, scoring);

            const result: any = await service.export(CALLER, { windowed });

            const serialized = JSON.stringify(result.workouts.filter((row: any) => row.userId === "user-peer"));
            expect(serialized).not.toContain("theirs-s1");
            expect(serialized).not.toContain("ex-bench");
        }
    });
});

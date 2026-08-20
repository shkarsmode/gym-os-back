import { LiveService } from "./live.service";
import { LiveBus } from "./live.bus";
import { PrismaService } from "../../prisma/prisma.service";
import { RequestUser } from "../../shared/current-user.decorator";

/**
 * GET /live/peers must not ship a private member's data.
 *
 * This route was added for the calendar's live refresh and shipped WITHOUT a visibility
 * check, so it handed every member's workout title, notes and totals to the whole gym —
 * including members who had explicitly hidden exactly those — and `team.changed` tells
 * every connected client to re-fetch it. Mirrors export-scope.spec.ts, which pins the
 * same property on /export.
 */

const CALLER: RequestUser = { id: "me", email: "me@example.com", displayName: "Me" };

const row = (id: string, userId: string) => ({
    id,
    userId,
    date: new Date("2026-08-20T00:00:00.000Z"),
    title: "СЕКРЕТНИЙ ЗАГОЛОВОК",
    status: "completed",
    workoutType: "custom",
    notes: "секретна нотатка",
    startedAt: null,
    finishedAt: null,
    updatedAt: new Date("2026-08-20T10:00:00.000Z"),
    durationOverride: null,
    exercises: [{
        id: `${id}-we`,
        exerciseId: "ex-bench",
        order: 1,
        notes: "",
        sets: [{ id: `${id}-s1`, type: "working", weight: 140, repetitions: 5, durationSeconds: null, rpe: null, restSeconds: 90, isCompleted: true, notes: "" }]
    }],
    cardioSessions: []
});

const ROWS = [row("mine", "me"), row("open", "public-peer"), row("secret", "shy")];

function createService(privateOwners: string[]) {
    const queries: any[] = [];
    const prisma: any = {
        user: {
            findMany: async () => privateOwners.map((id) => ({ id }))
        },
        workout: {
            findMany: async (args: any) => {
                queries.push(args);
                const where = args?.where || {};
                let result = ROWS as any[];
                if (where.userId?.not) {
                    result = result.filter((item) => item.userId !== where.userId.not);
                }
                if (where.userId?.notIn) {
                    result = result.filter((item) => !where.userId.notIn.includes(item.userId));
                }
                if (where.userId?.in) {
                    result = result.filter((item) => where.userId.in.includes(item.userId));
                }
                return result;
            }
        }
    };
    return { service: new LiveService(prisma as PrismaService, new LiveBus()), queries };
}

describe("/live/peers", () => {
    it("gives a private member's rows no sets, no totals, no title and no notes", async () => {
        const { service } = await createService(["shy"]);
        const answer: any = await service.peers(CALLER);

        const theirs = answer.workouts.filter((item: any) => item.userId === "shy");
        expect(theirs).toHaveLength(1);
        expect(theirs[0].private).toBe(true);
        for (const field of ["exercises", "title", "notes", "totalVolume", "setCount", "exerciseCount"]) {
            expect(theirs[0]).not.toHaveProperty(field);
        }
        expect(JSON.stringify(theirs)).not.toContain("СЕКРЕТНИЙ");
        expect(JSON.stringify(theirs)).not.toContain("секретна");
        expect(JSON.stringify(theirs)).not.toContain("140");
    });

    it("does not read their sets out of the database at all", async () => {
        // Filtering after the fetch would still pull every repetition into the process,
        // one refactor away from being serialized again.
        const { service, queries } = await createService(["shy"]);
        await service.peers(CALLER);

        const hiddenQuery = queries.find((args) => args?.where?.userId?.in?.includes("shy"));
        expect(hiddenQuery).toBeDefined();
        expect(hiddenQuery.include).toBeUndefined();
        expect(hiddenQuery.select.exercises).toBeUndefined();
    });

    it("leaves a member who has hidden nothing fully visible", async () => {
        const { service } = await createService(["shy"]);
        const answer: any = await service.peers(CALLER);

        const open = answer.workouts.find((item: any) => item.userId === "public-peer");
        expect(open.totalVolume).toBe(700);
        expect(open.title).toBe("СЕКРЕТНИЙ ЗАГОЛОВОК");
    });

    it("never returns the caller's own rows", async () => {
        const { service } = await createService([]);
        const answer: any = await service.peers(CALLER);
        expect(answer.workouts.some((item: any) => item.userId === "me")).toBe(false);
    });
});

describe("presence", () => {
    it("does not carry the workout title", async () => {
        // Free text, rendered nowhere in the strip, and the field most likely to contain
        // the very number a private member hid.
        const prisma: any = {
            trainingPartnership: { findMany: async () => [] },
            workout: {
                findMany: async () => [{
                    id: "w1", userId: "peer", status: "active", workoutType: "custom",
                    firstSetAt: new Date(), user: { id: "peer", displayName: "Peer", avatarUrl: null }
                }]
            }
        };
        const service = new LiveService(prisma as PrismaService, new LiveBus());
        const answer: any = await service.presence();
        expect(answer.training[0]).not.toHaveProperty("title");
    });
});

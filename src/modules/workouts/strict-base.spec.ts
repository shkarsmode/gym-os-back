import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { SaveWorkoutDto } from "./dto/workout.dto";
import { WorkoutsService } from "./workouts.service";

const USER = "user-owner";
const ID = "workout-1";
const STORED = new Date("2026-11-25T10:00:00.123Z");

function existing(overrides: Record<string, unknown> = {}) {
    return { id: ID, userId: USER, updatedAt: STORED, status: "planned", firstSetAt: null, startedAt: null, finishedAt: null, _count: { exercises: 1 }, ...overrides };
}

function setup(row: Record<string, unknown> | null, commit: (ops: any[]) => Promise<unknown[]> = async (ops) => ops) {
    const seen: { ops: any[] } = { ops: [] };
    const prisma: any = {
        workout: {
            findUnique: async () => row,
            findMany: async () => [],
            count: async () => 0,
            update: (args: any) => ({ kind: "update", ...args, updatedAt: new Date("2026-11-25T10:00:01.000Z") }),
            create: (args: any) => ({ kind: "create", ...args, updatedAt: new Date("2026-11-25T10:00:01.000Z") }),
            updateMany: (args: any) => args,
            deleteMany: jest.fn(async () => ({ count: 1 })),
            delete: jest.fn(async () => ({}))
        },
        workoutExercise: { deleteMany: (args: any) => args },
        workoutSet: { updateMany: (args: any) => args, deleteMany: (args: any) => args },
        cardioSession: { deleteMany: (args: any) => args },
        supersetGroup: { findMany: async () => [], deleteMany: (args: any) => args },
        exercise: { findMany: async ({ where }: any) => (where?.id?.in ?? []).map((id: string) => ({ id })) },
        $transaction: async (ops: any[]) => {
            seen.ops = ops;
            return commit(ops);
        }
    };
    return { service: new WorkoutsService(prisma), prisma, seen };
}

const dto = (baseUpdatedAt?: string) => ({
    date: "2026-11-27",
    title: "Груди",
    status: "planned",
    workoutType: "push",
    exercises: [{ exerciseId: "ex-bench", order: 1, sets: [{ type: "working", weight: 80, repetitions: 8 }] }],
    ...(baseUpdatedAt ? { baseUpdatedAt } : {})
}) as unknown as SaveWorkoutDto;

const strict = { strictBase: true };

describe("saveFull strictBase (used by the MCP server)", () => {
    it("refuses a base from the same second that the app's check lets through", async () => {
        const sameSecond = "2026-11-25T10:00:00.000Z";
        await expect(setup(existing()).service.saveFull(USER, ID, dto(sameSecond), false, "admin")).resolves.toMatchObject({ ok: true });
        await expect(setup(existing()).service.saveFull(USER, ID, dto(sameSecond), false, "admin", strict)).rejects.toBeInstanceOf(ConflictException);
    });

    it("queues a conditional update on the version it read before anything else", async () => {
        const { service, seen } = setup(existing());
        await service.saveFull(USER, ID, dto(STORED.toISOString()), false, "admin", strict);
        expect(seen.ops[0]).toMatchObject({ kind: "update", where: { id: ID, updatedAt: STORED } });
        expect(seen.ops[seen.ops.length - 1]).toMatchObject({ kind: "update", where: { id: ID } });
    });

    it("turns a write that landed between the read and the commit into a conflict", async () => {
        const raced = new Prisma.PrismaClientKnownRequestError("Record to update not found.", { code: "P2025", clientVersion: "5.22.0" });
        const { service } = setup(existing(), async () => {
            throw raced;
        });
        await expect(service.saveFull(USER, ID, dto(STORED.toISOString()), false, "admin", strict)).rejects.toBeInstanceOf(ConflictException);
    });

    it("does not resurrect a workout that was deleted after it was read", async () => {
        await expect(setup(null).service.saveFull(USER, ID, dto(STORED.toISOString()), false, "admin", strict)).rejects.toBeInstanceOf(ConflictException);
    });

    it("leaves the app's own saves unchanged", async () => {
        const { service, seen } = setup(existing());
        await service.saveFull(USER, ID, dto(STORED.toISOString()), false, "admin");
        expect(seen.ops[0]).not.toMatchObject({ where: { updatedAt: STORED } });
    });
});

describe("remove with a guard (used by the MCP server)", () => {
    it("deletes only the row in the expected status and version", async () => {
        const { service, prisma } = setup(existing());
        await service.remove(USER, ID, false, { status: "planned", updatedAt: STORED });
        expect(prisma.workout.deleteMany).toHaveBeenCalledWith({ where: { id: ID, userId: USER, status: "planned", updatedAt: STORED } });
        expect(prisma.workout.delete).not.toHaveBeenCalled();
    });

    it("is a conflict when the row changed in the meantime", async () => {
        const { service, prisma } = setup(existing());
        prisma.workout.deleteMany.mockResolvedValueOnce({ count: 0 });
        await expect(service.remove(USER, ID, false, { status: "planned", updatedAt: STORED })).rejects.toBeInstanceOf(ConflictException);
    });
});

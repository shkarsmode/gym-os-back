import { ConflictException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { SaveWorkoutDto } from "./dto/workout.dto";
import { WorkoutsService } from "./workouts.service";

/**
 * saveFull is a destructive full replace: it deletes every set, exercise and cardio
 * session of a workout and recreates them from the payload. With one account on two
 * devices that makes the last writer win SILENTLY — the phone holding a copy from
 * before three sets were ticked on the desktop re-creates the tree without them and
 * nothing anywhere reports a problem.
 *
 * `baseUpdatedAt` is the version the client last saw. These tests pin the rule that
 * decides whether a save is allowed to land.
 */

const USER = "user-owner";
const WORKOUT = "workout-today";
const SERVER_VERSION = new Date("2026-08-20T10:00:00.000Z");

function createPrisma(workout: Record<string, unknown> | null) {
    const prisma: any = {
        workout: {
            findUnique: async () => workout,
            findMany: async () => [],
            count: async () => 0,
            create: (args: any) => ({ ...args, updatedAt: SERVER_VERSION }),
            update: (args: any) => ({ ...args, updatedAt: SERVER_VERSION }),
            updateMany: (args: any) => args
        },
        workoutExercise: { deleteMany: (args: any) => args },
        workoutSet: { updateMany: (args: any) => args, deleteMany: (args: any) => args },
        cardioSession: { deleteMany: (args: any) => args },
        exercise: {
            findMany: async ({ where }: any) => (where?.id?.in ?? []).map((id: string) => ({ id }))
        },
        $transaction: async (ops: any[]) => ops
    };
    return prisma as PrismaService;
}

function existingRow(overrides: Record<string, unknown> = {}) {
    return {
        id: WORKOUT,
        userId: USER,
        updatedAt: SERVER_VERSION,
        startedAt: null,
        finishedAt: null,
        _count: { exercises: 1 },
        ...overrides
    };
}

function saveDto(overrides: Record<string, unknown> = {}): SaveWorkoutDto {
    return {
        date: "2026-08-20",
        title: "Груди",
        status: "active",
        workoutType: "custom",
        exercises: [{ exerciseId: "ex-bench", order: 1, sets: [
            { type: "working", weight: 60, repetitions: 10, isCompleted: true }
        ] }],
        ...overrides
    } as unknown as SaveWorkoutDto;
}

const save = (prisma: PrismaService, dto: SaveWorkoutDto) =>
    new WorkoutsService(prisma).saveFull(USER, WORKOUT, dto);

describe("saveFull refuses a write built from a stale copy", () => {
    it("rejects a save whose base version predates the stored row", async () => {
        const prisma = createPrisma(existingRow());

        await expect(save(prisma, saveDto({
            baseUpdatedAt: "2026-08-20T09:59:00.000Z"
        }))).rejects.toBeInstanceOf(ConflictException);
    });

    it("names the conflict so the client can tell it apart from the erase guard", async () => {
        const prisma = createPrisma(existingRow());

        // Both refusals are 409. Only the code distinguishes "re-read and replay" from
        // "confirm you meant to empty this", and the client branches on it.
        const error = await save(prisma, saveDto({
            baseUpdatedAt: "2026-08-20T09:00:00.000Z"
        })).catch((thrown) => thrown);

        expect(error.getResponse()).toMatchObject({
            code: "STALE_WORKOUT",
            currentUpdatedAt: SERVER_VERSION.toISOString()
        });
    });

    it("accepts a save whose base version matches the stored row", async () => {
        const prisma = createPrisma(existingRow());

        await expect(save(prisma, saveDto({
            baseUpdatedAt: SERVER_VERSION.toISOString()
        }))).resolves.toMatchObject({ ok: true });
    });

    it("tolerates the sub-second precision Postgres keeps and JSON drops", async () => {
        // The column holds microseconds; the ISO string on the wire holds milliseconds.
        // Comparing exactly would reject every legitimate save on a round-trip.
        const prisma = createPrisma(existingRow({
            updatedAt: new Date("2026-08-20T10:00:00.812Z")
        }));

        await expect(save(prisma, saveDto({
            baseUpdatedAt: "2026-08-20T10:00:00.000Z"
        }))).resolves.toMatchObject({ ok: true });
    });

    it("lets a client that sends no base version through unchanged", async () => {
        // Older bundles omit the field. They keep the previous last-writer-wins
        // behaviour rather than being locked out by a version they never learned.
        const prisma = createPrisma(existingRow());

        await expect(save(prisma, saveDto())).resolves.toMatchObject({ ok: true });
    });

    it("lets a brand-new workout through, since there is no version to be stale against", async () => {
        const prisma = createPrisma(null);

        await expect(save(prisma, saveDto({
            baseUpdatedAt: "2020-01-01T00:00:00.000Z"
        }))).resolves.toMatchObject({ ok: true });
    });
});

describe("saveFull tells the caller what the save changed", () => {
    it("returns the row's new version so the next save is not instantly stale", async () => {
        const prisma = createPrisma(existingRow());

        await expect(save(prisma, saveDto({
            baseUpdatedAt: SERVER_VERSION.toISOString()
        }))).resolves.toMatchObject({ updatedAt: SERVER_VERSION.toISOString() });
    });

    it("names the other sessions it closed as a side effect", async () => {
        const prisma: any = createPrisma(existingRow());
        prisma.workout.findMany = async () => [{ id: "workout-earlier" }];

        // Starting a session silently completes every other active one. A device that is
        // not told which rows those were keeps showing a finished session as running.
        await expect(save(prisma, saveDto())).resolves.toMatchObject({
            closedOtherIds: ["workout-earlier"]
        });
    });
});

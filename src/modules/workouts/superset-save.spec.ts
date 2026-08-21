import { ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { SaveWorkoutDto } from "./dto/workout.dto";
import { WorkoutsService } from "./workouts.service";

/**
 * What saveFull does with superset groups.
 *
 * The load-bearing design decision under test: a ROUND IS THE Nth SET OF EACH MEMBER, so
 * the group row carries only the rest after a round and nothing about the work itself.
 * These tests assert on membership and ordering — the two things that make a group real
 * in the data rather than a drawing on the client.
 */

type Op = { model: string; method: string; args: any };

interface StubOptions {
    workout?: any;
    storedGroups?: Array<{ id: string; restSeconds: number }>;
}

function createPrisma(options: StubOptions = {}) {
    const writes: Op[] = [];
    const transactions: Op[][] = [];
    const groupQueries: any[] = [];
    const write = (model: string, method: string) => (args: any) => {
        const op: Op = { model, method, args };
        writes.push(op);
        return op;
    };

    const prisma: any = {
        workout: {
            findUnique: async () => options.workout ?? null,
            findMany: async () => [],
            count: async () => 0,
            create: write("workout", "create"),
            update: write("workout", "update"),
            updateMany: write("workout", "updateMany")
        },
        workoutExercise: { deleteMany: write("workoutExercise", "deleteMany") },
        workoutSet: { updateMany: write("workoutSet", "updateMany"), deleteMany: write("workoutSet", "deleteMany") },
        cardioSession: { deleteMany: write("cardioSession", "deleteMany") },
        supersetGroup: {
            findMany: async (args: any) => {
                groupQueries.push(args);
                return options.storedGroups ?? [];
            },
            deleteMany: write("supersetGroup", "deleteMany")
        },
        exercise: {
            findMany: async ({ where }: any) => (where?.id?.in ?? []).map((id: string) => ({ id }))
        },
        $transaction: async (ops: Op[]) => {
            transactions.push(ops);
            return ops;
        }
    };

    return { prisma: prisma as PrismaService, writes, transactions, groupQueries };
}

const USER = "user-owner";
const WORKOUT = "workout-today";

const existingRow = (overrides: Record<string, unknown> = {}) => ({
    id: WORKOUT,
    userId: USER,
    startedAt: null,
    finishedAt: null,
    _count: { exercises: 2 },
    ...overrides
});

/** Two exercises in one group, two rounds each — rounds ARE the sets. */
function supersetDto(overrides: Partial<SaveWorkoutDto> = {}): SaveWorkoutDto {
    return {
        date: "2026-08-21",
        title: "Груди",
        status: "active",
        workoutType: "custom",
        supersetGroups: [{ id: "group-a", restSeconds: 150 }],
        exercises: [
            {
                id: "we-1",
                exerciseId: "ex-bench",
                order: 1,
                supersetGroupId: "group-a",
                sets: [{ weight: 60, repetitions: 10 }, { weight: 60, repetitions: 10 }]
            },
            {
                id: "we-2",
                exerciseId: "ex-row",
                order: 2,
                supersetGroupId: "group-a",
                sets: [{ weight: 40, repetitions: 12 }, { weight: 40, repetitions: 12 }]
            }
        ],
        ...overrides
    } as unknown as SaveWorkoutDto;
}

const save = (prisma: PrismaService, dto: SaveWorkoutDto, tier: any = "premium") =>
    new WorkoutsService(prisma).saveFull(USER, WORKOUT, dto, false, tier);

const workoutWrite = (ops: Op[]) => {
    const found = ops.filter((op) => op.model === "workout" && (op.method === "update" || op.method === "create"));
    expect(found).toHaveLength(1);
    return found[0];
};

describe("saveFull persists superset groups", () => {
    it("creates the group and points both members at it", async () => {
        const { prisma, transactions } = createPrisma({ workout: existingRow() });
        await save(prisma, supersetDto());

        const write = workoutWrite(transactions[0]);
        expect(write.args.data.supersetGroups.create).toEqual([{ id: "group-a", restSeconds: 150 }]);
        const members = write.args.data.exercises.create;
        expect(members.map((item: any) => item.supersetGroupId)).toEqual(["group-a", "group-a"]);
    });

    it("keeps A1/A2 as plain order, so one field decides both placements", async () => {
        // There is no separate position column on purpose: members are contiguous, so
        // `order` is both the place in the workout and the place in the group, and the
        // two can never drift apart.
        const { prisma, transactions } = createPrisma({ workout: existingRow() });
        await save(prisma, supersetDto());

        const members = workoutWrite(transactions[0]).args.data.exercises.create;
        expect(members.map((item: any) => item.order)).toEqual([1, 2]);
    });

    it("stores each round as the Nth set of each member", async () => {
        const { prisma, transactions } = createPrisma({ workout: existingRow() });
        await save(prisma, supersetDto());

        const members = workoutWrite(transactions[0]).args.data.exercises.create;
        expect(members[0].sets.create).toHaveLength(2);
        expect(members[1].sets.create).toHaveLength(2);
    });

    it("clears the old groups after the exercises that reference them", async () => {
        const { prisma, transactions } = createPrisma({ workout: existingRow() });
        await save(prisma, supersetDto());

        const ops = transactions[0];
        const deleteIndex = ops.findIndex((op) => op.model === "supersetGroup" && op.method === "deleteMany");
        const exerciseDelete = ops.findIndex((op) => op.model === "workoutExercise" && op.method === "deleteMany");
        expect(deleteIndex).toBeGreaterThan(-1);
        // Otherwise the foreign key refuses the delete.
        expect(deleteIndex).toBeGreaterThan(exerciseDelete);
    });

    it("saves a member whose group was never declared as an ordinary exercise", async () => {
        // Losing a group should cost the grouping, not the training.
        const { prisma, transactions } = createPrisma({ workout: existingRow() });
        await save(prisma, supersetDto({ supersetGroups: [] } as any));

        const write = workoutWrite(transactions[0]);
        expect(write.args.data.supersetGroups).toBeUndefined();
        const members = write.args.data.exercises.create;
        expect(members.map((item: any) => item.supersetGroupId)).toEqual([null, null]);
        expect(members[0].sets.create).toHaveLength(2);
    });
});

describe("a workout without supersets is charged nothing", () => {
    it("never reads or writes the group table", async () => {
        const { prisma, transactions, groupQueries } = createPrisma({ workout: existingRow() });
        await save(prisma, {
            date: "2026-08-21",
            title: "Груди",
            status: "active",
            workoutType: "custom",
            exercises: [{ exerciseId: "ex-bench", order: 1, sets: [{ weight: 60, repetitions: 10 }] }]
        } as unknown as SaveWorkoutDto);

        expect(groupQueries).toHaveLength(0);
        expect(transactions[0].some((op) => op.model === "supersetGroup")).toBe(false);
    });
});

describe("supersets are a PRO feature, enforced on the server", () => {
    it("refuses a free account introducing a group", async () => {
        const { prisma } = createPrisma({ workout: existingRow() });
        await expect(save(prisma, supersetDto(), "free")).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("keeps saving a group the workout already had", async () => {
        // A plan ending is not a reason to take somebody's training away — including the
        // autosaves that happen while they simply look at it.
        const { prisma, transactions } = createPrisma({
            workout: existingRow(),
            storedGroups: [{ id: "group-a", restSeconds: 90 }]
        });
        await expect(save(prisma, supersetDto(), "free")).resolves.toBeDefined();

        const write = workoutWrite(transactions[0]);
        // Read-only: the stored rest wins over the 150 the payload asked for.
        expect(write.args.data.supersetGroups.create).toEqual([{ id: "group-a", restSeconds: 90 }]);
    });

    it("lets admin and PRO through", async () => {
        for (const tier of ["admin", "premium"]) {
            const { prisma } = createPrisma({ workout: existingRow() });
            await expect(save(prisma, supersetDto(), tier)).resolves.toBeDefined();
        }
    });

    it("defaults the rest when the payload omits it", async () => {
        const { prisma, transactions } = createPrisma({ workout: existingRow() });
        await save(prisma, supersetDto({ supersetGroups: [{ id: "group-a" }] } as any));

        expect(workoutWrite(transactions[0]).args.data.supersetGroups.create).toEqual([{ id: "group-a", restSeconds: 120 }]);
    });
});

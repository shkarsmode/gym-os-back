import { PrismaService } from "../../prisma/prisma.service";
import { SaveWorkoutDto } from "./dto/workout.dto";
import { WorkoutsService } from "./workouts.service";

/**
 * A set has to keep its identity across saves.
 *
 * saveFull deletes the whole tree and recreates it, and until now the server minted a
 * fresh id for every row each time. So no set had an identity that outlived a
 * keystroke-settle: nothing could name "this set" across two saves, which made a per-set
 * realtime event unaddressable and reduced any edit of somebody else's session to
 * edit-by-position — rewriting whatever happened to land in that slot in the meantime.
 */

const USER = "user-owner";
const WORKOUT = "workout-today";

function createPrisma() {
    const ops: any[] = [];
    const write = (model: string, method: string) => (args: any) => {
        const op = { model, method, args };
        ops.push(op);
        return op;
    };
    const prisma: any = {
        workout: {
            findUnique: async () => null,
            findMany: async () => [],
            count: async () => 0,
            create: write("workout", "create"),
            update: write("workout", "update"),
            updateMany: write("workout", "updateMany")
        },
        workoutExercise: { deleteMany: write("workoutExercise", "deleteMany") },
        workoutSet: { updateMany: write("workoutSet", "updateMany"), deleteMany: write("workoutSet", "deleteMany") },
        cardioSession: { deleteMany: write("cardioSession", "deleteMany") },
        exercise: { findMany: async ({ where }: any) => (where?.id?.in ?? []).map((id: string) => ({ id })) },
        $transaction: async (queued: any[]) => queued
    };
    return { prisma: prisma as PrismaService, ops };
}

const dto = (exercise: Record<string, unknown>): SaveWorkoutDto => ({
    date: "2026-08-20",
    title: "Груди",
    status: "active",
    workoutType: "custom",
    exercises: [exercise],
    cardioSessions: []
} as unknown as SaveWorkoutDto);

const written = (ops: any[]) => {
    const op = ops.find((item) => item.model === "workout" && (item.method === "create" || item.method === "update"));
    return op.args.data.exercises.create;
};

describe("client-supplied ids survive a save", () => {
    it("keeps the id of an exercise block", async () => {
        const { prisma, ops } = createPrisma();
        await new WorkoutsService(prisma).saveFull(USER, WORKOUT, dto({
            id: "workout-exercise-abc",
            exerciseId: "ex-bench",
            order: 1,
            sets: []
        }));
        expect(written(ops)[0].id).toBe("workout-exercise-abc");
    });

    it("keeps the id of every set", async () => {
        const { prisma, ops } = createPrisma();
        await new WorkoutsService(prisma).saveFull(USER, WORKOUT, dto({
            exerciseId: "ex-bench",
            order: 1,
            sets: [
                { id: "set-one", type: "working", weight: 60, repetitions: 10, isCompleted: true },
                { id: "set-two", type: "working", weight: 65, repetitions: 8, isCompleted: false }
            ]
        }));
        expect(written(ops)[0].sets.create.map((set: any) => set.id)).toEqual(["set-one", "set-two"]);
    });

    it("lets the database mint one when the client sends none", async () => {
        // Older bundles do not send ids, and a brand-new set has none yet. The key must
        // be ABSENT rather than undefined, or Prisma is asked to write a null id.
        const { prisma, ops } = createPrisma();
        await new WorkoutsService(prisma).saveFull(USER, WORKOUT, dto({
            exerciseId: "ex-bench",
            order: 1,
            sets: [{ type: "working", weight: 60, repetitions: 10, isCompleted: true }]
        }));
        const exercise = written(ops)[0];
        expect(Object.prototype.hasOwnProperty.call(exercise, "id")).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(exercise.sets.create[0], "id")).toBe(false);
    });

    it("carries the same ids through a second save, unchanged", async () => {
        // The property that matters: two saves of the same session produce the same set
        // ids, so an event or an edit can name one of them.
        const shape = {
            exerciseId: "ex-bench",
            order: 1,
            sets: [{ id: "set-one", type: "working", weight: 60, repetitions: 10, isCompleted: true }]
        };
        const first = createPrisma();
        await new WorkoutsService(first.prisma).saveFull(USER, WORKOUT, dto(shape));
        const second = createPrisma();
        await new WorkoutsService(second.prisma).saveFull(USER, WORKOUT, dto(shape));

        expect(written(first.ops)[0].sets.create[0].id)
            .toBe(written(second.ops)[0].sets.create[0].id);
    });
});

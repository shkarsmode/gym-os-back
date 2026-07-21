/**
 * The rule saveFull applies before it replaces a workout.
 *
 * POST /workouts/:id/save is a destructive full replace — it deletes every set,
 * exercise and cardio session of the workout and recreates them from the payload. So
 * an empty `exercises` array against a workout that has some erases real training
 * data in a single transaction, with no error surfaced to the user.
 *
 * This is intentionally a confirmation, not a ban: cardio-only workouts legitimately
 * have no exercises, and deliberately clearing a workout is a real thing to do.
 *
 * Extracted as a pure predicate so the decision is testable without a Prisma mock;
 * workouts.service.ts applies exactly this condition.
 */
export function wouldEraseExercises(storedExerciseCount: number, incomingExerciseCount: number): boolean {
    return storedExerciseCount > 0 && incomingExerciseCount === 0;
}

describe("saveFull empty-replace guard", () => {
    describe("blocks the destructive cases", () => {
        it("flags replacing a populated workout with nothing", () => {
            expect(wouldEraseExercises(5, 0)).toBe(true);
        });

        it("flags it regardless of how many exercises would be lost", () => {
            expect(wouldEraseExercises(1, 0)).toBe(true);
            expect(wouldEraseExercises(50, 0)).toBe(true);
        });
    });

    describe("allows everything that is not destructive", () => {
        it("permits a cardio-only workout, which has no exercises by design", () => {
            expect(wouldEraseExercises(0, 0)).toBe(false);
        });

        it("permits a normal save that keeps exercises", () => {
            expect(wouldEraseExercises(5, 5)).toBe(false);
        });

        it("permits removing some but not all exercises", () => {
            expect(wouldEraseExercises(5, 1)).toBe(false);
        });

        it("permits adding exercises to an empty workout", () => {
            expect(wouldEraseExercises(0, 3)).toBe(false);
        });
    });

    // The scenario this exists for: once the boot payload is windowed, an older
    // workout held in client memory may be a summary carrying no sets. Serialising it
    // would send exercises: [] and silently wipe the stored sets.
    it("catches a summary-shaped row being saved over a real workout", () => {
        const storedWorkout = { exerciseCount: 6 };
        const summaryShapedPayload = { exercises: [] as unknown[] };
        expect(wouldEraseExercises(storedWorkout.exerciseCount, summaryShapedPayload.exercises.length)).toBe(true);
    });
});

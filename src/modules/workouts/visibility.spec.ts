/**
 * Who may read a given workout through GET /workouts/:id.
 *
 * This endpoint is becoming the peer-hydration path: opening a teammate's workout
 * will fetch it here instead of receiving every peer's sets in the boot payload. Until
 * now it took only an id and returned any workout to any approved member.
 *
 * The rule mirrors what the team feed and calendar already expose — a peer's COMPLETED
 * workouts are public within the gym, so the sets behind them are not new information.
 * A peer's planned or in-progress workout is not.
 *
 * Extracted as a pure predicate so the decision is testable without a Prisma mock;
 * workouts.service.ts applies exactly this condition.
 */
export function canReadWorkout(
    workout: { userId: string; status: string },
    callerId: string,
    isAdmin: boolean
): boolean {
    if (workout.userId === callerId) {
        return true;
    }
    if (isAdmin) {
        return true;
    }
    return workout.status === "completed";
}

const OWNER = "user-owner";
const PEER = "user-peer";

describe("GET /workouts/:id visibility", () => {
    describe("the owner sees everything of their own", () => {
        it.each(["planned", "active", "completed"])("owner reads their own %s workout", (status) => {
            expect(canReadWorkout({ userId: OWNER, status }, OWNER, false)).toBe(true);
        });
    });

    describe("a peer sees only completed workouts", () => {
        it("reads a peer's completed workout — already visible in the feed and calendar", () => {
            expect(canReadWorkout({ userId: OWNER, status: "completed" }, PEER, false)).toBe(true);
        });

        it("cannot read a peer's planned workout", () => {
            expect(canReadWorkout({ userId: OWNER, status: "planned" }, PEER, false)).toBe(false);
        });

        it("cannot read a peer's in-progress workout", () => {
            expect(canReadWorkout({ userId: OWNER, status: "active" }, PEER, false)).toBe(false);
        });
    });

    describe("admins", () => {
        it.each(["planned", "active", "completed"])("admin reads any %s workout", (status) => {
            expect(canReadWorkout({ userId: OWNER, status }, PEER, true)).toBe(true);
        });
    });

    // A denied read answers 404, not 403, so the response does not confirm the id
    // exists. That is asserted in the service; recorded here so the intent is not lost.
    it("denial is indistinguishable from a missing workout by design", () => {
        expect(canReadWorkout({ userId: OWNER, status: "active" }, PEER, false)).toBe(false);
    });
});

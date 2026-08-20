import { redactScoring, ScoringPayload } from "./scoring-privacy";

const stats = (userId: string, totalVolume: number, totalSets: number) => ({
    userId,
    totalWorkouts: 10,
    completedWorkouts: 9,
    totalSets,
    workingSets: totalSets,
    warmupSets: 0,
    totalVolume,
    weekVolume: totalVolume / 4,
    weekSets: totalSets / 4,
    averageDurationMinutes: 62,
    cardioMinutes: 30,
    cardioDistance: 5,
    trainingStreak: 3,
    lastWorkoutDate: "2026-08-19",
    mostUsedExerciseId: "ex-bench",
    mostTrainedMuscleGroup: "Груди",
    personalRecords: 7,
    notesCount: 4
});

function payload(): ScoringPayload {
    return {
        users: {
            me: { stats: stats("me", 1000, 40), records: [{ id: "r-me" }], xp: 500, level: 12, xpLedger: [{ x: 1 }] },
            open: { stats: stats("open", 2000, 60), records: [{ id: "r-open" }], xp: 900, level: 18, xpLedger: [{ x: 1 }] },
            shy: { stats: stats("shy", 5000, 120), records: [{ id: "r-shy" }], xp: 1500, level: 25, xpLedger: [{ x: 1 }] }
        },
        team: {
            totalWorkouts: 30,
            completedWorkouts: 27,
            totalSets: 220,
            workingSets: 220,
            totalVolume: 8000,
            averageDurationMinutes: 62,
            cardioMinutes: 90,
            cardioDistance: 15,
            teamStreak: 4,
            mostActiveUserId: "shy",
            mostUsedExerciseId: "ex-bench",
            mostTrainedMuscleGroup: "Груди"
        }
    };
}

const visible = (id: string) => id !== "shy";
const redact = () => redactScoring(payload(), "me", visible);

describe("redacting a private member's scoring", () => {
    it("removes their personal records entirely", () => {
        expect(redact().users.shy.records).toEqual([]);
    });

    it("removes everything counted in kilograms, reps or sets", () => {
        const shy = redact().users.shy.stats!;
        for (const field of ["totalVolume", "totalSets", "workingSets", "warmupSets", "weekVolume", "weekSets", "cardioDistance", "personalRecords"]) {
            expect(shy).not.toHaveProperty(field);
        }
    });

    it("removes what they train, which is the first thing 'hide my exercises' covers", () => {
        const shy = redact().users.shy.stats!;
        expect(shy).not.toHaveProperty("mostUsedExerciseId");
        expect(shy).not.toHaveProperty("mostTrainedMuscleGroup");
    });

    it("DELETES those fields rather than zeroing them", () => {
        // A zero is a claim that somebody lifted nothing - false, and indistinguishable
        // from a bug. An absent key makes an unaware consumer fail visibly instead.
        expect(redact().users.shy.stats).not.toHaveProperty("totalVolume");
        expect(redact().users.shy.stats!.totalVolume).toBeUndefined();
    });

    it("keeps everything counted in sessions, days and minutes", () => {
        const shy = redact().users.shy.stats!;
        expect(shy.totalWorkouts).toBe(10);
        expect(shy.completedWorkouts).toBe(9);
        expect(shy.trainingStreak).toBe(3);
        expect(shy.averageDurationMinutes).toBe(62);
        expect(shy.cardioMinutes).toBe(30);
        expect(shy.lastWorkoutDate).toBe("2026-08-19");
    });

    it("keeps them on the leaderboard", () => {
        // Hiding level and XP would remove a private member from the app entirely, which
        // is not what "hide my workout details" asks for.
        expect(redact().users.shy.xp).toBe(1500);
        expect(redact().users.shy.level).toBe(25);
    });
});

describe("the team totals cannot be used to un-hide anyone", () => {
    it("rebuilds detail sums from only the members this caller can see", () => {
        // THE ATTACK: team.totalVolume was the sum over everyone, so subtracting every
        // visible member's volume from it returned the hidden member's exactly.
        const team = redact().team!;
        expect(team.totalVolume).toBe(3000); // me 1000 + open 2000, shy's 5000 excluded
        expect(team.totalSets).toBe(100);    // 40 + 60
        expect(team.cardioDistance).toBe(10);
    });

    it("so the subtraction yields zero rather than their volume", () => {
        const result = redact();
        const team = Number(result.team!.totalVolume);
        const visibleSum = ["me", "open"].reduce((sum, id) => sum + Number(result.users[id].stats!.totalVolume), 0);
        expect(team - visibleSum).toBe(0);
    });

    it("clears the team's most-trained fields, which are computed from everyone", () => {
        expect(redact().team!.mostUsedExerciseId).toBeNull();
        expect(redact().team!.mostTrainedMuscleGroup).toBeNull();
    });

    it("leaves the team block untouched when nobody is hidden", () => {
        const untouched = redactScoring(payload(), "me", () => true);
        expect(untouched.team).toEqual(payload().team);
    });
});

describe("the caller themselves", () => {
    it("sees all of their own data even if they are the private one", () => {
        const result = redactScoring(payload(), "shy", (id) => id !== "shy");
        expect(result.users.shy.records).toHaveLength(1);
        expect(result.users.shy.stats!.totalVolume).toBe(5000);
    });

    it("keeps their own xp ledger, and nobody else's", () => {
        const result = redact();
        expect(result.users.me.xpLedger).toHaveLength(1);
        expect(result.users.open.xpLedger).toEqual([]);
        expect(result.users.shy.xpLedger).toEqual([]);
    });
});

import { weekdayIndex } from "./rules";
import { DraftSet, DraftWorkout } from "./workout";

export interface RepeatCandidate {
    id: string;
    date: string;
    exerciseCount: number;
}

export function pickRepeatSource(candidates: RepeatCandidate[], targetDate: string, today: string): RepeatCandidate | null {
    const weekday = weekdayIndex(targetDate);
    const sameWeekday = candidates.find((item) => item.exerciseCount > 0 && item.date < today && weekdayIndex(item.date) === weekday);
    return sameWeekday || candidates[0] || null;
}

export function buildRepeatDraft(params: {
    source: DraftWorkout;
    latestDone: Map<string, DraftSet[]>;
    targetDate: string;
    id: string;
    makeId: (prefix: string) => string;
}): DraftWorkout {
    const { source, latestDone, targetDate, makeId } = params;
    return {
        id: params.id,
        userId: source.userId,
        date: targetDate,
        title: "Тренування",
        status: "planned",
        workoutType: source.workoutType || "custom",
        notes: null,
        durationOverride: null,
        startedAt: null,
        finishedAt: null,
        firstSetAt: null,
        lastSetAt: null,
        updatedAt: null,
        supersetGroups: [],
        exercises: source.exercises.map((item) => {
            const done = latestDone.get(item.exerciseId);
            const sets = done && done.length ? done : item.sets;
            return {
                id: makeId("workout-exercise"),
                exerciseId: item.exerciseId,
                name: item.name,
                isTimed: item.isTimed,
                notes: null,
                supersetGroupId: null,
                sets: sets.map((set) => ({
                    id: makeId("set"),
                    type: set.type || "working",
                    weight: Number(set.weight) || 0,
                    repetitions: Number(set.repetitions) || 0,
                    durationSeconds: set.durationSeconds ?? null,
                    rpe: null,
                    restSeconds: Number(set.restSeconds) || 90,
                    isCompleted: false,
                    notes: null
                }))
            };
        }),
        cardio: source.cardio.map((session) => ({ ...session, notes: null }))
    };
}

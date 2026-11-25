import { randomBytes } from "node:crypto";
import { dateInput } from "../../../shared/serialize";
import { StatusInput } from "./rules";

export const SET_TYPES = ["warmup", "working", "drop", "failure", "backoff"] as const;
export type SetType = (typeof SET_TYPES)[number];
export const WORKOUT_TYPES = ["custom", "push", "pull", "legs", "upper", "full_body", "cardio"] as const;

export interface DraftSet {
    id: string;
    type: SetType;
    weight: number;
    repetitions: number;
    durationSeconds: number | null;
    rpe: number | null;
    restSeconds: number;
    isCompleted: boolean;
    notes: string | null;
}

export interface DraftExercise {
    id: string;
    exerciseId: string;
    name: string;
    isTimed: boolean;
    notes: string | null;
    supersetGroupId: string | null;
    sets: DraftSet[];
}

export interface DraftCardio {
    type: string;
    durationMinutes: number;
    distance: number | null;
    calories: number | null;
    averageHeartRate: number | null;
    intensity: string | null;
    notes: string | null;
}

export interface DraftWorkout {
    id: string;
    userId: string;
    date: string;
    title: string;
    status: string;
    workoutType: string;
    notes: string | null;
    durationOverride: number | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    firstSetAt: Date | null;
    lastSetAt: Date | null;
    updatedAt: Date | null;
    supersetGroups: Array<{ id: string; restSeconds: number }>;
    exercises: DraftExercise[];
    cardio: DraftCardio[];
}

export const WORKOUT_TREE_INCLUDE = {
    exercises: {
        include: { exercise: { select: { id: true, name: true, isTimed: true } }, sets: true },
        orderBy: { order: "asc" as const }
    },
    supersetGroups: true,
    cardioSessions: true
};

export function newId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${randomBytes(6).toString("hex").slice(0, 7)}`;
}

function optionalNumber(value: unknown): number | null {
    if (value === null || value === undefined) {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

export function toDraftSet(set: any): DraftSet {
    return {
        id: set.id,
        type: set.type,
        weight: optionalNumber(set.weight) ?? 0,
        repetitions: Number(set.repetitions) || 0,
        durationSeconds: optionalNumber(set.durationSeconds),
        rpe: optionalNumber(set.rpe),
        restSeconds: Number(set.restSeconds) || 0,
        isCompleted: Boolean(set.isCompleted),
        notes: set.notes ?? null
    };
}

export function toDraft(row: any): DraftWorkout {
    return {
        id: row.id,
        userId: row.userId,
        date: dateInput(row.date),
        title: row.title,
        status: row.status,
        workoutType: row.workoutType,
        notes: row.notes ?? null,
        durationOverride: row.durationOverride ?? null,
        startedAt: row.startedAt ?? null,
        finishedAt: row.finishedAt ?? null,
        firstSetAt: row.firstSetAt ?? null,
        lastSetAt: row.lastSetAt ?? null,
        updatedAt: row.updatedAt ?? null,
        supersetGroups: (row.supersetGroups || []).map((group: any) => ({ id: group.id, restSeconds: group.restSeconds })),
        exercises: (row.exercises || []).map((item: any) => ({
            id: item.id,
            exerciseId: item.exerciseId,
            name: item.exercise?.name || item.exerciseId,
            isTimed: Boolean(item.exercise?.isTimed),
            notes: item.notes ?? null,
            supersetGroupId: item.supersetGroupId ?? null,
            sets: (item.sets || []).map(toDraftSet)
        })),
        cardio: (row.cardioSessions || []).map((session: any) => ({
            type: session.type,
            durationMinutes: Number(session.durationMinutes) || 0,
            distance: optionalNumber(session.distance),
            calories: optionalNumber(session.calories),
            averageHeartRate: optionalNumber(session.averageHeartRate),
            intensity: session.intensity ?? null,
            notes: session.notes ?? null
        }))
    };
}

export function statusInputOf(draft: DraftWorkout): StatusInput {
    return { status: draft.status, date: draft.date, exercises: draft.exercises, cardioCount: draft.cardio.length };
}

function defined<T extends Record<string, unknown>>(value: T): T {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined)) as T;
}

export function toSaveDto(draft: DraftWorkout): Record<string, unknown> {
    const usedGroups = new Set(draft.exercises.map((item) => item.supersetGroupId).filter(Boolean));
    return defined({
        date: draft.date,
        title: draft.title,
        status: draft.status,
        workoutType: draft.workoutType,
        notes: draft.notes,
        durationOverride: draft.durationOverride,
        firstSetAt: draft.firstSetAt?.toISOString(),
        lastSetAt: draft.lastSetAt?.toISOString(),
        baseUpdatedAt: draft.updatedAt?.toISOString(),
        supersetGroups: draft.supersetGroups.filter((group) => usedGroups.has(group.id)).map((group) => ({ ...group })),
        exercises: draft.exercises.map((item, index) => defined({
            id: item.id,
            exerciseId: item.exerciseId,
            order: index + 1,
            notes: item.notes,
            supersetGroupId: item.supersetGroupId,
            sets: item.sets.map((set) => defined({
                id: set.id,
                type: set.type,
                weight: set.weight,
                repetitions: set.repetitions,
                durationSeconds: set.durationSeconds,
                rpe: set.rpe,
                restSeconds: set.restSeconds,
                isCompleted: set.isCompleted,
                notes: set.notes
            }))
        })),
        cardioSessions: draft.cardio.map((session) => defined({ ...session }))
    });
}

export function snapshot(draft: DraftWorkout | null) {
    if (!draft) {
        return null;
    }
    return {
        id: draft.id,
        date: draft.date,
        status: draft.status,
        type: draft.workoutType,
        title: draft.title,
        notes: draft.notes,
        exercises: draft.exercises.map((item) => ({
            exerciseId: item.exerciseId,
            name: item.name,
            notes: item.notes,
            superset: item.supersetGroupId,
            sets: item.sets.map((set) => ({
                type: set.type,
                weight: set.weight,
                reps: set.repetitions,
                seconds: set.durationSeconds,
                rest: set.restSeconds,
                done: set.isCompleted
            }))
        })),
        cardio: draft.cardio.map((session) => ({ type: session.type, minutes: session.durationMinutes }))
    };
}

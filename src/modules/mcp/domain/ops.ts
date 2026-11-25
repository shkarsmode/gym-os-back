import { fmtLoad } from "./format";
import { McpToolError, requireDate } from "./rules";
import { DraftExercise, DraftSet, DraftWorkout, SetType } from "./workout";

export interface SetInput {
    type?: SetType;
    weight: number;
    reps?: number;
    seconds?: number;
    restSeconds?: number;
}

export interface ExerciseRef {
    exerciseId?: string;
    exerciseName?: string;
}

export interface ResolvedExercise {
    id: string;
    name: string;
    isTimed: boolean;
}

export type UpdateOp =
    | { op: "set_set"; exercise: number; set: number; type?: SetType; weight?: number; reps?: number; seconds?: number; restSeconds?: number }
    | ({ op: "add_set"; exercise: number; position?: number } & SetInput)
    | { op: "remove_set"; exercise: number; set: number }
    | ({ op: "add_exercise"; position?: number; notes?: string; sets?: SetInput[] } & ExerciseRef)
    | ({ op: "replace_exercise"; exercise: number } & ExerciseRef)
    | { op: "remove_exercise"; exercise: number }
    | { op: "reorder"; order: number[] }
    | { op: "set_workout_notes"; notes: string }
    | { op: "set_exercise_notes"; exercise: number; notes: string }
    | { op: "set_date"; date: string };

export function newSet(input: SetInput, makeId: (prefix: string) => string, previous?: DraftSet): DraftSet {
    return {
        id: makeId("set"),
        type: input.type || "working",
        weight: input.weight,
        repetitions: input.seconds ? 0 : input.reps ?? 0,
        durationSeconds: input.seconds ?? null,
        rpe: null,
        restSeconds: input.restSeconds ?? previous?.restSeconds ?? 90,
        isCompleted: false,
        notes: null
    };
}

function fail(step: number, message: string): never {
    throw new McpToolError("INVALID_OP", `op ${step}: ${message}`);
}

function pickExercise(draft: DraftWorkout, index: number, step: number): DraftExercise {
    const item = draft.exercises[index - 1];
    if (!Number.isInteger(index) || !item) {
        fail(step, `exercise ${index} does not exist (the workout has ${draft.exercises.length})`);
    }
    return item;
}

function pickSet(item: DraftExercise, index: number, step: number): DraftSet {
    const set = item.sets[index - 1];
    if (!Number.isInteger(index) || !set) {
        fail(step, `${item.name} has no set ${index} (it has ${item.sets.length})`);
    }
    return set;
}

export function assertNotDone(set: DraftSet, label: string) {
    if (set.isCompleted) {
        throw new McpToolError("SET_COMPLETED", `${label} is already done; completed sets cannot be changed.`);
    }
}

function assertNoDoneSets(item: DraftExercise, step: number) {
    if (item.sets.some((set) => set.isCompleted)) {
        throw new McpToolError("SET_COMPLETED", `op ${step}: ${item.name} has completed sets and cannot be removed or replaced.`);
    }
}

function splitsGroup(draft: DraftWorkout, position: number): boolean {
    const before = draft.exercises[position - 2];
    const after = draft.exercises[position - 1];
    return Boolean(before?.supersetGroupId && before.supersetGroupId === after?.supersetGroupId);
}

export function assertGroupsContiguous(draft: DraftWorkout) {
    const seen = new Set<string>();
    let previous: string | null = null;
    for (const item of draft.exercises) {
        const group = item.supersetGroupId;
        if (group && group !== previous) {
            if (seen.has(group)) {
                throw new McpToolError("SUPERSET_SPLIT", "Superset members must stay next to each other.");
            }
            seen.add(group);
        }
        previous = group;
    }
}

function dissolveSmallGroups(draft: DraftWorkout) {
    const counts = new Map<string, number>();
    for (const item of draft.exercises) {
        if (item.supersetGroupId) {
            counts.set(item.supersetGroupId, (counts.get(item.supersetGroupId) || 0) + 1);
        }
    }
    for (const item of draft.exercises) {
        if (item.supersetGroupId && (counts.get(item.supersetGroupId) || 0) < 2) {
            item.supersetGroupId = null;
        }
    }
    draft.supersetGroups = draft.supersetGroups.filter((group) => (counts.get(group.id) || 0) >= 2);
}

function position(value: number | undefined, length: number, step: number): number {
    const index = value ?? length + 1;
    if (!Number.isInteger(index) || index < 1 || index > length + 1) {
        fail(step, `position must be between 1 and ${length + 1}`);
    }
    return index;
}

export function applyOps(
    draft: DraftWorkout,
    ops: UpdateOp[],
    resolved: Map<number, ResolvedExercise>,
    makeId: (prefix: string) => string
): string[] {
    const changes: string[] = [];
    ops.forEach((op, offset) => {
        const step = offset + 1;
        switch (op.op) {
            case "set_set": {
                const item = pickExercise(draft, op.exercise, step);
                const set = pickSet(item, op.set, step);
                assertNotDone(set, `${item.name} set ${op.set}`);
                const before = fmtLoad(set);
                if (op.type) {
                    set.type = op.type;
                }
                if (op.weight !== undefined) {
                    set.weight = op.weight;
                }
                if (op.seconds !== undefined) {
                    set.durationSeconds = op.seconds;
                    set.repetitions = 0;
                } else if (op.reps !== undefined) {
                    set.repetitions = op.reps;
                    set.durationSeconds = null;
                }
                if (op.restSeconds !== undefined) {
                    set.restSeconds = op.restSeconds;
                }
                changes.push(`${item.name} set ${op.set}: ${before} -> ${set.type} ${fmtLoad(set)}, rest ${set.restSeconds}s`);
                break;
            }
            case "add_set": {
                const item = pickExercise(draft, op.exercise, step);
                const at = position(op.position, item.sets.length, step);
                const set = newSet(op, makeId, item.sets[at - 2] || item.sets[item.sets.length - 1]);
                item.sets.splice(at - 1, 0, set);
                changes.push(`${item.name}: added set ${at} ${set.type} ${fmtLoad(set)}`);
                break;
            }
            case "remove_set": {
                const item = pickExercise(draft, op.exercise, step);
                const set = pickSet(item, op.set, step);
                assertNotDone(set, `${item.name} set ${op.set}`);
                item.sets.splice(op.set - 1, 1);
                changes.push(`${item.name}: removed set ${op.set} (${fmtLoad(set)})`);
                break;
            }
            case "add_exercise": {
                const exercise = resolved.get(offset);
                if (!exercise) {
                    fail(step, "exerciseId or exerciseName is required");
                }
                const at = position(op.position, draft.exercises.length, step);
                if (splitsGroup(draft, at)) {
                    fail(step, `position ${at} would split a superset`);
                }
                const sets: DraftSet[] = [];
                for (const input of op.sets || []) {
                    sets.push(newSet(input, makeId, sets[sets.length - 1]));
                }
                draft.exercises.splice(at - 1, 0, {
                    id: makeId("workout-exercise"),
                    exerciseId: exercise.id,
                    name: exercise.name,
                    isTimed: exercise.isTimed,
                    notes: op.notes || null,
                    supersetGroupId: null,
                    sets
                });
                changes.push(`added exercise ${at} ${exercise.name} (${sets.length} sets)`);
                break;
            }
            case "replace_exercise": {
                const item = pickExercise(draft, op.exercise, step);
                const exercise = resolved.get(offset);
                if (!exercise) {
                    fail(step, "exerciseId or exerciseName is required");
                }
                assertNoDoneSets(item, step);
                const previous = item.name;
                item.exerciseId = exercise.id;
                item.name = exercise.name;
                item.isTimed = exercise.isTimed;
                changes.push(`exercise ${op.exercise}: ${previous} -> ${exercise.name} (sets kept)`);
                break;
            }
            case "remove_exercise": {
                const item = pickExercise(draft, op.exercise, step);
                assertNoDoneSets(item, step);
                draft.exercises.splice(op.exercise - 1, 1);
                dissolveSmallGroups(draft);
                changes.push(`removed exercise ${op.exercise} ${item.name}`);
                break;
            }
            case "reorder": {
                const count = draft.exercises.length;
                const order = op.order || [];
                const valid = order.length === count && new Set(order).size === count && order.every((index) => Number.isInteger(index) && index >= 1 && index <= count);
                if (!valid) {
                    fail(step, `order must list each exercise number 1..${count} exactly once`);
                }
                draft.exercises = order.map((index) => draft.exercises[index - 1]);
                assertGroupsContiguous(draft);
                changes.push(`new order: ${draft.exercises.map((item) => item.name).join(", ")}`);
                break;
            }
            case "set_workout_notes": {
                draft.notes = op.notes.trim() || null;
                changes.push(draft.notes ? "workout notes updated" : "workout notes cleared");
                break;
            }
            case "set_exercise_notes": {
                const item = pickExercise(draft, op.exercise, step);
                item.notes = op.notes.trim() || null;
                changes.push(`${item.name}: ${item.notes ? "note updated" : "note cleared"}`);
                break;
            }
            case "set_date": {
                const date = requireDate(op.date);
                changes.push(`date ${draft.date} -> ${date}`);
                draft.date = date;
                break;
            }
            default:
                fail(step, "unknown op");
        }
    });
    return changes;
}

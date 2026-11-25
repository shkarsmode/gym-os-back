import { DraftSet, DraftWorkout, statusInputOf } from "./workout";
import { effectiveStatus, weekdayName } from "./rules";

export function encodeVersion(date: Date | null | undefined): string {
    return date ? date.getTime().toString(36) : "-";
}

export function decodeVersion(value: string): number {
    return /^[0-9a-z]{1,12}$/.test(value) ? parseInt(value, 36) : NaN;
}

export function fmtNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

export function fmtLoad(set: Pick<DraftSet, "weight" | "repetitions" | "durationSeconds">): string {
    const weight = set.weight > 0 ? `${fmtNumber(set.weight)}kg` : "";
    if (set.durationSeconds !== null && set.durationSeconds > 0) {
        return weight ? `${weight} for ${set.durationSeconds}s` : `${set.durationSeconds}s`;
    }
    return weight ? `${weight}×${set.repetitions}` : `${set.repetitions} reps`;
}

export function epley(weight: number, reps: number): number {
    if (weight <= 0 || reps <= 0) {
        return 0;
    }
    return reps === 1 ? weight : weight * (1 + reps / 30);
}

export function durationMinutes(draft: Pick<DraftWorkout, "durationOverride" | "startedAt" | "finishedAt">): number | null {
    if (draft.durationOverride !== null) {
        return Math.max(0, Math.round(draft.durationOverride));
    }
    if (draft.startedAt && draft.finishedAt) {
        return Math.max(0, Math.round((draft.finishedAt.getTime() - draft.startedAt.getTime()) / 60000));
    }
    return null;
}

export function workingSets(draft: DraftWorkout, status: string): string {
    const sets = draft.exercises.flatMap((item) => item.sets).filter((set) => set.type !== "warmup");
    const count = status === "planned" || status === "missed" ? sets.length : sets.filter((set) => set.isCompleted).length;
    return `${count} working set${count === 1 ? "" : "s"} ${status === "planned" || status === "missed" ? "planned" : "done"}`;
}

export function supersetLabels(draft: DraftWorkout): Map<string, string> {
    const labels = new Map<string, string>();
    for (const item of draft.exercises) {
        if (item.supersetGroupId && !labels.has(item.supersetGroupId)) {
            labels.set(item.supersetGroupId, String.fromCharCode(65 + labels.size));
        }
    }
    return labels;
}

export function headline(draft: DraftWorkout, today: string): string {
    const status = effectiveStatus(statusInputOf(draft), today);
    const parts = [`${draft.date} ${weekdayName(draft.date)}`, status, draft.workoutType, draft.title, workingSets(draft, status)];
    const minutes = status === "completed" ? durationMinutes(draft) : null;
    if (minutes) {
        parts.push(`${minutes} min`);
    }
    return `${parts.join(" · ")} · id=${draft.id} v=${encodeVersion(draft.updatedAt)}`;
}

export function renderWorkout(draft: DraftWorkout, today: string): string {
    const lines = [headline(draft, today)];
    if (draft.notes) {
        lines.push(`notes: ${draft.notes}`);
    }
    const labels = supersetLabels(draft);
    draft.exercises.forEach((item, index) => {
        const group = item.supersetGroupId ? labels.get(item.supersetGroupId) : undefined;
        lines.push(`${index + 1}. ${item.name}${group ? ` [superset ${group}]` : ""} (exerciseId=${item.exerciseId})`);
        if (item.notes) {
            lines.push(`   note: ${item.notes}`);
        }
        if (!item.sets.length) {
            lines.push("   no sets");
        }
        item.sets.forEach((set, setIndex) => {
            lines.push(`   ${setIndex + 1}) ${set.type} ${fmtLoad(set)} · rest ${set.restSeconds}s${set.isCompleted ? " · done" : ""}`);
        });
    });
    for (const group of draft.supersetGroups) {
        const label = labels.get(group.id);
        if (label) {
            lines.push(`superset ${label}: rest ${group.restSeconds}s after each round`);
        }
    }
    draft.cardio.forEach((session, index) => {
        const extra = [
            session.distance ? `${fmtNumber(session.distance)} km` : "",
            session.calories ? `${session.calories} kcal` : "",
            session.averageHeartRate ? `HR ${session.averageHeartRate}` : ""
        ].filter(Boolean);
        lines.push(`cardio ${index + 1}: ${session.type} ${session.durationMinutes} min${extra.length ? ` · ${extra.join(" · ")}` : ""}`);
    });
    return lines.join("\n");
}

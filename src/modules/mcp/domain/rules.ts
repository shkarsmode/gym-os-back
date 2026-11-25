export class McpToolError extends Error {
    constructor(readonly code: string, message: string) {
        super(message);
    }
}

export type EffectiveStatus = "planned" | "active" | "completed" | "missed";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function isIsoDate(value: unknown): value is string {
    if (typeof value !== "string" || !ISO_DATE.test(value)) {
        return false;
    }
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function requireDate(value: unknown, field = "date"): string {
    if (!isIsoDate(value)) {
        throw new McpToolError("INVALID_DATE", `${field} must be a real date in YYYY-MM-DD format`);
    }
    return value;
}

export function todayIn(timeZone: string, now = new Date()): string {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
    return `${part("year")}-${part("month")}-${part("day")}`;
}

export function addDays(date: string, days: number): string {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
}

export function weekdayIndex(date: string): number {
    return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function weekdayName(date: string): string {
    return WEEKDAYS[weekdayIndex(date)] || "";
}

export interface StatusInput {
    status: string;
    date: string;
    exercises: Array<{ sets: Array<{ isCompleted: boolean }> }>;
    cardioCount: number;
}

export function hasRecordedWork(workout: StatusInput): boolean {
    return workout.exercises.some((exercise) => exercise.sets.some((set) => set.isCompleted)) || workout.cardioCount > 0;
}

export function effectiveStatus(workout: StatusInput, today: string): EffectiveStatus {
    if (workout.status === "completed") {
        return "completed";
    }
    if (!workout.date || workout.date >= today) {
        return workout.status as EffectiveStatus;
    }
    return hasRecordedWork(workout) ? "completed" : "missed";
}

export function assertNotPast(date: string, today: string, timeZone: string) {
    if (date < today) {
        throw new McpToolError("PAST_DATE", `A planned workout cannot be on a past date (${date}). Today is ${today} (${timeZone}).`);
    }
}

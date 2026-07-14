import { Type } from "@google/genai";
import { CARDIO_INTENSITIES, CARDIO_TYPES, SET_TYPES, WORKOUT_TYPES } from "./ai.constants";

// Thrown inside the AI pipeline with a normalized, non-leaking code. The controller maps
// it to the right HTTP status; the code is also persisted in AiUsageLog.
export class AiError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly httpStatus = 502
    ) {
        super(message);
        this.name = "AiError";
    }
}

// The raw structure we ask Gemini to return. Everything except the two arrays is nullable
// so the model is never forced to invent a value it wasn't given.
export interface GeminiSetPayload {
    type?: string | null;
    weight?: number | null;
    repetitions?: number | null;
    durationSeconds?: number | null;
    rpe?: number | null;
    restSeconds?: number | null;
    notes?: string | null;
}

export interface GeminiExercisePayload {
    exerciseId?: string | null;
    recognizedName?: string | null;
    confidence?: number | null;
    notes?: string | null;
    sets?: GeminiSetPayload[] | null;
}

export interface GeminiCardioPayload {
    type?: string | null;
    durationMinutes?: number | null;
    distance?: number | null;
    calories?: number | null;
    averageHeartRate?: number | null;
    intensity?: string | null;
    notes?: string | null;
}

export interface GeminiWorkoutPayload {
    title?: string | null;
    date?: string | null;
    workoutType?: string | null;
    notes?: string | null;
    exercises?: GeminiExercisePayload[] | null;
    cardioSessions?: GeminiCardioPayload[] | null;
    warnings?: string[] | null;
}

// The safe, validated result returned to the frontend.
export interface ResolvedSet {
    type: string;
    weight: number;
    repetitions: number;
    durationSeconds: number | null;
    rpe: number | null;
    restSeconds: number;
    notes: string;
}

export interface ExerciseOption {
    id: string;
    name: string;
    primaryMuscleGroup: string;
    equipment: string;
    mediaUrl: string;
}

export interface ResolvedExercise {
    exerciseId: string | null;
    recognizedName: string;
    matchedName: string | null;
    primaryMuscleGroup: string | null;
    mediaUrl: string;
    confidence: number | null;
    status: "resolved" | "ambiguous" | "not_found";
    options: ExerciseOption[];
    notes: string;
    sets: ResolvedSet[];
}

export interface ResolvedCardio {
    type: string;
    durationMinutes: number;
    distance: number | null;
    calories: number | null;
    averageHeartRate: number | null;
    intensity: string;
    notes: string;
}

export interface AiWorkoutResult {
    title: string | null;
    date: string | null;
    workoutType: string;
    notes: string | null;
    exercises: ResolvedExercise[];
    cardioSessions: ResolvedCardio[];
    warnings: string[];
    unresolvedExercises: string[];
    meta: {
        model: string;
        hasUnresolved: boolean;
        tier: string;
        // Daily quota for the current tier: null limit = unlimited (admin).
        dailyLimit: number | null;
        dailyUsed: number | null;
        dailyRemaining: number | null;
    };
}

// Gemini structured-output schema. Enums are hints only — the backend re-validates and
// clamps every field regardless of what the model returns.
export const AI_WORKOUT_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, nullable: true, description: "Short workout title if stated, else null" },
        date: { type: Type.STRING, nullable: true, description: "ISO date yyyy-mm-dd only if explicitly stated or clearly derivable (today/tomorrow), else null" },
        workoutType: { type: Type.STRING, nullable: true, enum: [...WORKOUT_TYPES], description: "One of the allowed workout types, else null" },
        notes: { type: Type.STRING, nullable: true, description: "General workout notes if any, else null" },
        exercises: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    exerciseId: { type: Type.STRING, nullable: true, description: "id copied EXACTLY from the provided catalog, or null if no catalog exercise matches" },
                    recognizedName: { type: Type.STRING, description: "The exercise name as understood from the user text" },
                    confidence: { type: Type.NUMBER, nullable: true, description: "0..1 confidence of the exercise match" },
                    notes: { type: Type.STRING, nullable: true },
                    sets: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                type: { type: Type.STRING, nullable: true, enum: [...SET_TYPES] },
                                weight: { type: Type.NUMBER, nullable: true, description: "Weight in kg, null if not stated" },
                                repetitions: { type: Type.INTEGER, nullable: true, description: "Reps, null for timed sets or if not stated" },
                                durationSeconds: { type: Type.INTEGER, nullable: true, description: "Seconds for timed sets (plank/hold), null otherwise" },
                                rpe: { type: Type.NUMBER, nullable: true },
                                restSeconds: { type: Type.INTEGER, nullable: true, description: "Rest between sets in seconds, null if not stated" },
                                notes: { type: Type.STRING, nullable: true }
                            },
                            required: ["type"]
                        }
                    }
                },
                required: ["recognizedName", "sets"]
            }
        },
        cardioSessions: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    type: { type: Type.STRING, nullable: true, enum: [...CARDIO_TYPES] },
                    durationMinutes: { type: Type.NUMBER, nullable: true },
                    distance: { type: Type.NUMBER, nullable: true, description: "Distance in km, null if not stated" },
                    calories: { type: Type.INTEGER, nullable: true },
                    averageHeartRate: { type: Type.INTEGER, nullable: true },
                    intensity: { type: Type.STRING, nullable: true, enum: [...CARDIO_INTENSITIES] },
                    notes: { type: Type.STRING, nullable: true }
                }
            }
        },
        warnings: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Short notes about anything ambiguous or not understood" }
    },
    required: ["exercises", "cardioSessions"]
} as const;

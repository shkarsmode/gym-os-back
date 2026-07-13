// Central configuration + safe defaults for the AI-workout feature. Runtime knobs are
// read from environment variables with these fallbacks so a missing var never breaks the
// build. The API key is read from GEMINI_API_KEY and is never referenced here.

export const AI_DEFAULT_MODEL = "gemini-2.5-flash";
export const AI_DEFAULT_TIMEOUT_MS = 15000;
export const AI_DEFAULT_MAX_INPUT_LENGTH = 6000;
export const AI_MIN_INPUT_LENGTH = 3;

// Model sampling — low temperature for deterministic structured parsing.
export const AI_TEMPERATURE = 0.2;
export const AI_MAX_OUTPUT_TOKENS = 4096;

// Server-side abuse limits for the parse endpoint (admin-only, so low volume). In-memory
// and per-instance, mirroring the existing ThrottleGuard — a soft guard, not a hard quota.
export const AI_COOLDOWN_MS = 4000;
export const AI_WINDOW_MS = 60000;
export const AI_MAX_PER_WINDOW = 12;

// Structural caps applied to the model output so a malformed/adversarial response can't
// produce an unbounded payload.
export const AI_MAX_EXERCISES = 40;
export const AI_MAX_SETS_PER_EXERCISE = 30;
export const AI_MAX_CARDIO = 12;
export const AI_MAX_CATALOG = 600;

// Numeric ceilings — kept in sync with the workout DTO validators.
export const AI_MAX_WEIGHT = 2000;
export const AI_MAX_REPS = 1000;
export const AI_MAX_RPE = 10;
export const AI_MAX_REST = 86400;
export const AI_MAX_SET_DURATION = 86400;
export const AI_MAX_CARDIO_MINUTES = 1440;
export const AI_MAX_DISTANCE = 1000;
export const AI_MAX_CALORIES = 100000;
export const AI_MAX_HEART_RATE = 260;

export const WORKOUT_TYPES = ["custom", "push", "pull", "legs", "upper", "full_body", "cardio"] as const;
export const SET_TYPES = ["warmup", "working", "drop", "failure", "backoff"] as const;
export const CARDIO_TYPES = ["treadmill", "bike", "running", "walking", "rower", "elliptical", "other"] as const;
export const CARDIO_INTENSITIES = ["low", "medium", "high"] as const;

export const AI_DEFAULT_WORKOUT_TYPE = "custom";
export const AI_DEFAULT_SET_TYPE = "working";
export const AI_DEFAULT_REST_SECONDS = 90;
export const AI_DEFAULT_CARDIO_TYPE = "treadmill";
export const AI_DEFAULT_CARDIO_INTENSITY = "medium";

// Normalized, non-leaking error codes surfaced to the client and stored in AiUsageLog.
export const AI_ERROR = {
    NOT_CONFIGURED: "GEMINI_NOT_CONFIGURED",
    INPUT_TOO_SHORT: "INPUT_TOO_SHORT",
    INPUT_TOO_LONG: "INPUT_TOO_LONG",
    TIMEOUT: "TIMEOUT",
    RATE_LIMIT: "RATE_LIMIT",
    INVALID_RESPONSE: "INVALID_RESPONSE",
    EMPTY_RESULT: "EMPTY_RESULT",
    GEMINI_ERROR: "GEMINI_ERROR"
} as const;

// Official Gemini free-tier limits per model. Static reference values (not a live quota
// read) with a documentation source — shown alongside real GymOS usage, never presented
// as a "remaining requests" number. Verify against the source URL periodically.
export const GEMINI_FREE_TIER_LIMITS: Record<string, { rpm: number; rpd: number; tpm: number }> = {
    "gemini-2.5-flash": { rpm: 10, rpd: 250, tpm: 250000 },
    "gemini-2.5-flash-lite": { rpm: 15, rpd: 1000, tpm: 250000 },
    "gemini-2.5-pro": { rpm: 5, rpd: 100, tpm: 250000 }
};
export const GEMINI_LIMITS_SOURCE_URL = "https://ai.google.dev/gemini-api/docs/rate-limits";
export const GEMINI_QUOTA_DASHBOARD_URL = "https://aistudio.google.com/rate-limit";

export function aiModel(): string {
    return (process.env.GEMINI_MODEL || "").trim() || AI_DEFAULT_MODEL;
}

export function aiTimeoutMs(): number {
    const value = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS);
    return Number.isFinite(value) && value > 0 ? value : AI_DEFAULT_TIMEOUT_MS;
}

export function aiMaxInputLength(): number {
    const value = Number(process.env.GEMINI_MAX_INPUT_LENGTH);
    return Number.isFinite(value) && value > 0 ? value : AI_DEFAULT_MAX_INPUT_LENGTH;
}

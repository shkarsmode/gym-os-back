// Configuration for the AI-assisted GIF suggestion feature. These live here rather than
// in ai.constants.ts because the feature deliberately shares no state with the AI parse /
// coach endpoints: it has its own rate limit, its own daily cap and its own caches.

// ---- index -----------------------------------------------------------------
export const MEDIA_INDEX_SOURCE_URL = "https://fitnessprogramer.com/sitemap_index.xml";
export const MEDIA_INDEX_SCHEMA_VERSION = 1;
// The site publishes one sitemap file per 200 exercises under this name pattern.
export const MEDIA_INDEX_SITEMAP_PATTERN = /winner_exercise-sitemap\d+\.xml$/i;
export const MEDIA_INDEX_FETCH_TIMEOUT_MS = 12000;
export const MEDIA_INDEX_REFRESH_MS = 24 * 60 * 60 * 1000;
// A refresh that yields fewer entries than this is treated as a broken sitemap and
// discarded, so a site restructuring degrades us to "slightly stale", never to "empty".
export const MEDIA_INDEX_MIN_ENTRIES = 500;

// ---- verification ----------------------------------------------------------
export const MEDIA_VERIFY_TIMEOUT_MS = 2500;
export const MEDIA_VERIFY_CONCURRENCY = 8;
export const MEDIA_VERIFY_BUDGET_MS = 3000;
export const MEDIA_VERIFY_MAX_CANDIDATES = 10;
export const MEDIA_VERIFY_OK_TTL_MS = 24 * 60 * 60 * 1000;
export const MEDIA_VERIFY_FAIL_TTL_MS = 60 * 60 * 1000;
export const MEDIA_VERIFY_CACHE_MAX = 5000;
// Anything smaller than this is a placeholder or a tracking pixel, not a demo image.
export const MEDIA_VERIFY_MIN_BYTES = 1024;

// The site soft-404s: an unknown slug answers 200 with the generic "Online Workout
// Planner" page whose og:image is always this file. Never emit it, never count it.
export const MEDIA_SENTINEL_URLS = [
    "https://fitnessprogramer.com/wp-content/uploads/2022/10/online-workout-planner.jpg"
];

// ---- matching --------------------------------------------------------------
export const MEDIA_MATCH_MIN_SCORE = 0.34;
// Relative floor applied after both tiers are merged. The sort key puts our own catalog
// ahead of the sitemap regardless of score, which is right when the catalog row is a good
// match and badly wrong when it is not: measured on the live catalog, "Присідання зі
// штангою" filled all six slots with tier-0 rows scoring 0.44 to 0.82 ("Біцепс зі
// штангою", "Передпліччя зі штангою") while 1.00-scoring barbell squat gifs never
// appeared. Dropping anything more than this far below the best candidate is the direct
// mitigation for the confidently-wrong risk: it cannot empty the list, because the best
// candidate always survives it.
export const MEDIA_MATCH_RELATIVE_FLOOR = 0.25;
export const MEDIA_MATCH_EXACT_SLUG_BONUS = 0.3;
export const MEDIA_MATCH_EQUIPMENT_BONUS = 0.12;
export const MEDIA_MATCH_MUSCLE_BONUS = 0.08;
export const MEDIA_MATCH_DICE_WEIGHT = 0.65;
export const MEDIA_MATCH_COVERAGE_WEIGHT = 0.35;

// ---- assembly --------------------------------------------------------------
export const MEDIA_SUGGEST_DEFAULT_LIMIT = 6;
export const MEDIA_SUGGEST_MAX_LIMIT = 8;
// Once this many gifs survive verification, static photos are dropped entirely: the
// user asked for an animation, so a photo is only ever a way to avoid an empty sheet.
export const MEDIA_GIF_SUFFICIENT = 3;
export const MEDIA_NEARBY_LIMIT = 3;

// ---- naming (the only AI on the path) --------------------------------------
export const MEDIA_NAME_TIMEOUT_MS = 6000;
export const MEDIA_NAME_MAX_OUTPUT_TOKENS = 256;
export const MEDIA_NAME_TEMPERATURE = 0;
export const MEDIA_NAME_MIN_CONFIDENCE = 0.35;
export const MEDIA_NAME_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const MEDIA_NAME_CACHE_MAX = 500;
// Its own budget, counted in AiUsageLog under an operation name that falls outside both
// countTodaySuccess ("parse_workout") and countTodayCoach ("coach*"), so it cannot eat
// the parse or coach quotas.
export const MEDIA_AI_OPERATION = "suggest_media";
export const MEDIA_SUGGEST_AI_DAILY_LIMIT = 30;

// ---- response cache --------------------------------------------------------
export const MEDIA_SUGGEST_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const MEDIA_SUGGEST_CACHE_MAX = 300;
// The tier-0 catalog query is one indexed read, but a suggestion burst would repeat it
// per click for no benefit; the catalog changes on the order of days, not seconds.
export const MEDIA_CATALOG_CACHE_TTL_MS = 10 * 60 * 1000;

// ---- budgets ---------------------------------------------------------------
export const MEDIA_TOTAL_BUDGET_MS = 9000;

// ---- rate limiting ---------------------------------------------------------
export const MEDIA_RATE_COOLDOWN_MS = 1500;
export const MEDIA_RATE_WINDOW_MS = 60000;
export const MEDIA_RATE_MAX_PER_WINDOW = 20;
export const MEDIA_RATE_DAILY_MAX = 60;

// ---- provenance ------------------------------------------------------------
// Hosts a suggestion may ever point at. Also the allowlist the exercise write path
// should apply to persisted mediaReferences.
export const MEDIA_HOST_ALLOWLIST = ["fitnessprogramer.com", "www.fitnessprogramer.com", "exrx.net"];

export const MEDIA_SOURCE_LABELS: Record<string, string> = {
    catalog: "Вже у каталозі",
    fitnessprogramer: "fitnessprogramer.com"
};

// Kill switch for the licensing question in section 6.3: MEDIA_SUGGEST_SOURCES=catalog
// reduces the feature to our own database and nothing else.
export function mediaCatalogOnly(): boolean {
    return String(process.env.MEDIA_SUGGEST_SOURCES || "").trim().toLowerCase() === "catalog";
}

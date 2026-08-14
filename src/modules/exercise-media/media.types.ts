// Shared shapes for the exercise-media module. Kept free of Nest imports so the
// standalone index builder in scripts/ can reuse them without booting the app.

export type MediaKind = "gif" | "image";
export type MediaSourceName = "catalog" | "fitnessprogramer";
export type MediaTier = 0 | 1;

export type MediaDegraded =
    | "ai_unavailable"
    | "ai_quota"
    | "index_unavailable"
    | "no_match"
    | "verification_failed"
    | "timeout";

// One row of the committed snapshot. `url` is a verbatim copy of an <image:loc> the site
// published next to the exercise page; nothing here is ever assembled from parts.
export interface MediaIndexEntry {
    slug: string;
    name: string;
    page: string;
    url: string;
    isGif: boolean;
}

export interface MediaIndexSnapshot {
    schemaVersion: number;
    source: string;
    fetchedAt: string;
    count: number;
    entries: MediaIndexEntry[];
}

// A scored, not-yet-verified suggestion. It may still be dropped at the verify gate.
export interface MediaCandidate {
    url: string;
    label: string;
    source: MediaSourceName;
    sourcePage: string | null;
    tier: MediaTier;
    score: number;
    isGif: boolean;
    // Share of the entry's own tokens the query explained. Pure tiebreak: the spec
    // formula caps at 1, so without it "cable lying triceps extension" and "cable
    // triceps extension" are indistinguishable and the shorter, closer name loses to
    // whichever happens to be a bigger file.
    specificity: number;
}

export interface VerifiedMedia {
    url: string;
    contentType: string;
    bytes: number;
    mediaType: MediaKind;
}

export interface VerifyBatchResult {
    verified: Map<string, VerifiedMedia>;
    attempted: number;
    completed: number;
    timedOut: boolean;
}

export interface MediaSuggestItem {
    url: string;
    label: string;
    source: MediaSourceName;
    sourceLabel: string;
    sourcePage: string | null;
    mediaType: MediaKind;
    contentType: string | null;
    bytes: number | null;
    score: number;
    verified: boolean;
    verifiedBy: "head" | "in_use";
}

// The normalized request. The controller's DTO validates it, everything downstream
// consumes this shape so the services stay testable without class-validator.
export interface MediaSuggestRequest {
    name: string;
    aliases: string[];
    primaryMuscleGroup: string;
    equipment: string;
    movementPattern: string;
    limit: number;
}

export interface ResolvedName {
    englishName: string;
    aliases: string[];
    equipment: string;
    primaryMuscle: string;
    confidence: number;
    aiUsed: boolean;
    aiModel: string | null;
    lowConfidence: boolean;
    degraded: MediaDegraded | null;
}

export interface MediaSuggestTimings {
    ai: number;
    match: number;
    verify: number;
    total: number;
}

export interface MediaSuggestResponse {
    query: string;
    resolvedName: string;
    resolvedAliases: string[];
    aiUsed: boolean;
    aiModel: string | null;
    lowConfidence: boolean;
    indexSource: "sitemap" | "snapshot" | "none";
    indexSize: number;
    degraded: MediaDegraded | null;
    timings: MediaSuggestTimings;
    items: MediaSuggestItem[];
    nearby: MediaSuggestItem[];
}

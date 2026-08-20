// Bounds for the social layer. Everything user-generated is capped so one member
// cannot flood the feed, a thread, or someone's notification list.
export const FEED_PAGE_SIZE = 15;
export const FEED_MAX_PAGE_SIZE = 30;
export const COMMENT_MAX_LENGTH = 700;
export const COMMENT_PAGE_SIZE = 30;
export const NOTIFICATION_PAGE_SIZE = 30;
export const REPORT_DETAILS_MAX_LENGTH = 500;

export const FEED_SCOPES = ["team", "records", "achievements", "mine"] as const;
export const FEED_TARGET_TYPES = ["workout", "achievement", "record", "comment"] as const;
export const REPORT_REASONS = ["spam", "abuse", "unsafe", "other"] as const;

// Notification types. `push` decides whether a browser push may be sent when the
// user has not disabled that category — announcements stay silent by design.
export const NOTIFICATION_TYPES = {
    COMMENT: "comment",
    REPLY: "reply",
    REACTION: "reaction",
    MENTION: "mention",
    ACHIEVEMENT: "achievement",
    TEAM: "team",
    MODERATION: "moderation",
    ACCESS_REQUEST: "access_request",
    ACCESS_GRANTED: "access_granted",
    PARTNER_INVITE: "partner_invite",
    PARTNER_JOINED: "partner_joined",
    PARTNER_EDIT_GRANTED: "partner_edit_granted"
} as const;

// Defaults for the per-user push switches: direct interactions with YOUR content are
// on, ambient team activity is off. Anything added later must default to off too —
// an opt-out feed of notifications is how apps get muted entirely.
export const PUSH_DEFAULTS: Record<string, boolean> = {
    comment: true,
    reply: true,
    reaction: true,
    mention: true,
    achievement: false,
    team: false,
    moderation: true,
    // Both are direct interactions with YOU that need an answer or report one you were
    // waiting for — the same category as a comment on your post, not ambient activity.
    // An access request sits unanswered until its owner sees it, and the requester is
    // blocked from training with them meanwhile.
    access_request: true,
    access_granted: true,
    // An invitation to train together is only useful in the next few minutes — someone
    // is standing in a gym waiting for an answer. Off by default would make it useless.
    partner_invite: true,
    partner_joined: true,
    partner_edit_granted: true
};

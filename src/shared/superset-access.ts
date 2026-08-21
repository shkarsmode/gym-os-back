import { ForbiddenException } from "@nestjs/common";
import { QuotaTier } from "./admin";

/** What a save is asking for, reduced to the part the tier rule cares about. */
export interface SupersetIntent {
    /** Group ids the payload declares. */
    requestedGroupIds: string[];
    /** Group ids the workout already has stored. */
    existingGroupIds: string[];
}

/**
 * May this tier save these superset groups?
 *
 * The rule is about CREATING, not about having. A plan ending is not a reason to take
 * somebody's training away, so a workout that already contains a superset keeps saving
 * — including its autosaves — after a downgrade; what a free account cannot do is
 * introduce a group that was not there before.
 *
 * Returning the ids rather than a boolean lets the caller drop unknown groups instead of
 * failing a whole save over one stray reference.
 */
export function newSupersetGroupIds(intent: SupersetIntent): string[] {
    const existing = new Set(intent.existingGroupIds);
    return [...new Set(intent.requestedGroupIds)].filter((groupId) => !existing.has(groupId));
}

export function canCreateSupersets(tier: QuotaTier): boolean {
    return tier === "admin" || tier === "premium";
}

/**
 * Throws when a free account tries to introduce a superset.
 *
 * A 403 rather than silently dropping the group: the client hides the action behind a
 * paywall, so a request that gets here is either a bug or somebody going around the UI,
 * and both deserve an answer rather than a save that quietly did something else.
 */
export function assertSupersetTier(tier: QuotaTier, intent: SupersetIntent): void {
    if (canCreateSupersets(tier)) {
        return;
    }
    const introduced = newSupersetGroupIds(intent);
    if (introduced.length) {
        throw new ForbiddenException({
            code: "SUPERSET_REQUIRES_PRO",
            message: "Supersets are a PRO feature. Existing supersets stay readable and keep saving."
        });
    }
}

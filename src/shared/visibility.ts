import { PrismaService } from "../prisma/prisma.service";
import { RequestUser } from "./current-user.decorator";
import { isAdminUser } from "./admin";

/**
 * Who may see the DETAIL behind another member's training.
 *
 * DETAIL is: exercises, sets, repetitions, weights, notes, personal records, and anything
 * summed from them for a single session (its volume, its set count, its exercise count).
 *
 * NOT detail, and deliberately still public: the FACT that a session happened, its date,
 * its type, its duration, and a member's lifetime standing — level, XP, streak. Hiding
 * those would remove a private member from the feed and the leaderboard entirely, which
 * is not what "hide my workout details" means.
 *
 * Resolved ONCE per request and threaded down. It is a value rather than a service on
 * purpose: a service can be called late, from inside a mapper, after the rows are already
 * in memory — and the requirement here is that private data never leaves the database,
 * not that it is stripped on the way out.
 */
export class Visibility {
    private constructor(
        readonly callerId: string,
        /** Private owners this caller has NOT been granted. Empty in the common case. */
        private readonly denied: ReadonlySet<string>
    ) {}

    canSeeDetail(ownerId: string): boolean {
        return ownerId === this.callerId || !this.denied.has(ownerId);
    }

    /** Owner ids to exclude in a Prisma where-clause, for sources whose rows must vanish. */
    hiddenOwnerIds(): string[] {
        return [...this.denied];
    }

    get hidesAnyone(): boolean {
        return this.denied.size > 0;
    }

    /** Split owner ids in one pass, for the two-query fetch pattern. */
    partition(ownerIds: string[]): { visible: string[]; hidden: string[] } {
        const visible: string[] = [];
        const hidden: string[] = [];
        for (const id of new Set(ownerIds)) {
            (this.canSeeDetail(id) ? visible : hidden).push(id);
        }
        return { visible, hidden };
    }

    /**
     * For a path that genuinely only ever reads the caller's own rows.
     *
     * Grepping for this name enumerates every place that CLAIMS to be own-scoped, which
     * is the audit this design depends on. Do not use it to "skip" a check on a path that
     * touches anyone else's data — it permits everything.
     */
    static ownerOnly(userId: string): Visibility {
        return new Visibility(userId, new Set());
    }

    /**
     * Everything an admin may see.
     *
     * Admins already bypass ownership everywhere else in this codebase (see isAdminUser
     * in admin.ts and its use in WorkoutsService), and the moderation queue cannot work
     * without it. Note this deliberately does NOT extend to impersonation: an admin
     * acting as someone else gets that person's visibility, not their own.
     */
    private static admin(userId: string): Visibility {
        return new Visibility(userId, new Set());
    }

    static async resolve(prisma: PrismaService, user: RequestUser): Promise<Visibility> {
        // An impersonated session is the target's session. Resolving the ADMIN's
        // visibility here would hand the impersonator a view the person they are
        // impersonating does not have.
        if (isAdminUser(user) && !user.impersonatedBy) {
            return Visibility.admin(user.id);
        }
        try {
            const denied = await prisma.user.findMany({
                where: {
                    hideWorkoutDetails: true,
                    id: { not: user.id },
                    accessGrantsOwned: { none: { viewerId: user.id, status: "accepted" } }
                },
                select: { id: true }
            });
            return new Visibility(user.id, new Set(denied.map((row) => row.id)));
        } catch (error) {
            // FAIL CLOSED.
            //
            // ensureSchema swallows its own failures and only logs them, so a database
            // missing WorkoutAccessGrant boots a healthy-looking app. If this query
            // cannot run, we do not know who granted whom — so nobody is granted, and
            // every private owner is denied. The alternative, treating the failure as an
            // empty denied set, turns one logged DDL error into a silent full-gym leak.
            const priv = await prisma.user
                .findMany({ where: { hideWorkoutDetails: true, id: { not: user.id } }, select: { id: true } })
                .catch(() => null);
            if (!priv) {
                // Even the fallback failed: answer 500 rather than guess.
                throw error;
            }
            return new Visibility(user.id, new Set(priv.map((row) => row.id)));
        }
    }
}

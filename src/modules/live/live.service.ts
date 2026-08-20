import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { serializeWorkoutSummary } from "../../shared/serialize";
import { RequestUser } from "../../shared/current-user.decorator";
import { LiveBus } from "./live.bus";
import { CHEER_EMOJI, cheerCooldown } from "./live.rules";

/**
 * Who is training right now, and cheering them on.
 *
 * Presence exists because cheering had nowhere to live without it: before this there was
 * no surface anywhere in the app that told you somebody is in the gym at this moment, so
 * there was nothing to tap 💪 on. The feed shows sessions once they are FINISHED, which
 * is exactly too late to encourage anyone.
 */

// One cheer row per person per session, stored under its own target type so it cannot
// collide with the like on the same workout — FeedReaction's unique key is
// (userId, targetType, targetId) and does not include `kind`.
const CHEER_TARGET = "cheer";

// Matches the peer window /export uses, so the two never disagree about which of
// somebody else's sessions this client is supposed to be holding.
const PEER_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

@Injectable()
export class LiveService {
    // Per (cheerer, workout) timestamp of the last delivered cheer. In memory and
    // per-process, which is the right lifetime: this throttles an animation, and a
    // restart losing it costs nothing.
    private readonly lastCheer = new Map<string, number>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly bus: LiveBus
    ) {}

    /**
     * Everyone with a session in progress.
     *
     * `firstSetAt` travels because the client already knows how to render a running gym
     * clock from it, so the presence strip can show how long someone has been at it
     * rather than just that they are somewhere.
     */
    async presence() {
        const rows = await this.prisma.workout.findMany({
            where: { status: "active" },
            select: {
                id: true,
                userId: true,
                title: true,
                workoutType: true,
                firstSetAt: true,
                user: { select: { id: true, displayName: true, avatarUrl: true } }
            },
            orderBy: { firstSetAt: "desc" }
        });
        return {
            training: rows
                // A session that was started and never touched is not somebody in a gym;
                // it is a plan someone opened. Only a ticked set proves presence.
                .filter((row) => Boolean(row.firstSetAt))
                .map((row) => ({
                    workoutId: row.id,
                    userId: row.userId,
                    title: row.title,
                    workoutType: row.workoutType,
                    firstSetAt: row.firstSetAt?.toISOString() || null,
                    displayName: row.user?.displayName || "",
                    avatarUrl: row.user?.avatarUrl || null
                }))
        };
    }

    /**
     * Everyone else's recent sessions, as summaries.
     *
     * The same rows and the same 60-day window /export sends at boot, so a client that
     * hears "the team moved" can refresh the calendar, the day sheet and the activity
     * feed without re-downloading the entire boot payload — which is several hundred
     * kilobytes and includes the whole exercise catalogue.
     *
     * Summaries, exactly like /export: aggregates but not a single set.
     */
    async peers(user: RequestUser) {
        const rows = await this.prisma.workout.findMany({
            where: { userId: { not: user.id }, date: { gte: new Date(Date.now() - PEER_WINDOW_MS) } },
            include: { exercises: { include: { sets: true }, orderBy: { order: "asc" } }, cardioSessions: true },
            orderBy: { date: "desc" }
        });
        return { workouts: rows.map(serializeWorkoutSummary) };
    }

    async cheer(user: RequestUser, workoutId: string, emoji: string) {
        if (!CHEER_EMOJI.includes(emoji)) {
            // A closed set, not free text: this string is rendered into other people's
            // screens, and an open field there is an invitation to put something else in it.
            throw new BadRequestException("Unknown cheer");
        }
        const [workout, actor] = await Promise.all([
            this.prisma.workout.findUnique({
                where: { id: workoutId },
                select: { id: true, userId: true, status: true }
            }),
            // The recipient has to be able to see WHO is cheering, and a name alone is
            // weak at a glance — the face is what identifies a training partner.
            // RequestUser carries no avatar, so it is read here.
            this.prisma.user.findUnique({
                where: { id: user.id },
                select: { displayName: true, avatarUrl: true }
            })
        ]);
        if (!workout) {
            throw new NotFoundException("Workout not found");
        }
        if (workout.userId === user.id) {
            throw new BadRequestException("Cannot cheer your own session");
        }
        if (workout.status !== "active") {
            // Cheering is for someone who is training NOW. A finished session has the
            // feed's own reactions for that.
            throw new BadRequestException("Session is not running");
        }

        const key = `${user.id}:${workoutId}`;
        const now = Date.now();
        const deliver = cheerCooldown(this.lastCheer.get(key), now);
        if (deliver) {
            this.lastCheer.set(key, now);
        }

        // Persisted so a cheer that lands while the phone is face-down in a gym bag is
        // still there when its owner next looks — the live event alone would be gone.
        // Upsert, so tapping again swaps the emoji instead of failing the unique key.
        await this.prisma.feedReaction.upsert({
            where: { userId_targetType_targetId: { userId: user.id, targetType: CHEER_TARGET, targetId: workoutId } },
            update: { kind: emoji },
            create: { userId: user.id, targetType: CHEER_TARGET, targetId: workoutId, kind: emoji }
        });

        if (deliver) {
            this.bus.publish(workout.userId, {
                name: "cheer",
                at: new Date().toISOString(),
                cheer: {
                    emoji,
                    workoutId,
                    actor: {
                        id: user.id,
                        displayName: actor?.displayName || user.displayName || "",
                        avatarUrl: actor?.avatarUrl || null
                    }
                }
            });
        }
        return { ok: true, delivered: deliver };
    }

    /**
     * Cheers already sitting on a session, for the owner to catch up on.
     *
     * Read on returning to the app: the live event is fired once and lost if nobody was
     * listening, which is precisely the common case — between sets the screen is off.
     */
    async cheersFor(user: RequestUser, workoutId: string) {
        const workout = await this.prisma.workout.findUnique({
            where: { id: workoutId },
            select: { userId: true }
        });
        if (!workout || workout.userId !== user.id) {
            // Only the person being cheered reads their own cheers.
            throw new NotFoundException("Workout not found");
        }
        const rows = await this.prisma.feedReaction.findMany({
            where: { targetType: CHEER_TARGET, targetId: workoutId },
            orderBy: { createdAt: "asc" }
        });
        const actors = await this.prisma.user.findMany({
            where: { id: { in: [...new Set(rows.map((row) => row.userId))] } },
            select: { id: true, displayName: true, avatarUrl: true }
        });
        const byId = new Map(actors.map((actor) => [actor.id, actor]));
        return {
            cheers: rows.map((row) => ({
                id: row.id,
                emoji: row.kind,
                at: row.createdAt.toISOString(),
                actor: byId.get(row.userId) || { id: row.userId, displayName: "", avatarUrl: null }
            }))
        };
    }
}

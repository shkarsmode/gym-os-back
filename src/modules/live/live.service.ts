import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { serializeWorkoutSummary } from "../../shared/serialize";
import { RequestUser } from "../../shared/current-user.decorator";
import { LiveBus } from "./live.bus";
import { CHEER_EMOJI, allowCheer, isCheerable, onePerPerson, presenceState, trimCheerHistory } from "./live.rules";

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

// Matches the gym clock's own cutoff in gym-os-front/lib/gym-clock.js: past this the
// clock stops pretending a session is live, and so does this.
const GYM_CLOCK_MAX_MS = 5 * 60 * 60 * 1000;

function startOfToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function endOfToday(): Date {
    const start = startOfToday();
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
}

@Injectable()
export class LiveService {
    // Per (cheerer, workout) timestamp of the last delivered cheer. In memory and
    // per-process, which is the right lifetime: this throttles an animation, and a
    // restart losing it costs nothing.
    // Per (cheerer, workout), when their recent cheers were sent. In memory and
    // per-process, which is the right lifetime: this throttles an animation, and a
    // restart losing it costs nothing.
    private readonly cheerHistory = new Map<string, number[]>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly bus: LiveBus
    ) {}

    /**
     * Everyone who is in the gym, or about to be.
     *
     * Three states, because "training" alone left out the two moments when encouragement
     * is worth the most — the person who has arrived but not lifted yet, and the person
     * who put a session in the calendar for today and has not started it. Both are
     * cheerable; only the first carries a clock, because the other two have not started
     * one and a running timer next to them would be a lie.
     */
    async presence() {
        // Who is training with whom right now. Read alongside presence rather than per
        // row: with a handful of people in a gym this is one small query, and doing it
        // per person would be one per row.
        const pairs = await this.prisma.trainingPartnership.findMany({
            where: { status: "active" },
            select: {
                hostId: true,
                guestId: true,
                host: { select: { id: true, displayName: true } },
                guest: { select: { id: true, displayName: true } }
            }
        }).catch(() => []);
        const partnerOf = new Map<string, { id: string; displayName: string }>();
        for (const pair of pairs) {
            if (pair.host && pair.guest) {
                partnerOf.set(pair.hostId, pair.guest);
                partnerOf.set(pair.guestId, pair.host);
            }
        }

        const rows = await this.prisma.workout.findMany({
            where: {
                // TODAY only, for every state.
                //
                // "status: active" on its own is not a person in a gym — it is a row
                // nobody closed. A session opened weeks ago and abandoned keeps that
                // status forever (nothing expires it server-side; the client only heals
                // its OWNER's rows, and that owner has to open the app for it to happen),
                // so it sat in this strip permanently as somebody warming up.
                //
                // The one exception is a session that ran past midnight: it still belongs
                // here while its clock is running, which is why a recent ticked set also
                // qualifies.
                OR: [
                    { status: "active", date: { gte: startOfToday(), lt: endOfToday() } },
                    { status: "active", lastSetAt: { gte: new Date(Date.now() - GYM_CLOCK_MAX_MS) } },
                    // Planned, but for TODAY. A session planned for next Tuesday is not
                    // somebody to cheer on now.
                    { status: "planned", date: { gte: startOfToday(), lt: endOfToday() } }
                ]
            },
            select: {
                id: true,
                userId: true,
                title: true,
                status: true,
                workoutType: true,
                firstSetAt: true,
                user: { select: { id: true, displayName: true, avatarUrl: true } }
            },
            orderBy: { firstSetAt: "desc" }
        });
        return {
            training: onePerPerson(rows.map((row) => ({
                workoutId: row.id,
                userId: row.userId,
                title: row.title,
                workoutType: row.workoutType,
                state: presenceState(row.status, row.firstSetAt),
                firstSetAt: row.firstSetAt?.toISOString() || null,
                displayName: row.user?.displayName || "",
                avatarUrl: row.user?.avatarUrl || null,
                // Present only while a joint session is running, so the strip can say
                // "training with X" without a second request.
                partner: partnerOf.get(row.userId) || null
            })))
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
                select: { id: true, userId: true, status: true, date: true, lastSetAt: true }
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
        if (!isCheerable(workout.status, workout.date, new Date(), workout.lastSetAt)) {
            // Cheering is for someone who is training now or about to. A finished session
            // has the feed's own reactions for that, and one planned for next week is not
            // a person to encourage yet.
            throw new BadRequestException("Session is not running");
        }

        const key = `${user.id}:${workoutId}`;
        const now = Date.now();
        const history = this.cheerHistory.get(key) || [];
        const deliver = allowCheer(history, now);
        this.cheerHistory.set(key, deliver ? [...trimCheerHistory(history, now), now] : trimCheerHistory(history, now));

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

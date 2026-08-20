import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import { Observable, Subject } from "rxjs";

/**
 * The fan-out behind the per-user live stream.
 *
 * Every device a person has open holds one subscription here, keyed by user id. A write
 * that lands over HTTP publishes a HINT to that key and every one of their devices learns
 * the row moved — which is the whole point of the feature: a session started on the
 * desktop appears on the phone without a pull-to-refresh.
 *
 * What travels is deliberately only a hint: ids and a version, never workout content.
 * HTTP stays the single source of truth and the single authorization point — a client
 * that hears "workout X changed" still has to fetch it through the guarded route, so a
 * stream can never hand out something the reader was not already allowed to read. It also
 * means a total outage of this bus degrades to exactly today's behaviour rather than to
 * wrong data on screen.
 *
 * In-memory and per-process on purpose. One container serves this app; the day a second
 * replica appears, a device connected to replica A stops hearing writes that land on
 * replica B, and this needs a shared bus (Redis pub/sub) before that happens.
 */

// "team.changed" is the one event that goes to EVERYONE: something happened that alters
// what the whole gym sees — a session opened or closed, somebody's first set was ticked,
// a workout appeared or vanished. It stays a hint, so listeners re-read through the
// routes they are already allowed to read.
export type LiveEventName =
    | "workout.changed"
    | "workout.deleted"
    | "team.changed"
    | "cheer"
    // Somebody asked for access, or answered a request. The listener re-reads
    // /access/state — the event carries no names or decisions of its own.
    | "access.changed"
    // Access this device HELD was withdrawn. Distinct from access.changed because it
    // demands more than a refresh: the detail already in memory has to be dropped.
    | "access.revoked"
    | "hello"
    | "ping";

export interface LiveEvent {
    name: LiveEventName;
    /** Workout ids this event concerns. Plural because one save can move several rows. */
    ids?: string[];
    /** The server revision the writer produced, so a listener can ignore what it already has. */
    version?: string | null;
    /**
     * The one event that carries content rather than a hint: a cheer is addressed to a
     * single recipient and IS the message, so re-reading it through another route would
     * be a round-trip for nothing. Everything else stays a hint.
     */
    cheer?: { emoji: string; workoutId: string; actor: { id: string; displayName: string; avatarUrl: string | null } };
    /**
     * WHICH shared surfaces a team event touches.
     *
     * Three surfaces, three different reasons to move, and conflating them means every
     * listener refreshes everything:
     *   presence — who is shown as training right now
     *   feed     — FINISHED sessions only, so a warm-up never belongs here
     *   peers    — the calendar and day sheet, which show planned and active rows too,
     *              and therefore move for changes the feed does not care about
     */
    touches?: { presence?: boolean; feed?: boolean; peers?: boolean };
    at: string;
}

@Injectable()
export class LiveBus implements OnApplicationShutdown {
    private readonly logger = new Logger(LiveBus.name);
    private readonly streams = new Map<string, Set<Subject<LiveEvent>>>();

    /**
     * A stream for one device. The caller is responsible for completing it — see
     * LiveController, which does so when the HTTP response closes.
     */
    open(userId: string): { events: Observable<LiveEvent>; close: () => void } {
        const subject = new Subject<LiveEvent>();
        const existing = this.streams.get(userId);
        if (existing) {
            existing.add(subject);
        } else {
            this.streams.set(userId, new Set([subject]));
        }
        const close = () => {
            const set = this.streams.get(userId);
            if (!set) {
                return;
            }
            set.delete(subject);
            // Drop the key rather than leaving an empty Set behind: with a bucket per
            // user that has ever connected, the map would only ever grow.
            if (!set.size) {
                this.streams.delete(userId);
            }
            subject.complete();
        };
        return { events: subject.asObservable(), close };
    }

    publish(userId: string, event: LiveEvent): void {
        const set = this.streams.get(userId);
        if (!set || !set.size) {
            return;
        }
        for (const subject of set) {
            try {
                subject.next(event);
            } catch (error) {
                // One broken stream must never fail the write that triggered the publish.
                this.logger.warn(`live publish failed for ${userId}: ${String(error)}`);
            }
        }
    }

    /**
     * End every stream on SIGTERM.
     *
     * An open SSE response is an unfinished HTTP request, so the server will not close
     * while one exists: a redeploy would sit through the grace period and then be killed,
     * dropping connections hard instead of letting clients reconnect on their own terms.
     */
    onApplicationShutdown(): void {
        for (const set of this.streams.values()) {
            for (const subject of set) {
                subject.complete();
            }
        }
        this.streams.clear();
    }

    /**
     * Send to every open stream.
     *
     * Only for events that are true for everyone at once — right now that is presence,
     * "somebody started or finished a session". It stays a hint: listeners answer by
     * re-reading the guarded presence route, so this cannot become a way to push one
     * person's data to the whole gym.
     */
    broadcast(event: LiveEvent): void {
        for (const userId of [...this.streams.keys()]) {
            this.publish(userId, event);
        }
    }

    /** Connection counts for the health endpoint — there is otherwise no way to see this. */
    stats(): { users: number; streams: number } {
        let streams = 0;
        for (const set of this.streams.values()) {
            streams += set.size;
        }
        return { users: this.streams.size, streams };
    }
}

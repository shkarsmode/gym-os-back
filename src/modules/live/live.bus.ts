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
// How often a watched session may announce itself. See publishToWatchers.
const WATCH_MIN_GAP_MS = 2000;

export type LiveEventName =
    | "workout.changed"
    | "workout.deleted"
    // A session somebody is WATCHING moved. Carries ids and a version, never content.
    | "workout.watch"
    | "team.changed"
    | "cheer"
    // Somebody asked for access, or answered a request. The listener re-reads
    // /access/state — the event carries no names or decisions of its own.
    | "access.changed"
    // Access this device HELD was withdrawn. Distinct from access.changed because it
    // demands more than a refresh: the detail already in memory has to be dropped.
    | "access.revoked"
    // An invitation to train together was sent, answered or ended.
    | "partner.changed"
    // The person you are training with moved their session — go and re-read it.
    | "partner.workout"
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
    /** Only on the hello frame: identifies this connection for watch registration. */
    token?: string;
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
     * Who is watching which session, keyed by CONNECTION rather than by person.
     *
     * A person is plural — `streams` above is a Set per user precisely because devices
     * are. Keying a watch by user id would mean a desktop opening the panel silently
     * evicts the phone's, and closing one idle tab tears down the other device's watch.
     *
     * Two maps: one for the publish path (which streams care about this workout) and one
     * for teardown (what was this connection watching), so neither is a scan.
     */
    private readonly watchers = new Map<string, Set<string>>();
    private readonly watching = new Map<string, { workoutId: string; subject: Subject<LiveEvent> }>();
    private nextToken = 1;
    /** Live subjects by token, so a watch can find the connection that registered it. */
    private readonly openSubjects = new Map<string, Subject<LiveEvent>>();
    /** Last fan-out per watched session, for the rate limit in publishToWatchers. */
    private readonly lastWatchPublish = new Map<string, number>();

    /**
     * A stream for one device. The caller is responsible for completing it — see
     * LiveController, which does so when the HTTP response closes.
     */
    open(userId: string): { events: Observable<LiveEvent>; close: () => void; token: string } {
        const subject = new Subject<LiveEvent>();
        const token = `s${this.nextToken += 1}`;
        const existing = this.streams.get(userId);
        if (existing) {
            existing.add(subject);
        } else {
            this.streams.set(userId, new Set([subject]));
        }
        this.openSubjects.set(token, subject);
        const close = () => {
            // Teardown of the watch lives HERE, in the closer wired to both the request
            // and the response, because that is the only hook that fires for a phone that
            // simply stopped being reachable. Idempotent, since both fire.
            this.unwatch(token);
            this.openSubjects.delete(token);
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
        return { events: subject.asObservable(), close, token };
    }

    /**
     * Register a connection as watching one session.
     *
     * Authorization is the CALLER's job and must happen before this — see
     * LiveService.watch. A hint's arrival TIME is information: an unauthorized watcher
     * receiving one per set would learn a private member's tempo, set count and gym hours
     * without ever reading a single row.
     */
    watch(token: string, workoutId: string): void {
        this.unwatch(token);
        const subject = this.subjectOf(token);
        if (!subject) {
            return;
        }
        this.watching.set(token, { workoutId, subject });
        const set = this.watchers.get(workoutId);
        if (set) {
            set.add(token);
        } else {
            this.watchers.set(workoutId, new Set([token]));
        }
    }

    unwatch(token: string): void {
        const held = this.watching.get(token);
        if (!held) {
            return;
        }
        this.watching.delete(token);
        const set = this.watchers.get(held.workoutId);
        if (!set) {
            return;
        }
        set.delete(token);
        if (!set.size) {
            this.watchers.delete(held.workoutId);
            // Nothing is watching this session any more, so its rate-limit stamp is dead
            // weight — and without this the map grows by one entry per session ever
            // watched and never shrinks.
            this.lastWatchPublish.delete(held.workoutId);
        }
    }

    /** Drop every watch on a session — it finished, was deleted, or access was withdrawn. */
    dropWatchers(workoutId: string): void {
        for (const token of [...(this.watchers.get(workoutId) || [])]) {
            this.unwatch(token);
        }
    }

    /**
     * Deliver to the connections watching this session, and to nobody else.
     *
     * Rate-limited per session. Every autosave announces, which for somebody typing in a
     * notes field is roughly one every 650 ms — and each hint costs every WATCHER a full
     * workout read, so an unthrottled fan-out burns through their own 200-requests-a-
     * minute budget and starts 429-ing their own saves. Two seconds is invisible to a
     * person watching a barbell.
     */
    publishToWatchers(workoutId: string, event: LiveEvent): void {
        const set = this.watchers.get(workoutId);
        if (!set || !set.size) {
            return;
        }
        const now = Date.now();
        const last = this.lastWatchPublish.get(workoutId) || 0;
        if (now - last < WATCH_MIN_GAP_MS) {
            return;
        }
        this.lastWatchPublish.set(workoutId, now);
        for (const token of set) {
            const held = this.watching.get(token);
            if (!held) {
                continue;
            }
            try {
                held.subject.next(event);
            } catch (error) {
                this.logger.warn(`watch publish failed: ${String(error)}`);
            }
        }
    }

    private subjectOf(token: string): Subject<LiveEvent> | null {
        // The subject is captured when the watch is registered, so a token that no longer
        // has a live stream simply registers nothing.
        const held = this.watching.get(token);
        return held ? held.subject : this.openSubjects.get(token) || null;
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
        this.watchers.clear();
        this.watching.clear();
        this.openSubjects.clear();
        this.lastWatchPublish.clear();
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
    stats(): { users: number; streams: number; watching: number; watched: number } {
        let streams = 0;
        for (const set of this.streams.values()) {
            streams += set.size;
        }
        return {
            users: this.streams.size,
            streams,
            // Both counts, because a mismatch between them is what a registry leak looks
            // like: connections still registered against sessions nobody is connected to.
            watching: this.watching.size,
            watched: this.watchers.size
        };
    }
}

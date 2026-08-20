import { LiveBus, LiveEvent } from "./live.bus";

const event = (name: LiveEvent["name"] = "workout.changed"): LiveEvent => ({
    name,
    ids: ["workout-1"],
    version: "2026-08-20T10:00:00.000Z",
    at: "2026-08-20T10:00:00.000Z"
});

function collect(bus: LiveBus, userId: string) {
    const seen: LiveEvent[] = [];
    const stream = bus.open(userId);
    const subscription = stream.events.subscribe((value) => seen.push(value));
    return { seen, close: stream.close, subscription };
}

describe("LiveBus fan-out", () => {
    it("delivers one publish to every device the person has open", () => {
        // The whole point of the feature: a save on the desktop has to reach the phone.
        const bus = new LiveBus();
        const phone = collect(bus, "user-1");
        const desktop = collect(bus, "user-1");

        bus.publish("user-1", event());

        expect(phone.seen).toHaveLength(1);
        expect(desktop.seen).toHaveLength(1);
    });

    it("never delivers one person's events to another", () => {
        const bus = new LiveBus();
        const mine = collect(bus, "user-1");
        const theirs = collect(bus, "user-2");

        bus.publish("user-1", event());

        expect(mine.seen).toHaveLength(1);
        expect(theirs.seen).toHaveLength(0);
    });

    it("publishing to nobody is a no-op rather than an error", () => {
        // Every write publishes; most of the time the author has no stream open.
        const bus = new LiveBus();
        expect(() => bus.publish("user-nobody", event())).not.toThrow();
    });

    it("a closed stream stops receiving", () => {
        const bus = new LiveBus();
        const phone = collect(bus, "user-1");

        phone.close();
        bus.publish("user-1", event());

        expect(phone.seen).toHaveLength(0);
    });

    it("a stream that ended mid-publish does not stop the others", () => {
        // A phone dropping off the network completes its subject at an arbitrary moment,
        // including between two deliveries of the same publish. The write it is reporting
        // has already committed, so anything that throws here would turn a successful
        // save into a reported failure.
        const bus = new LiveBus();
        const dying = bus.open("user-1");
        const healthy = collect(bus, "user-1");
        dying.events.subscribe({ next: () => undefined });
        dying.close();

        expect(() => bus.publish("user-1", event())).not.toThrow();
        expect(healthy.seen).toHaveLength(1);
    });
});

describe("LiveBus bookkeeping", () => {
    it("forgets a user once their last device disconnects", () => {
        // With a bucket left behind per user who has ever connected, the map only grows.
        const bus = new LiveBus();
        const phone = collect(bus, "user-1");
        const desktop = collect(bus, "user-1");

        expect(bus.stats()).toMatchObject({ users: 1, streams: 2 });

        phone.close();
        expect(bus.stats()).toMatchObject({ users: 1, streams: 1 });

        desktop.close();
        expect(bus.stats()).toMatchObject({ users: 0, streams: 0 });
    });

    it("closing the same stream twice does not corrupt the counts", () => {
        // Both `request.on("close")` and `response.on("close")` fire for one disconnect.
        const bus = new LiveBus();
        const phone = collect(bus, "user-1");
        const desktop = collect(bus, "user-1");

        phone.close();
        phone.close();

        expect(bus.stats()).toMatchObject({ users: 1, streams: 1 });
        bus.publish("user-1", event());
        expect(desktop.seen).toHaveLength(1);
    });

    it("ends every stream on shutdown so a redeploy can exit", () => {
        // An open SSE response is an unfinished request; the server will not close while
        // one exists, so a release would sit out the grace period and then be killed.
        const bus = new LiveBus();
        const phone = collect(bus, "user-1");
        const theirs = collect(bus, "user-2");
        let phoneCompleted = false;
        phone.subscription.add(() => {
            phoneCompleted = true;
        });

        bus.onApplicationShutdown();

        expect(phoneCompleted).toBe(true);
        expect(bus.stats()).toMatchObject({ users: 0, streams: 0 });
        expect(theirs.seen).toHaveLength(0);
    });
});

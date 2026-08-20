import { LiveBus, LiveEvent } from "./live.bus";

const event = (): LiveEvent => ({ name: "workout.changed", at: "2026-08-20T10:00:00.000Z" });

function collect(bus: LiveBus, userId: string) {
    const seen: LiveEvent[] = [];
    const stream = bus.open(userId);
    stream.events.subscribe((value) => seen.push(value));
    return { seen, ...stream };
}

/**
 * The watch registry is keyed by CONNECTION, not by person.
 *
 * A user is plural: LiveBus already keeps a Set of streams per user because devices are.
 * Keying a watch by user id meant a desktop opening the panel silently evicted the
 * phone's, and closing one idle tab tore down the other device's watch.
 */
describe("watch registry", () => {
    it("delivers only to the connections watching that session", () => {
        const bus = new LiveBus();
        const watcher = collect(bus, "anna");
        const bystander = collect(bus, "boris");
        bus.watch(watcher.token, "w1");

        bus.publishToWatchers("w1", event());

        expect(watcher.seen).toHaveLength(1);
        expect(bystander.seen).toHaveLength(0);
    });

    it("holds two devices of the SAME person watching different sessions", () => {
        const bus = new LiveBus();
        const phone = collect(bus, "anna");
        const laptop = collect(bus, "anna");
        bus.watch(phone.token, "w1");
        bus.watch(laptop.token, "w2");

        bus.publishToWatchers("w1", event());

        expect(phone.seen).toHaveLength(1);
        expect(laptop.seen).toHaveLength(0);
        expect(bus.stats().watching).toBe(2);
    });

    it("closing one device does not tear down the other's watch", () => {
        const bus = new LiveBus();
        const phone = collect(bus, "anna");
        const laptop = collect(bus, "anna");
        bus.watch(phone.token, "w1");
        bus.watch(laptop.token, "w1");

        laptop.close();
        bus.publishToWatchers("w1", event());

        expect(phone.seen).toHaveLength(1);
        expect(bus.stats().watching).toBe(1);
    });

    it("a connection watches one session at a time — re-registering moves it", () => {
        const bus = new LiveBus();
        const watcher = collect(bus, "anna");
        bus.watch(watcher.token, "w1");
        bus.watch(watcher.token, "w2");

        bus.publishToWatchers("w1", event());
        expect(watcher.seen).toHaveLength(0);

        bus.publishToWatchers("w2", event());
        expect(watcher.seen).toHaveLength(1);
        expect(bus.stats().watching).toBe(1);
    });

    it("closing the stream clears the watch, and does so idempotently", () => {
        // close() is wired to BOTH request and response, so it fires twice for one
        // disconnect - and it is the only hook that fires for a phone that simply stopped
        // being reachable.
        const bus = new LiveBus();
        const watcher = collect(bus, "anna");
        bus.watch(watcher.token, "w1");

        watcher.close();
        watcher.close();

        expect(bus.stats()).toMatchObject({ watching: 0, watched: 0, streams: 0 });
        expect(() => bus.publishToWatchers("w1", event())).not.toThrow();
    });

    it("dropWatchers ends every watch on a session at once", () => {
        // For when the session finishes, is deleted, or its owner withdraws access.
        const bus = new LiveBus();
        const one = collect(bus, "anna");
        const two = collect(bus, "boris");
        bus.watch(one.token, "w1");
        bus.watch(two.token, "w1");

        bus.dropWatchers("w1");
        bus.publishToWatchers("w1", event());

        expect(one.seen).toHaveLength(0);
        expect(two.seen).toHaveLength(0);
        expect(bus.stats()).toMatchObject({ watching: 0, watched: 0 });
    });

    it("leaves no empty buckets behind", () => {
        // Both counts are reported precisely so a leak is visible: connections still
        // registered against sessions nobody is connected to.
        const bus = new LiveBus();
        const watcher = collect(bus, "anna");
        bus.watch(watcher.token, "w1");
        bus.unwatch(watcher.token);
        expect(bus.stats()).toMatchObject({ watching: 0, watched: 0 });
    });

    it("rate-limits the fan-out, because each hint costs the WATCHER a full read", () => {
        // Every autosave announces - roughly one every 650ms for somebody typing a note.
        // Unthrottled, a watcher burns their own 200-requests-a-minute budget and their
        // OWN saves start coming back 429.
        const bus = new LiveBus();
        const watcher = collect(bus, "anna");
        bus.watch(watcher.token, "w1");

        for (let index = 0; index < 10; index += 1) {
            bus.publishToWatchers("w1", event());
        }

        expect(watcher.seen).toHaveLength(1);
    });

    it("forgets the rate-limit stamp when the last watcher leaves", () => {
        // Otherwise the map only ever grows, one entry per session ever watched.
        const bus = new LiveBus();
        const watcher = collect(bus, "anna");
        bus.watch(watcher.token, "w1");
        bus.publishToWatchers("w1", event());
        watcher.close();

        const fresh = collect(bus, "boris");
        bus.watch(fresh.token, "w1");
        bus.publishToWatchers("w1", event());

        expect(fresh.seen).toHaveLength(1);
    });

    it("registering an unknown token does nothing rather than growing the map", () => {
        const bus = new LiveBus();
        bus.watch("s999", "w1");
        expect(bus.stats()).toMatchObject({ watching: 0, watched: 0 });
    });
});

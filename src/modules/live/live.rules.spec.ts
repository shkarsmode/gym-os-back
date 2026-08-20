import { CHEER_BURST, CHEER_EMOJI, CHEER_MIN_GAP_MS, CHEER_WINDOW_MS, allowCheer, trimCheerHistory } from "./live.rules";

const now = 1_787_000_000_000;

describe("cheer rate limiting", () => {
    it("lets a first cheer through", () => {
        expect(allowCheer([], now)).toBe(true);
    });

    it("lets a burst through, because one lonely emoji is not encouragement", () => {
        // Tapping a few times in a row is the intended way to use this.
        let history: number[] = [];
        let sent = 0;
        for (let index = 0; index < CHEER_BURST; index += 1) {
            const at = now + index * (CHEER_MIN_GAP_MS + 10);
            if (allowCheer(history, at)) {
                sent += 1;
                history = [...trimCheerHistory(history, at), at];
            }
        }
        expect(sent).toBe(CHEER_BURST);
    });

    it("stops a burst once the bucket is empty", () => {
        const history = Array.from({ length: CHEER_BURST }, (_, index) => now - index * 400);
        expect(allowCheer(history, now + CHEER_MIN_GAP_MS + 1)).toBe(false);
    });

    it("refuses two in the same instant, so a held button is not a strobe", () => {
        expect(allowCheer([now], now + 10)).toBe(false);
    });

    it("refills once the window has passed", () => {
        const history = Array.from({ length: CHEER_BURST }, (_, index) => now - index * 400);
        expect(allowCheer(history, now + CHEER_WINDOW_MS + 1)).toBe(true);
    });

    it("forgets timestamps older than the window rather than growing forever", () => {
        const history = [now - CHEER_WINDOW_MS - 5000, now - 100];
        expect(trimCheerHistory(history, now)).toEqual([now - 100]);
    });
});

describe("cheer vocabulary", () => {
    it("is a closed set", () => {
        // This string is rendered into someone else's screen. An open field there is an
        // invitation to send something other than encouragement.
        expect(CHEER_EMOJI.length).toBeGreaterThan(0);
        expect(CHEER_EMOJI).toContain("💪");
        expect(CHEER_EMOJI.every((item) => typeof item === "string" && item.length <= 4)).toBe(true);
    });
});

import { isCheerable, presenceState } from "./live.rules";

describe("presence state", () => {
    it("is training only once a set has actually been ticked", () => {
        expect(presenceState("active", new Date())).toBe("training");
    });

    it("is warmup for a session opened but not started", () => {
        // Arrived at the gym, nothing lifted yet — the moment a nudge lands best, and
        // the one where a running clock would be inventing a number.
        expect(presenceState("active", null)).toBe("warmup");
    });

    it("is planned for a session that has not been opened", () => {
        expect(presenceState("planned", null)).toBe("planned");
    });
});

describe("who can be cheered", () => {
    const today = new Date("2026-08-20T18:00:00");

    it("anyone with a session running", () => {
        expect(isCheerable("active", new Date("2026-08-20T00:00:00"), today)).toBe(true);
    });

    it("anyone who planned one for today", () => {
        expect(isCheerable("planned", new Date("2026-08-20T00:00:00"), today)).toBe(true);
    });

    it("but not one planned for another day", () => {
        // A session in next Tuesday's calendar is not somebody to encourage right now.
        expect(isCheerable("planned", new Date("2026-08-25T00:00:00"), today)).toBe(false);
        expect(isCheerable("planned", new Date("2026-08-19T00:00:00"), today)).toBe(false);
    });

    it("and not a finished one — the feed has reactions for those", () => {
        expect(isCheerable("completed", new Date("2026-08-20T00:00:00"), today)).toBe(false);
    });
});

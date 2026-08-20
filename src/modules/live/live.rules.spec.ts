import { CHEER_COOLDOWN_MS, CHEER_EMOJI, cheerCooldown } from "./live.rules";

describe("cheer cooldown", () => {
    const now = 1_787_000_000_000;

    it("lets a first cheer through", () => {
        expect(cheerCooldown(undefined, now)).toBe(true);
    });

    it("slows one person holding the button down", () => {
        // The recipient is mid-set with the phone on a bench; an unthrottled tap turns
        // into a strobe on a device they cannot put down.
        expect(cheerCooldown(now - 100, now)).toBe(false);
        expect(cheerCooldown(now - (CHEER_COOLDOWN_MS - 1), now)).toBe(false);
    });

    it("lets the same person through again once the wait has passed", () => {
        expect(cheerCooldown(now - CHEER_COOLDOWN_MS, now)).toBe(true);
        expect(cheerCooldown(now - 60_000, now)).toBe(true);
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

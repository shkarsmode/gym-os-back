import { canRequest, cooldownAfterReject, cooldownUntil, isBlocked, ownerMayTransition, viewerFacingStatus, BLOCK_UNTIL } from "./access.rules";

const now = new Date("2026-08-20T12:00:00.000Z");

describe("cooldown after a refusal", () => {
    it("costs a day the first time", () => {
        // The count is the value AFTER the rejection is recorded. Passing the pre-write
        // count shifts every step by one and makes a first refusal cost a month.
        expect(cooldownAfterReject(1)).toBe(1);
    });

    it("escalates, because asking again after being told no is the thing being stopped", () => {
        expect(cooldownAfterReject(2)).toBe(7);
        expect(cooldownAfterReject(3)).toBe(30);
    });

    it("stops escalating rather than running off the end of the ladder", () => {
        expect(cooldownAfterReject(9)).toBe(30);
        expect(cooldownAfterReject(0)).toBe(1);
    });

    it("produces a real date", () => {
        expect(cooldownUntil(1, now).toISOString()).toBe("2026-08-21T12:00:00.000Z");
    });
});

describe("blocking", () => {
    it("is a rejection with an absurdly distant cooldown, not a fourth status", () => {
        // The read path compares against "accepted" and nothing else; a fourth status is
        // a fourth branch some future query can forget.
        expect(isBlocked(BLOCK_UNTIL)).toBe(true);
    });

    it("is told apart from an ordinary wait", () => {
        expect(isBlocked(cooldownUntil(3, now))).toBe(false);
        expect(isBlocked(null)).toBe(false);
    });
});

describe("who may ask", () => {
    it("anyone with no history", () => {
        expect(canRequest(null, now)).toEqual({ allowed: true });
    });

    it("not twice while one is outstanding", () => {
        expect(canRequest({ status: "pending" }, now)).toEqual({ allowed: false, reason: "already_pending" });
    });

    it("not when they already have access", () => {
        expect(canRequest({ status: "accepted" }, now)).toEqual({ allowed: false, reason: "already_accepted" });
    });

    it("not while cooling down after a refusal", () => {
        const grant = { status: "rejected", cooldownUntil: new Date("2026-08-21T12:00:00.000Z") };
        expect(canRequest(grant, now)).toEqual({ allowed: false, reason: "cooling_down" });
    });

    it("again once the cooldown has passed", () => {
        const grant = { status: "rejected", cooldownUntil: new Date("2026-08-19T12:00:00.000Z") };
        expect(canRequest(grant, now)).toEqual({ allowed: true });
    });

    it("never, once blocked", () => {
        expect(canRequest({ status: "rejected", cooldownUntil: BLOCK_UNTIL }, now))
            .toEqual({ allowed: false, reason: "cooling_down" });
    });

    it("and the refusal never says how emphatic the no was", () => {
        // A viewer who can read the exact expiry subtracts it and learns both the
        // decision and its severity - including that they were blocked, which is exactly
        // what a block should not announce.
        const verdict = canRequest({ status: "rejected", cooldownUntil: BLOCK_UNTIL, rejectedCount: 3 }, now);
        expect(Object.keys(verdict)).toEqual(["allowed", "reason"]);
        expect(JSON.stringify(verdict)).not.toContain("9999");
    });
});

describe("what the requester is told", () => {
    it("reports a rejection as still pending", () => {
        // Telling somebody in a small gym that a named person declined them turns a quiet
        // setting into a social event - which is what the owner chose privacy to avoid.
        expect(viewerFacingStatus({ status: "rejected" })).toBe("pending");
        expect(viewerFacingStatus({ status: "pending" })).toBe("pending");
    });

    it("reports access plainly once it is granted", () => {
        expect(viewerFacingStatus({ status: "accepted" })).toBe("accepted");
    });

    it("reports nothing when there is no history", () => {
        expect(viewerFacingStatus(null)).toBe("none");
    });
});

describe("owner transitions", () => {
    it("accepts only something outstanding", () => {
        expect(ownerMayTransition("pending", "accepted")).toBe(true);
        expect(ownerMayTransition("rejected", "accepted")).toBe(false);
        expect(ownerMayTransition("accepted", "accepted")).toBe(false);
    });

    it("rejects a request, and revokes access that was granted", () => {
        expect(ownerMayTransition("pending", "rejected")).toBe(true);
        expect(ownerMayTransition("accepted", "rejected")).toBe(true);
        expect(ownerMayTransition("accepted", "revoked")).toBe(true);
        expect(ownerMayTransition("pending", "revoked")).toBe(false);
    });
});

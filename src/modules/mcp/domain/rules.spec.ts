import { McpToolError, assertNotPast, effectiveStatus, isIsoDate, todayIn, weekdayName } from "./rules";

const work = (done: boolean) => [{ sets: [{ isCompleted: done }] }];

describe("MCP rules: today in Kyiv", () => {
    it("rolls over at Kyiv midnight, not UTC midnight", () => {
        expect(todayIn("Europe/Kyiv", new Date("2026-11-25T21:59:00Z"))).toBe("2026-11-25");
        expect(todayIn("Europe/Kyiv", new Date("2026-11-25T22:30:00Z"))).toBe("2026-11-26");
        expect(todayIn("Europe/Kiev", new Date("2026-11-25T22:30:00Z"))).toBe("2026-11-26");
    });

    it("follows summer time", () => {
        expect(todayIn("Europe/Kyiv", new Date("2026-07-20T21:30:00Z"))).toBe("2026-07-21");
        expect(todayIn("Europe/Kyiv", new Date("2026-07-20T20:30:00Z"))).toBe("2026-07-20");
    });
});

describe("MCP rules: dates", () => {
    it("accepts only real calendar dates", () => {
        expect(isIsoDate("2026-11-25")).toBe(true);
        expect(isIsoDate("2026-02-30")).toBe(false);
        expect(isIsoDate("2026-11-25T10:00:00Z")).toBe(false);
        expect(isIsoDate("25.11.2026")).toBe(false);
    });

    it("names the weekday of a calendar date", () => {
        expect(weekdayName("2026-11-25")).toBe("Wed");
    });

    it("refuses a planned workout in the past but allows today", () => {
        expect(() => assertNotPast("2026-11-24", "2026-11-25", "Europe/Kyiv")).toThrow(McpToolError);
        expect(() => assertNotPast("2026-11-25", "2026-11-25", "Europe/Kyiv")).not.toThrow();
    });
});

describe("MCP rules: effective status matches the app", () => {
    const today = "2026-11-25";

    it("keeps completed and future rows as stored", () => {
        expect(effectiveStatus({ status: "completed", date: "2026-11-20", exercises: work(false), cardioCount: 0 }, today)).toBe("completed");
        expect(effectiveStatus({ status: "planned", date: "2026-11-26", exercises: work(false), cardioCount: 0 }, today)).toBe("planned");
        expect(effectiveStatus({ status: "active", date: today, exercises: work(true), cardioCount: 0 }, today)).toBe("active");
    });

    it("calls a past plan with nothing logged missed", () => {
        expect(effectiveStatus({ status: "planned", date: "2026-11-24", exercises: work(false), cardioCount: 0 }, today)).toBe("missed");
        expect(effectiveStatus({ status: "active", date: "2026-11-24", exercises: [], cardioCount: 0 }, today)).toBe("missed");
    });

    it("calls a past row with logged work completed", () => {
        expect(effectiveStatus({ status: "planned", date: "2026-11-24", exercises: work(true), cardioCount: 0 }, today)).toBe("completed");
        expect(effectiveStatus({ status: "active", date: "2026-11-24", exercises: [], cardioCount: 1 }, today)).toBe("completed");
    });
});

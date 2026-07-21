import { cursorFilter, decodeCursor, encodeCursor } from "./cursor";

/**
 * Pagination bugs do not announce themselves. A user finds a workout missing from
 * their history, or the same session listed twice, and reports it as "the app is
 * weird" months later. These tests exist for the two failures that actually happen.
 */
describe("workout cursors", () => {
    const row = { date: new Date("2026-07-18T17:30:00.000Z"), id: "ckx01" };

    describe("round trip", () => {
        it("survives encode/decode with full instant precision", () => {
            const decoded = decodeCursor(encodeCursor(row));
            expect(decoded).toEqual({ d: "2026-07-18T17:30:00.000Z", i: "ckx01" });
        });

        it("keeps the time of day, not just the date", () => {
            // The bug this guards: encoding "2026-07-18" instead of the instant. A row
            // stored at 17:30 would then fail the equal-instant branch and be re-matched
            // by the earlier-instant branch, appearing on two consecutive pages.
            const decoded = decodeCursor(encodeCursor(row));
            expect(decoded!.d).not.toBe("2026-07-18");
            expect(decoded!.d).toContain("17:30");
        });

        it("is opaque — no readable field names leak to the client", () => {
            expect(encodeCursor(row)).not.toContain("date");
            expect(encodeCursor(row)).not.toContain("ckx01");
        });
    });

    describe("decoding refuses to throw", () => {
        // A stale or hand-edited cursor must restart the list. The client can recover
        // from an empty cursor; it cannot recover from a 500 mid-scroll.
        it.each([
            ["undefined", undefined],
            ["null", null],
            ["an empty string", ""],
            ["a number", 42],
            ["not base64", "!!!!"],
            ["base64 of non-JSON", Buffer.from("hello", "utf8").toString("base64url")],
            ["JSON missing the id", Buffer.from(JSON.stringify({ d: "2026-07-18T00:00:00Z" }), "utf8").toString("base64url")],
            ["JSON missing the date", Buffer.from(JSON.stringify({ i: "ckx01" }), "utf8").toString("base64url")],
            ["an unparseable date", Buffer.from(JSON.stringify({ d: "not-a-date", i: "ckx01" }), "utf8").toString("base64url")]
        ])("returns null for %s", (_label, value) => {
            expect(decodeCursor(value)).toBeNull();
        });
    });

    describe("the filter", () => {
        it("is empty for the first page", () => {
            expect(cursorFilter(null)).toEqual({});
        });

        it("has BOTH branches — earlier instants and ties on the same instant", () => {
            // One branch alone is the bug. Only `date < cursor` drops every remaining
            // workout that shares the boundary instant; only the tie branch never
            // advances past that instant at all.
            const filter = cursorFilter(decodeCursor(encodeCursor(row))) as { OR: unknown[] };
            expect(filter.OR).toHaveLength(2);
            expect(filter.OR[0]).toEqual({ date: { lt: row.date } });
            expect(filter.OR[1]).toEqual({ date: row.date, id: { lt: "ckx01" } });
        });

        it("excludes the cursor row itself so it cannot repeat", () => {
            const filter = cursorFilter(decodeCursor(encodeCursor(row))) as { OR: Array<{ date: unknown; id?: { lt: string } }> };
            // Strictly less-than on both branches: the row the cursor names was the last
            // item of the previous page and must not lead the next one.
            expect(filter.OR[1].id).toEqual({ lt: "ckx01" });
        });
    });

    describe("same-instant paging — the case a date-only cursor breaks", () => {
        // Two workouts logged at the same stored instant, distinguished only by id.
        const morning = { date: new Date("2026-07-10T00:00:00.000Z"), id: "ckx_b" };
        const evening = { date: new Date("2026-07-10T00:00:00.000Z"), id: "ckx_a" };

        it("a cursor on the first still selects the second", () => {
            const filter = cursorFilter(decodeCursor(encodeCursor(morning))) as { OR: Array<{ date: Date; id?: { lt: string } }> };
            const tie = filter.OR[1];
            // Descending by id, so "ckx_a" sorts after "ckx_b" and must be included.
            expect(tie.date.getTime()).toBe(morning.date.getTime());
            expect(evening.id < tie.id!.lt).toBe(true);
        });
    });
});

import {
    FeedRow,
    REACTABLE_TYPES,
    decodeFeedCursor,
    encodeFeedCursor,
    keysetWhere,
    mergeFeedRows,
    timelineAt,
    workoutFeedPayload
} from "./feed.timeline";

/**
 * The ordering and paging rules behind Стрічка.
 *
 * Every failure locked down here shipped to users: a July session sitting between two
 * August ones, a finished workout that never appeared at all, rows silently skipped at
 * a page boundary, and cards claiming "0 підходів" for a real session. None of them
 * throws — they just quietly show the wrong feed — so the tests are the only alarm.
 */

const at = (iso: string) => new Date(iso);

function workoutRow(id: string, date: string, clock: string): FeedRow {
    return {
        id,
        type: "workout",
        userId: "user-1",
        createdAt: timelineAt(at(date), at(clock)),
        payload: {}
    };
}

/** Ids of the page, in the order the client will render them. */
function order(rows: FeedRow[], take = 10): string[] {
    return mergeFeedRows(rows, take).page.map((row) => row.id);
}

describe("timelineAt — a session sits on the day it was TRAINED", () => {
    it("puts a retroactively entered July session below an August one", () => {
        // The original bug: ordering by finishedAt. This July session was typed in on
        // 14 August, so it led the feed ahead of a session actually trained on the 12th.
        const july = workoutRow("w_july", "2026-07-14T00:00:00.000Z", "2026-08-14T20:15:00.000Z");
        const august = workoutRow("w_august", "2026-08-12T00:00:00.000Z", "2026-08-12T19:00:00.000Z");

        expect(order([july, august])).toEqual(["w_august", "w_july"]);
    });

    it("keeps a session dated the 19th above one dated the 17th, even though it was finished on the 17th", () => {
        // The mirror image: a session planned ahead and closed early. The date owns the
        // position; the finish clock must not drag it back two days.
        const nineteenth = workoutRow("w_19", "2026-08-19T00:00:00.000Z", "2026-08-17T08:00:00.000Z");
        const seventeenth = workoutRow("w_17", "2026-08-17T00:00:00.000Z", "2026-08-17T21:40:00.000Z");

        expect(order([nineteenth, seventeenth])).toEqual(["w_19", "w_17"]);
    });

    it("orders a whole week by training day, not by the order the rows were saved", () => {
        // The reported symptom was a Wednesday session seven rows below a Tuesday one,
        // because the Wednesday workout had been created on Monday.
        const rows = [
            workoutRow("mon", "2026-08-17T00:00:00.000Z", "2026-08-17T18:00:00.000Z"),
            workoutRow("wed", "2026-08-19T00:00:00.000Z", "2026-08-17T09:05:00.000Z"),
            workoutRow("tue", "2026-08-18T00:00:00.000Z", "2026-08-20T11:00:00.000Z")
        ];

        expect(order(rows)).toEqual(["wed", "tue", "mon"]);
    });

    it("keeps the finish time of day so two sessions on the same date order by when they ended", () => {
        // Within one day the clock is the only signal left; losing it would make the
        // morning session outrank the evening one on an arbitrary id comparison.
        const morning = workoutRow("w_morning", "2026-08-18T00:00:00.000Z", "2026-08-18T07:30:00.000Z");
        const evening = workoutRow("w_evening", "2026-08-18T00:00:00.000Z", "2026-08-18T20:45:00.000Z");

        expect(order([morning, evening])).toEqual(["w_evening", "w_morning"]);
        expect(timelineAt(at("2026-08-18T00:00:00.000Z"), at("2026-08-18T20:45:30.250Z")).toISOString())
            .toBe("2026-08-18T20:45:30.250Z");
    });

    it("takes only the clock from the second argument and only the date from the first", () => {
        const position = timelineAt(at("2026-07-14T00:00:00.000Z"), at("2026-08-14T20:15:09.123Z"));
        expect(position.toISOString()).toBe("2026-07-14T20:15:09.123Z");
    });

    it("does not mutate the Date it was handed", () => {
        // The date object comes straight off a Prisma row and is reused for the card's
        // own `date` field — writing the finish clock into it would corrupt the payload.
        const date = at("2026-07-14T00:00:00.000Z");
        timelineAt(date, at("2026-08-14T20:15:00.000Z"));
        expect(date.toISOString()).toBe("2026-07-14T00:00:00.000Z");
    });

    it("places a completed session with no finishedAt using the fallback clock", () => {
        // A workout saved as completed but with finishedAt = NULL used to be filtered out
        // of the feed forever. The service falls back to updatedAt; the position must
        // still land on the session's own date.
        const noFinishTimestamp = workoutRow("w_nofinish", "2026-08-18T00:00:00.000Z", "2026-08-20T13:00:00.000Z");
        const later = workoutRow("w_later", "2026-08-19T00:00:00.000Z", "2026-08-19T10:00:00.000Z");

        expect(noFinishTimestamp.createdAt.toISOString()).toBe("2026-08-18T13:00:00.000Z");
        expect(order([later, noFinishTimestamp])).toEqual(["w_later", "w_nofinish"]);
    });
});

describe("mergeFeedRows", () => {
    const rows: FeedRow[] = [
        { id: "a", type: "workout", userId: "u1", createdAt: at("2026-08-19T10:00:00.000Z"), payload: {} },
        { id: "b", type: "record", userId: "u2", createdAt: at("2026-08-18T10:00:00.000Z"), payload: {} },
        { id: "c", type: "achievement", userId: "u3", createdAt: at("2026-08-17T10:00:00.000Z"), payload: {} }
    ];

    it("returns newest first across all three sources", () => {
        expect(order([...rows].reverse())).toEqual(["a", "b", "c"]);
    });

    it("respects the page size", () => {
        expect(mergeFeedRows(rows, 2).page.map((row) => row.id)).toEqual(["a", "b"]);
    });

    it("has no nextCursor on the last page", () => {
        // Each source is asked for take + 1, so "exactly take rows" means the feed ended.
        // A cursor here would make the client fetch forever and never show the end.
        expect(mergeFeedRows(rows, 3).nextCursor).toBeNull();
        expect(mergeFeedRows(rows, 10).nextCursor).toBeNull();
    });

    it("mints a nextCursor pointing at the last row of the page when more rows exist", () => {
        const { nextCursor } = mergeFeedRows(rows, 2);
        expect(nextCursor).not.toBeNull();
        expect(decodeFeedCursor(nextCursor!)).toEqual({
            at: at("2026-08-18T10:00:00.000Z"),
            type: "record",
            id: "b"
        });
    });

    it("breaks ties on the instant by id descending, matching the sources' ORDER BY", () => {
        // Achievement unlock dates are computed deterministically, so a batch of them
        // really does share one instant. If this sort disagreed with the SQL's
        // `ORDER BY ..., id DESC`, the cursor would name a boundary the sources reject.
        const instant = at("2026-08-19T00:00:00.000Z");
        const tied: FeedRow[] = [
            { id: "ach_a", type: "achievement", userId: "u1", createdAt: instant, payload: {} },
            { id: "ach_c", type: "achievement", userId: "u1", createdAt: instant, payload: {} },
            { id: "ach_b", type: "achievement", userId: "u1", createdAt: instant, payload: {} }
        ];

        expect(order(tied)).toEqual(["ach_c", "ach_b", "ach_a"]);
    });

    it("leaves the caller's array untouched", () => {
        const source = [...rows].reverse();
        mergeFeedRows(source, 2);
        expect(source.map((row) => row.id)).toEqual(["c", "b", "a"]);
    });

    it("returns an empty page and no cursor when nothing matched", () => {
        expect(mergeFeedRows([], 10)).toEqual({ page: [], nextCursor: null });
    });
});

describe("feed cursors", () => {
    const position = { at: at("2026-08-18T10:00:00.000Z"), type: "workout", id: "ckx01" };

    it("round-trips at, type and id", () => {
        // Losing type or id downgrades the cursor to a bare timestamp — which is exactly
        // the bug that skipped every item tied on the boundary instant.
        expect(decodeFeedCursor(encodeFeedCursor(position))).toEqual(position);
    });

    it("keeps millisecond precision on the boundary instant", () => {
        const precise = { at: at("2026-08-18T10:00:00.123Z"), type: "record", id: "ckx02" };
        expect(decodeFeedCursor(encodeFeedCursor(precise))!.at.toISOString()).toBe("2026-08-18T10:00:00.123Z");
    });

    describe("decoding refuses to throw", () => {
        // The client can restart the list from an empty cursor; it cannot recover from a
        // 500 in the middle of an infinite scroll.
        it.each([
            ["undefined", undefined],
            ["an empty string", ""],
            ["garbage", "!!!not a cursor!!!"],
            ["valid base64 that is not JSON", Buffer.from("hello there", "utf8").toString("base64url")],
            ["JSON that is not an object", Buffer.from("12", "utf8").toString("base64url")],
            ["a payload with no t at all", Buffer.from(JSON.stringify({ y: "workout", i: "ckx01" }), "utf8").toString("base64url")],
            ["a payload whose t is not a date", Buffer.from(JSON.stringify({ t: "yesterday", y: "workout", i: "ckx01" }), "utf8").toString("base64url")]
        ])("returns null for %s", (_label, value) => {
            expect(decodeFeedCursor(value as string | undefined)).toBeNull();
        });

        it("never throws on a hand-edited cursor whose t is a non-string JSON value", () => {
            // `new Date(null)` is the epoch, not an invalid date, so this one decodes to
            // a position in 1970 instead of null. Harmless — the page comes back empty
            // rather than 500 — but the contract worth locking is only "does not throw".
            const nullTimestamp = Buffer.from(JSON.stringify({ t: null }), "utf8").toString("base64url");
            expect(() => decodeFeedCursor(nullTimestamp)).not.toThrow();
        });
    });

    it("accepts a legacy cursor minted before the keyset upgrade", () => {
        // Cursors already held by open clients carry only { t }. They must keep paging —
        // with the old strict-timestamp behaviour for one page — instead of erroring.
        const legacy = Buffer.from(JSON.stringify({ t: "2026-08-18T10:00:00.000Z" }), "utf8").toString("base64url");
        expect(decodeFeedCursor(legacy)).toEqual({ at: at("2026-08-18T10:00:00.000Z"), type: "", id: "" });
    });

    it("ignores non-string type/id rather than passing them into the SQL comparison", () => {
        const hostile = Buffer.from(
            JSON.stringify({ t: "2026-08-18T10:00:00.000Z", y: { $ne: null }, i: 7 }),
            "utf8"
        ).toString("base64url");
        expect(decodeFeedCursor(hostile)).toEqual({ at: at("2026-08-18T10:00:00.000Z"), type: "", id: "" });
    });

    it("is opaque — no readable field names or ids leak to the client", () => {
        const encoded = encodeFeedCursor(position);
        expect(encoded).not.toContain("ckx01");
        expect(encoded).not.toContain("workout");
    });
});

describe("keysetWhere", () => {
    const boundary = { at: at("2026-08-18T10:00:00.000Z"), type: "achievement", id: "ach_b" };

    it("emits the row-wise OR form for the source that minted the cursor", () => {
        // FeedService hands this straight to Prisma, so the shape is the contract.
        // Without the second branch, every achievement sharing the boundary instant is
        // skipped and never appears on any page.
        expect(keysetWhere("unlockedAt", boundary, "achievement")).toEqual({
            OR: [
                { unlockedAt: { lt: boundary.at } },
                { unlockedAt: boundary.at, id: { lt: "ach_b" } }
            ]
        });
    });

    it("degrades to a plain lt for a different source — ids are not comparable across tables", () => {
        // A PersonalRecord id and a UserAchievement id say nothing about each other, so
        // the tiebreak would compare noise. The other sources give up their tied rows
        // for one page rather than dropping or duplicating them arbitrarily.
        expect(keysetWhere("recordedAt", boundary, "record")).toEqual({
            recordedAt: { lt: boundary.at }
        });
    });

    it("degrades to a plain lt for a legacy cursor that carries no id", () => {
        const legacy = { at: at("2026-08-18T10:00:00.000Z"), type: "", id: "" };
        expect(keysetWhere("unlockedAt", legacy, "achievement")).toEqual({ unlockedAt: { lt: legacy.at } });
    });

    it("excludes the cursor row itself on both branches so the last item cannot repeat", () => {
        const where = keysetWhere("recordedAt", { ...boundary, type: "record" }, "record") as {
            OR: Array<{ recordedAt: unknown; id?: { lt: string } }>;
        };
        expect(where.OR[0]).toEqual({ recordedAt: { lt: boundary.at } });
        expect(where.OR[1].id).toEqual({ lt: "ach_b" });
    });
});

describe("workoutFeedPayload", () => {
    const set = (weight: unknown, repetitions: number, isCompleted = true) => ({ weight, repetitions, isCompleted });

    const workout = {
        title: "Груди і трицепс",
        workoutType: "strength",
        date: at("2026-08-18T00:00:00.000Z"),
        durationOverride: null,
        startedAt: at("2026-08-18T18:00:00.000Z"),
        finishedAt: at("2026-08-18T19:12:00.000Z"),
        exercises: [
            { exercise: { name: "Жим лежачи" }, sets: [set(60, 10), set(70, 8)] },
            { exercise: { name: "Розведення гантелей" }, sets: [set(12, 12)] }
        ],
        cardioSessions: [] as Array<{ durationMinutes: number | null }>
    };

    it("reports the real numbers for a workout whose sets are all completed", () => {
        // The invariant since the fix: finishing a workout marks every set completed.
        // A card that still said "0 підходів" for a session with visible exercises was
        // the user-facing symptom of that invariant being broken.
        const payload = workoutFeedPayload(workout);
        expect(payload.setCount).toBe(3);
        expect(payload.exerciseCount).toBe(2);
        expect(payload.volumeKg).toBe(60 * 10 + 70 * 8 + 12 * 12);
        expect(payload.exercises).toEqual([
            { name: "Жим лежачи", sets: 2 },
            { name: "Розведення гантелей", sets: 1 }
        ]);
    });

    it("carries the session's own date and title through unchanged", () => {
        const payload = workoutFeedPayload(workout);
        expect(payload.title).toBe("Груди і трицепс");
        expect(payload.date).toEqual(at("2026-08-18T00:00:00.000Z"));
    });

    it("counts only completed sets, so a stray unfinished set under-reports instead of inventing volume", () => {
        const payload = workoutFeedPayload({
            ...workout,
            exercises: [{ exercise: { name: "Жим лежачи" }, sets: [set(60, 10), set(80, 8, false)] }]
        });
        expect(payload.setCount).toBe(1);
        expect(payload.volumeKg).toBe(600);
        expect(payload.exercises).toEqual([{ name: "Жим лежачи", sets: 1 }]);
    });

    it("still lists an exercise whose sets are all unfinished, with a zero chip", () => {
        // exerciseCount comes from the exercises themselves — the card must not pretend
        // the exercise was never there.
        const payload = workoutFeedPayload({
            ...workout,
            exercises: [{ exercise: { name: "Присідання" }, sets: [set(100, 5, false)] }]
        });
        expect(payload.exerciseCount).toBe(1);
        expect(payload.exercises).toEqual([{ name: "Присідання", sets: 0 }]);
    });

    it("handles Prisma decimal weights arriving as strings", () => {
        const payload = workoutFeedPayload({
            ...workout,
            exercises: [{ exercise: { name: "Жим лежачи" }, sets: [set("62.5", 8)] }]
        });
        expect(payload.volumeKg).toBe(500);
    });

    it("rounds volume to one decimal so cards never show a float tail", () => {
        const payload = workoutFeedPayload({
            ...workout,
            exercises: [{ exercise: { name: "Тяга" }, sets: [set(0.1, 3), set(0.2, 1)] }]
        });
        expect(payload.volumeKg).toBe(0.5);
    });

    it("caps the exercise preview at four entries", () => {
        // The card renders this inline; the full breakdown belongs to the detail view.
        const payload = workoutFeedPayload({
            ...workout,
            exercises: ["a", "b", "c", "d", "e", "f"].map((name) => ({ exercise: { name }, sets: [set(10, 10)] }))
        });
        expect(payload.exercises).toHaveLength(4);
        expect((payload.exercises as Array<{ name: string }>).map((item) => item.name)).toEqual(["a", "b", "c", "d"]);
        // The count itself is not capped — it still reports the whole session.
        expect(payload.exerciseCount).toBe(6);
    });

    it.each([
        ["a null exercise relation", { exercise: null, sets: [] }],
        ["a missing exercise relation", { sets: [] }],
        ["an empty name", { exercise: { name: "" }, sets: [] }],
        ["a null name", { exercise: { name: null }, sets: [] }]
    ])("falls back to \"Вправа\" for %s", (_label, entry) => {
        const payload = workoutFeedPayload({ ...workout, exercises: [entry] });
        expect(payload.exercises).toEqual([{ name: "Вправа", sets: 0 }]);
    });

    describe("durationMinutes", () => {
        it("prefers the manual override the user typed", () => {
            expect(workoutFeedPayload({ ...workout, durationOverride: 45 }).durationMinutes).toBe(45);
        });

        it("derives from startedAt/finishedAt when there is no override", () => {
            expect(workoutFeedPayload(workout).durationMinutes).toBe(72);
        });

        it("is null rather than 0 when the session has no timestamps to derive from", () => {
            // A card renders the duration chip only when this is non-null; a 0 would
            // print "0 хв" for a session whose length is simply unknown.
            expect(workoutFeedPayload({ ...workout, startedAt: null, finishedAt: null }).durationMinutes).toBeNull();
            expect(workoutFeedPayload({ ...workout, finishedAt: null }).durationMinutes).toBeNull();
            expect(workoutFeedPayload({ ...workout, startedAt: null }).durationMinutes).toBeNull();
        });
    });

    describe("cardioMinutes", () => {
        it("sums every cardio session", () => {
            const payload = workoutFeedPayload({
                ...workout,
                cardioSessions: [{ durationMinutes: 20 }, { durationMinutes: 15 }]
            });
            expect(payload.cardioMinutes).toBe(35);
        });

        it("tolerates a cardio session with no duration recorded", () => {
            // durationMinutes is nullable in the schema; a null must count as zero, not
            // turn the whole card's cardio total into NaN.
            const payload = workoutFeedPayload({
                ...workout,
                cardioSessions: [{ durationMinutes: null }, { durationMinutes: 20 }]
            });
            expect(payload.cardioMinutes).toBe(20);
        });

        it("is 0 for a pure strength session", () => {
            expect(workoutFeedPayload(workout).cardioMinutes).toBe(0);
        });
    });

    it("reports zeroes for a session with no exercises at all", () => {
        const payload = workoutFeedPayload({ ...workout, exercises: [] });
        expect(payload.exerciseCount).toBe(0);
        expect(payload.setCount).toBe(0);
        expect(payload.volumeKg).toBe(0);
        expect(payload.exercises).toEqual([]);
    });
});

describe("REACTABLE_TYPES", () => {
    it("covers every type the feed can render, plus comments", () => {
        expect([...REACTABLE_TYPES].sort()).toEqual(["achievement", "comment", "record", "workout"]);
    });

    it("rejects anything else, so a reaction cannot be attached to an arbitrary target", () => {
        // targetType/targetId are polymorphic and unvalidated by the database — without
        // this gate a client could create reaction rows pointing at users or nothing.
        expect(REACTABLE_TYPES.has("user")).toBe(false);
        expect(REACTABLE_TYPES.has("Workout")).toBe(false);
        expect(REACTABLE_TYPES.has("")).toBe(false);
    });
});

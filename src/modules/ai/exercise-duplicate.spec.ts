import { CatalogEntry, rankCandidates, ScoredCandidate, scoreEntry } from "./exercise-match";
import { DUPLICATE_LOCAL_ONLY_FLOOR, DUPLICATE_MAX_MATCHES, DUPLICATE_MAX_REASON_LENGTH } from "./ai.constants";
import { localOnlyMatches, normalizeDuplicateMatches } from "./exercise-duplicate";

function entry(id: string, name: string): CatalogEntry {
    return { id, name, aliases: [], primaryMuscleGroup: "", equipment: "", mediaUrl: "" };
}

function candidate(id: string, name: string, score: number): ScoredCandidate {
    return { entry: entry(id, name), score };
}

const LEG_EXTENSION = "Розгинання ніг в тренажері";
const LEG_CURL = "Згинання ніг в тренажері";
const T_BAR_ROW_BENT = "Тяга Т-грифа в нахилі";
const T_BAR_ROW = "Тяга Т-грифа";

describe("normalizeDuplicateMatches", () => {
    it("drops an id that was never in the candidate set", () => {
        const candidates = [candidate("real-1", T_BAR_ROW, 0.81)];
        const raw = {
            matches: [
                { id: "hallucinated-9", verdict: "same", confidence: 0.99, reason: "Вигадана вправа" },
                { id: "real-1", verdict: "same", confidence: 0.8, reason: "Той самий рух" }
            ]
        };

        const judged = normalizeDuplicateMatches(raw, candidates);

        expect(judged).toHaveLength(1);
        expect(judged[0].id).toBe("real-1");
        expect(judged.some((match) => match.id === "hallucinated-9")).toBe(false);
    });

    it("drops the verdict 'different' and anything that is not a known verdict", () => {
        const candidates = [
            candidate("a", LEG_CURL, 0.92),
            candidate("b", T_BAR_ROW, 0.81),
            candidate("c", "Присідання зі штангою", 0.5)
        ];
        const raw = {
            matches: [
                { id: "a", verdict: "different", confidence: 0.95, reason: "Протилежний рух" },
                { id: "b", verdict: "same", confidence: 0.9, reason: "Та сама тяга" },
                { id: "c", verdict: "maybe", confidence: 0.7, reason: "Незрозумілий вердикт" }
            ]
        };

        const judged = normalizeDuplicateMatches(raw, candidates);

        expect(judged.map((match) => match.id)).toEqual(["b"]);
    });

    it("puts every 'same' before every 'similar', regardless of confidence", () => {
        const candidates = [candidate("a", T_BAR_ROW, 0.81), candidate("b", LEG_CURL, 0.92)];
        const raw = {
            matches: [
                { id: "b", verdict: "similar", confidence: 0.99, reason: "Схожа" },
                { id: "a", verdict: "same", confidence: 0.5, reason: "Та сама" }
            ]
        };

        const judged = normalizeDuplicateMatches(raw, candidates);

        expect(judged.map((match) => match.id)).toEqual(["a", "b"]);
        expect(judged[0].verdict).toBe("same");
    });

    it("sorts a null confidence last inside its verdict", () => {
        const candidates = [candidate("a", "A", 0.9), candidate("b", "B", 0.8), candidate("c", "C", 0.7)];
        const raw = {
            matches: [
                { id: "a", verdict: "similar", confidence: null, reason: "" },
                { id: "b", verdict: "similar", confidence: 0.4, reason: "" },
                { id: "c", verdict: "similar", confidence: 0.9, reason: "" }
            ]
        };

        expect(normalizeDuplicateMatches(raw, candidates).map((match) => match.id)).toEqual(["c", "b", "a"]);
    });

    it("clamps confidence and truncates reason", () => {
        const candidates = [candidate("a", "A", 0.9), candidate("b", "B", 0.8), candidate("c", "C", 0.7)];
        const longReason = "я".repeat(400);
        const raw = {
            matches: [
                { id: "a", verdict: "same", confidence: 5, reason: longReason },
                { id: "b", verdict: "same", confidence: "abc", reason: "  Обрізаний пробіл  " },
                { id: "c", verdict: "same", confidence: -3, reason: 42 }
            ]
        };

        const judged = normalizeDuplicateMatches(raw, candidates);
        const byId = new Map(judged.map((match) => [match.id, match]));

        expect(byId.get("a")!.confidence).toBe(1);
        expect(byId.get("a")!.reason).toHaveLength(DUPLICATE_MAX_REASON_LENGTH);
        expect(byId.get("b")!.confidence).toBeNull();
        expect(byId.get("b")!.reason).toBe("Обрізаний пробіл");
        expect(byId.get("c")!.confidence).toBe(0);
        expect(byId.get("c")!.reason).toBe("");
    });

    it("collapses a repeated id into a single match", () => {
        const candidates = [candidate("a", T_BAR_ROW, 0.81)];
        const raw = {
            matches: [
                { id: "a", verdict: "same", confidence: 0.9, reason: "Перша згадка" },
                { id: "a", verdict: "similar", confidence: 0.2, reason: "Друга згадка" }
            ]
        };

        const judged = normalizeDuplicateMatches(raw, candidates);

        expect(judged).toHaveLength(1);
        expect(judged[0].reason).toBe("Перша згадка");
    });

    it("returns an empty list for junk input", () => {
        const candidates = [candidate("a", T_BAR_ROW, 0.81)];

        expect(normalizeDuplicateMatches(null, candidates)).toEqual([]);
        expect(normalizeDuplicateMatches(undefined, candidates)).toEqual([]);
        expect(normalizeDuplicateMatches({}, candidates)).toEqual([]);
        expect(normalizeDuplicateMatches({ matches: "nope" }, candidates)).toEqual([]);
        expect(normalizeDuplicateMatches({ matches: [null, 7, { verdict: "same" }] }, candidates)).toEqual([]);
    });

    it("caps the list at DUPLICATE_MAX_MATCHES", () => {
        const candidates = Array.from({ length: 8 }, (_, index) => candidate(`id-${index}`, `Вправа ${index}`, 0.9 - index / 100));
        const raw = { matches: candidates.map((item) => ({ id: item.entry.id, verdict: "same", confidence: 0.9, reason: "" })) };

        expect(normalizeDuplicateMatches(raw, candidates)).toHaveLength(DUPLICATE_MAX_MATCHES);
    });

    it("attaches the local fuzzy score, not a model-supplied one", () => {
        const candidates = [candidate("a", T_BAR_ROW, 0.8143)];
        const raw = { matches: [{ id: "a", verdict: "same", confidence: 0.9, reason: "", score: 0.1 }] };

        expect(normalizeDuplicateMatches(raw, candidates)[0].score).toBeCloseTo(0.8143, 4);
    });
});

describe("localOnlyMatches", () => {
    // The regression fence for the whole feature. The fuzzy matcher scores the OPPOSITE
    // movements higher than the true duplicate, so without an AI judge no threshold can
    // separate them - which is why nothing local may ever be called "same".
    it("never labels a candidate 'same', even the 0.92 adversarial pair", () => {
        const catalog = [entry("leg-curl", LEG_CURL)];
        const candidates = rankCandidates(LEG_EXTENSION, catalog);

        expect(candidates[0].score).toBeGreaterThan(0.9);
        expect(candidates[0].score).toBeLessThan(0.95);

        const matches = localOnlyMatches(candidates, DUPLICATE_LOCAL_ONLY_FLOOR);

        expect(matches).toHaveLength(1);
        expect(matches[0].verdict).toBe("similar");
        expect(matches.every((match) => match.verdict !== "same")).toBe(true);
        expect(matches[0].confidence).toBeNull();
        expect(matches[0].reason).toBe("");
    });

    it("drops everything below the floor and caps the rest", () => {
        const candidates = [
            candidate("a", "A", 0.95),
            candidate("b", "B", 0.8),
            candidate("c", "C", 0.7),
            candidate("d", "D", 0.65),
            candidate("e", "E", 0.63),
            candidate("f", "F", 0.61),
            candidate("g", "G", 0.4)
        ];

        const matches = localOnlyMatches(candidates, DUPLICATE_LOCAL_ONLY_FLOOR);

        expect(matches).toHaveLength(DUPLICATE_MAX_MATCHES);
        expect(matches.map((match) => match.id)).toEqual(["a", "b", "c", "d"]);
        expect(matches.every((match) => match.score >= DUPLICATE_LOCAL_ONLY_FLOOR)).toBe(true);
    });
});

describe("fuzzy score bands (regression fence for the AI judge)", () => {
    // Measured values: opposite movements 0.923, true duplicate 0.814, wide vs narrow
    // grip 0.882. Bands, never exact equality - the matcher may be retuned, but the
    // inversion below is the reason the judge exists and must stay visible if it is.
    it("scores the opposite movements ABOVE the true duplicate", () => {
        const oppositeMovements = scoreEntry(LEG_EXTENSION, entry("leg-curl", LEG_CURL));
        const trueDuplicate = scoreEntry(T_BAR_ROW_BENT, entry("t-bar", T_BAR_ROW));

        expect(oppositeMovements).toBeGreaterThan(0.9);
        expect(oppositeMovements).toBeLessThan(0.95);
        expect(trueDuplicate).toBeGreaterThan(0.78);
        expect(trueDuplicate).toBeLessThan(0.85);
        expect(oppositeMovements).toBeGreaterThan(trueDuplicate);
    });

    it("scores a legitimate grip variation as high as a duplicate", () => {
        const gripVariation = scoreEntry("Тяга нижнього блоку широким хватом", entry("row", "Тяга нижнього блоку вузьким хватом"));

        expect(gripVariation).toBeGreaterThan(0.82);
        expect(gripVariation).toBeLessThan(0.92);
    });
});

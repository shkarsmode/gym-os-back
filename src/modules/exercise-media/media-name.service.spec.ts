import { MediaNameService, parseAiName } from "./media-name.service";

describe("MediaNameService.deterministicName", () => {
    const service = new MediaNameService(null as never, null, null);

    function resolve(name: string, muscle = "", equipment = "", aliases: string[] = []) {
        return service.deterministicName({ name, aliases, primaryMuscleGroup: muscle, equipment, movementPattern: "", limit: 6 });
    }

    it("translates a Ukrainian phrase that does not decompose word by word", () => {
        expect(resolve("Станова тяга").englishName).toBe("deadlift");
        expect(resolve("Тяга верхнього блоку").englishName).toBe("lat pulldown");
    });

    it("keeps a Latin alias the user already typed", () => {
        const resolved = resolve("Жим штанги", "", "", ["Landmine Press"]);
        expect(resolved.aliases).toContain("Landmine Press");
    });

    // Nothing in the lexicon and nothing Latin in the name, so the alias field is the
    // only English available. It becomes the resolved name rather than being discarded.
    it("falls back to the Latin alias when the name translates to nothing", () => {
        expect(resolve("Незрозуміла вправа", "", "", ["Landmine Press"]).englishName).toBe("Landmine Press");
    });

    it("never claims the AI was used", () => {
        const resolved = resolve("Присідання зі штангою", "Ноги", "Штанга");
        expect(resolved.aiUsed).toBe(false);
        expect(resolved.aiModel).toBeNull();
        expect(resolved.englishName).toBe("barbell squat");
    });
});

describe("parseAiName", () => {
    it("accepts a clean naming answer", () => {
        const parsed = parseAiName(JSON.stringify({
            englishName: "Barbell Bent Over Row",
            aliases: ["Bent Over Barbell Row", "BB Row"],
            equipment: "barbell",
            primaryMuscle: "back",
            confidence: 0.9
        }));
        expect(parsed?.englishName).toBe("Barbell Bent Over Row");
        expect(parsed?.aliases).toHaveLength(2);
    });

    // Gate A. A model that ignored "never return URLs" is not trustworthy on the names
    // either, so the whole answer is thrown away rather than stripped of the bad field.
    it("discards the entire result when any string looks like a link", () => {
        expect(parseAiName(JSON.stringify({
            englishName: "Barbell Bent Over Row",
            aliases: ["https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Bent-Over-Row.gif"]
        }))).toBeNull();
    });

    it("discards the entire result when a filename is smuggled into a name", () => {
        expect(parseAiName(JSON.stringify({
            englishName: "Barbell-Bent-Over-Row.gif",
            aliases: ["BB Row"]
        }))).toBeNull();
    });

    it("rejects malformed or empty answers", () => {
        expect(parseAiName("not json")).toBeNull();
        expect(parseAiName(JSON.stringify({ aliases: ["BB Row"] }))).toBeNull();
    });
});

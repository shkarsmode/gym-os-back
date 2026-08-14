import { MediaIndexService, slugify, tokenize } from "./media-index.service";
import { MediaNameService } from "./media-name.service";
import { MEDIA_MATCH_MIN_SCORE } from "./media.constants";

// Runs entirely against the committed snapshot: no network, no database, no AI. That is
// the point - this is rung 1 of the degradation ladder, and it has to be provably good
// on its own before Gemini is allowed anywhere near the feature.
describe("media index matching", () => {
    const index = new MediaIndexService();
    const names = new MediaNameService(null as never, null, null);

    function topSlugFor(name: string, muscle: string, equipment: string): string {
        const resolved = names.deterministicName({
            name,
            aliases: [],
            primaryMuscleGroup: muscle,
            equipment,
            movementPattern: "",
            limit: 6
        });
        const results = index.search(
            {
                phrases: [resolved.englishName, ...resolved.aliases],
                equipment: resolved.equipment,
                muscle: resolved.primaryMuscle
            },
            MEDIA_MATCH_MIN_SCORE
        );
        return results.length ? results[0].entry.slug : "";
    }

    it("loads the committed snapshot", () => {
        expect(index.size()).toBeGreaterThan(1000);
        expect(index.indexSource()).toBe("snapshot");
    });

    it("only ever holds URLs the site published, never constructed ones", () => {
        for (const entry of index.all()) {
            expect(entry.url.startsWith("https://fitnessprogramer.com/wp-content/uploads/")).toBe(true);
        }
    });

    it("resolves Ukrainian names to the right exercise with no AI at all", () => {
        expect(topSlugFor("Тяга штанги в нахилі", "Спина", "Штанга")).toBe("barbell-bent-over-row");
        expect(topSlugFor("Присідання зі штангою", "Ноги", "Штанга")).toBe("squat");
        expect(topSlugFor("Жим гантелей лежачи", "Груди", "Гантелі")).toBe("dumbbell-press");
        expect(topSlugFor("Підйом на носки стоячи", "Литки", "Власна вага")).toBe("calf-raise");
    });

    // Rung 4: the pool is broad but finite, and the feature must return an empty list
    // rather than fabricate something to fill the sheet.
    it("returns nothing rather than a bad guess for an exercise the pool does not contain", () => {
        const results = index.search(
            { phrases: ["zzzqqq flurbwibble grondle"], equipment: "", muscle: "" },
            MEDIA_MATCH_MIN_SCORE
        );
        expect(results).toHaveLength(0);
    });

    it("keeps Cyrillic tokens so a Ukrainian query can reach a Ukrainian catalog name", () => {
        expect(tokenize("Тяга штанги в нахилі")).toEqual(["тяга", "штанги", "в", "нахилі"]);
        expect(tokenize("Barbell Bent-Over Row")).toEqual(["barbell", "bent", "over", "row"]);
        expect(slugify("Barbell Bent Over Row")).toBe("barbell-bent-over-row");
    });
});

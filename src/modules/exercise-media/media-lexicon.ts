// Static Ukrainian -> English gym vocabulary. This is what makes rung 1 of the
// degradation ladder real: with no Gemini key, no quota and no network to Google, a
// Ukrainian exercise name still turns into English tokens the index can be matched
// against. The AI is an accuracy upgrade on top of this, never a prerequisite.
//
// Ukrainian is heavily inflected ("штанга / штанги / штангою / зі штангою"), so lookups
// go phrase-first, then whole token, then longest stem prefix. Listing every inflected
// form by hand would be both huge and incomplete; stems cover the productive cases.

export type LexiconKind = "movement" | "equipment" | "muscle" | "modifier";

export interface LexiconTerm {
    en: string;
    kind: LexiconKind;
}

function term(en: string, kind: LexiconKind): LexiconTerm {
    return { en, kind };
}

// Multi-word idioms first, because most of them do not decompose: "станова тяга" is a
// deadlift, not a "standing row", and "тяга верхнього блоку" is a lat pulldown, not a
// "row of the upper block". Matched longest-first against the normalized string.
const PHRASES: Array<[string, LexiconTerm]> = [
    ["задня поверхня стегна", term("hamstring", "muscle")],
    ["передня поверхня стегна", term("quadriceps", "muscle")],
    ["тяга горизонтального блоку", term("seated cable row", "movement")],
    ["тяга верхнього блоку", term("lat pulldown", "movement")],
    ["тяга нижнього блоку", term("seated cable row", "movement")],
    ["фермерська прогулянка", term("farmers walk", "movement")],
    ["розгинання на трицепс", term("triceps extension", "movement")],
    ["згинання на біцепс", term("biceps curl", "movement")],
    ["болгарські випади", term("bulgarian split squat", "movement")],
    ["болгарський випад", term("bulgarian split squat", "movement")],
    ["на похилій лаві", term("incline bench", "modifier")],
    ["нейтральним хватом", term("neutral grip", "modifier")],
    ["зворотним хватом", term("reverse grip", "modifier")],
    ["прямим хватом", term("overhand grip", "modifier")],
    ["вузьким хватом", term("close grip", "modifier")],
    ["широким хватом", term("wide grip", "modifier")],
    ["ягодичний місток", term("glute bridge", "movement")],
    ["сідничний місток", term("glute bridge", "movement")],
    ["розведення гантелей", term("dumbbell fly", "movement")],
    ["підйом на носки", term("calf raise", "movement")],
    ["підйоми на носки", term("calf raise", "movement")],
    ["французький жим", term("skull crusher", "movement")],
    ["армійський жим", term("military press", "movement")],
    ["жим арнольда", term("arnold press", "movement")],
    ["махи в сторони", term("lateral raise", "movement")],
    ["махи гантелями", term("dumbbell lateral raise", "movement")],
    ["до підборіддя", term("upright row", "movement")],
    ["стійка на руках", term("handstand", "movement")],
    ["підйом тулуба", term("sit up", "movement")],
    ["підйом корпуса", term("sit up", "movement")],
    ["гакк присідання", term("hack squat", "movement")],
    ["гак присідання", term("hack squat", "movement")],
    ["румунська тяга", term("romanian deadlift", "movement")],
    ["станова тяга", term("deadlift", "movement")],
    ["мертва тяга", term("stiff leg deadlift", "movement")],
    ["тяга сумо", term("sumo deadlift", "movement")],
    ["тяга т-грифа", term("t bar row", "movement")],
    ["верхній блок", term("lat pulldown", "movement")],
    ["біцепс стегна", term("hamstring", "muscle")],
    ["зведення рук", term("fly", "movement")],
    ["згинання рук", term("curl", "movement")],
    ["розгинання рук", term("extension", "movement")],
    ["підйом ніг", term("leg raise", "movement")],
    ["жим лежачи", term("bench press", "movement")],
    ["жим ногами", term("leg press", "movement")],
    ["жим стоячи", term("overhead press", "movement")],
    ["машина сміта", term("smith machine", "equipment")],
    ["тренажер сміта", term("smith machine", "equipment")],
    ["у кросовері", term("cable crossover", "equipment")],
    ["в кросовері", term("cable crossover", "equipment")],
    ["на тренажері", term("machine", "equipment")],
    ["у тренажері", term("machine", "equipment")],
    ["в тренажері", term("machine", "equipment")],
    ["власною вагою", term("bodyweight", "equipment")],
    ["вагою тіла", term("bodyweight", "equipment")],
    ["власна вага", term("bodyweight", "equipment")],
    ["на брусах", term("dips", "movement")],
    ["під кутом", term("incline", "modifier")],
    ["за голову", term("behind neck", "modifier")],
    ["до грудей", term("to chest", "modifier")],
    ["в нахилі", term("bent over", "modifier")],
    ["у нахилі", term("bent over", "modifier")],
    ["зі штангою", term("barbell", "equipment")],
    ["зі штанги", term("barbell", "equipment")],
    ["з гантелями", term("dumbbell", "equipment")],
    ["з гантелей", term("dumbbell", "equipment")],
    ["на блоці", term("cable", "equipment")],
    ["у блоці", term("cable", "equipment")],
    ["в блоці", term("cable", "equipment")],
    ["на біцепс", term("biceps", "muscle")],
    ["на трицепс", term("triceps", "muscle")],
    ["на прес", term("abs", "muscle")],
    ["на плечі", term("shoulder", "muscle")],
    ["на груди", term("chest", "muscle")],
    ["на спину", term("back", "muscle")]
];

// Whole-token lookups: short function words and irregular forms that no stem covers.
const TOKENS: Record<string, LexiconTerm> = {
    кор: term("core", "muscle"),
    ноги: term("leg", "muscle"),
    ніг: term("leg", "muscle"),
    нога: term("leg", "muscle"),
    ногою: term("leg", "modifier"),
    ногами: term("leg", "modifier"),
    шия: term("neck", "muscle"),
    шиї: term("neck", "muscle"),
    одна: term("one", "modifier"),
    одне: term("one", "modifier"),
    однією: term("one arm", "modifier"),
    одною: term("one arm", "modifier"),
    сумо: term("sumo", "modifier"),
    бік: term("side", "modifier"),
    боки: term("side", "modifier"),
    сторони: term("lateral", "modifier"),
    вгору: term("up", "modifier"),
    вниз: term("down", "modifier"),
    вперед: term("forward", "modifier"),
    назад: term("reverse", "modifier"),
    біг: term("run", "movement"),
    мах: term("swing", "movement"),
    махи: term("swing", "movement"),
    брус: term("dips", "movement"),
    бруси: term("dips", "movement"),
    брусах: term("dips", "movement"),
    ролик: term("ab wheel", "equipment"),
    диск: term("plate", "equipment"),
    диски: term("plate", "equipment"),
    канат: term("rope", "equipment"),
    гриф: term("bar", "equipment"),
    грифом: term("bar", "equipment"),
    еспандер: term("band", "equipment"),
    фітбол: term("ball", "equipment"),
    фітболі: term("ball", "equipment"),
    мяч: term("ball", "equipment"),
    мячем: term("ball", "equipment"),
    турнік: term("pull up", "movement"),
    турніку: term("pull up", "movement"),
    прес: term("abs", "muscle"),
    пресі: term("abs", "muscle"),
    берпі: term("burpee", "movement"),
    ривок: term("snatch", "movement"),
    поштовх: term("clean", "movement"),
    пуловер: term("pullover", "movement"),
    планка: term("plank", "movement"),
    планці: term("plank", "movement"),
    гантель: term("dumbbell", "equipment"),
    гиря: term("kettlebell", "equipment"),
    гирі: term("kettlebell", "equipment"),
    гирею: term("kettlebell", "equipment")
};

// Longest stem wins, so "підтягуванн" beats "тяг" and "широчайш" beats "широк".
const STEMS: Array<[string, LexiconTerm]> = [
    ["гіперекстенз", term("hyperextension", "movement")],
    ["підтягуванн", term("pull up", "movement")],
    ["віджиманн", term("push up", "movement")],
    ["скручуванн", term("crunch", "movement")],
    ["розгинанн", term("extension", "movement")],
    ["розведенн", term("fly", "movement")],
    ["відведенн", term("abduction", "movement")],
    ["приведенн", term("adduction", "movement")],
    ["перекладин", term("pull up", "movement")],
    ["концентрован", term("concentration", "modifier")],
    ["горизонтальн", term("horizontal", "modifier")],
    ["поперемінн", term("alternating", "modifier")],
    ["почергов", term("alternating", "modifier")],
    ["французьк", term("skull crusher", "movement")],
    ["болгарськ", term("bulgarian", "modifier")],
    ["квадріцепс", term("quadriceps", "muscle")],
    ["квадрицепс", term("quadriceps", "muscle")],
    ["передпліч", term("forearm", "muscle")],
    ["вертикальн", term("vertical", "modifier")],
    ["фронтальн", term("front", "modifier")],
    ["нейтральн", term("neutral", "modifier")],
    ["румунськ", term("romanian", "modifier")],
    ["широчайш", term("lat", "muscle")],
    ["найширш", term("lat", "muscle")],
    ["прогулянк", term("carry", "movement")],
    ["протяжк", term("upright row", "movement")],
    ["згинанн", term("curl", "movement")],
    ["зведенн", term("fly", "movement")],
    ["утриманн", term("hold", "movement")],
    ["триманн", term("hold", "movement")],
    ["присідан", term("squat", "movement")],
    ["присід", term("squat", "movement")],
    ["кросовер", term("cable crossover", "equipment")],
    ["тренажер", term("machine", "equipment")],
    ["платформ", term("platform", "equipment")],
    ["стрибк", term("jump", "movement")],
    ["розтяж", term("stretch", "movement")],
    ["розтягн", term("stretch", "movement")],
    ["негативн", term("eccentric", "modifier")],
    ["вибухов", term("explosive", "modifier")],
    ["статичн", term("static", "modifier")],
    ["зігнут", term("bent", "modifier")],
    ["сіднич", term("glute", "muscle")],
    ["сідниц", term("glute", "muscle")],
    ["трапец", term("trapezius", "muscle")],
    ["гомілк", term("calf", "muscle")],
    ["поперек", term("lower back", "muscle")],
    ["попереков", term("lower back", "muscle")],
    ["біцепс", term("biceps", "muscle")],
    ["трицепс", term("triceps", "muscle")],
    ["стегн", term("thigh", "muscle")],
    ["дельт", term("deltoid", "muscle")],
    ["груд", term("chest", "muscle")],
    ["спин", term("back", "muscle")],
    ["плеч", term("shoulder", "muscle")],
    ["живіт", term("abs", "muscle")],
    ["живот", term("abs", "muscle")],
    ["литк", term("calf", "muscle")],
    ["литок", term("calf", "muscle")],
    ["носк", term("calf", "muscle")],
    ["штанг", term("barbell", "equipment")],
    ["гантел", term("dumbbell", "equipment")],
    ["кетлбел", term("kettlebell", "equipment")],
    ["мотуз", term("rope", "equipment")],
    ["стрічк", term("band", "equipment")],
    ["гумов", term("band", "equipment")],
    ["гумк", term("band", "equipment")],
    ["млинц", term("plate", "equipment")],
    ["сміт", term("smith machine", "equipment")],
    ["блок", term("cable", "equipment")],
    ["трос", term("cable", "equipment")],
    ["лавц", term("bench", "equipment")],
    ["лавк", term("bench", "equipment")],
    ["лаві", term("bench", "equipment")],
    ["лава", term("bench", "equipment")],
    ["лежач", term("bench", "modifier")],
    ["сидяч", term("seated", "modifier")],
    ["стояч", term("standing", "modifier")],
    ["навпочіпк", term("squat", "movement")],
    ["нахилен", term("incline", "modifier")],
    ["похил", term("incline", "modifier")],
    ["нахил", term("bent", "modifier")],
    ["зворотн", term("reverse", "modifier")],
    ["обернен", term("reverse", "modifier")],
    ["молотк", term("hammer", "modifier")],
    ["молот", term("hammer", "modifier")],
    ["вузьк", term("close", "modifier")],
    ["широк", term("wide", "modifier")],
    ["хват", term("grip", "modifier")],
    ["передн", term("front", "modifier")],
    ["задн", term("rear", "modifier")],
    ["середн", term("middle", "modifier")],
    ["верхн", term("upper", "modifier")],
    ["нижн", term("lower", "modifier")],
    ["бокови", term("side", "modifier")],
    ["глибок", term("deep", "modifier")],
    ["прям", term("straight", "modifier")],
    ["станов", term("deadlift", "movement")],
    ["мертв", term("stiff leg deadlift", "movement")],
    ["містк", term("bridge", "movement")],
    ["місток", term("bridge", "movement")],
    ["випад", term("lunge", "movement")],
    ["підйом", term("raise", "movement")],
    ["шраг", term("shrug", "movement")],
    ["ходьб", term("walk", "movement")],
    ["оберт", term("rotation", "movement")],
    ["поворот", term("twist", "movement")],
    ["тяг", term("row", "movement")],
    ["жим", term("press", "movement")],
    ["рук", term("arm", "modifier")]
];

// Ukrainian glue words. Dropping them keeps a token like "на" from ever reaching the
// stem matcher, where it would prefix-match nothing useful anyway.
const UA_STOPWORDS = new Set([
    "в", "у", "на", "з", "зі", "із", "до", "для", "і", "й", "та", "під", "над", "по",
    "за", "від", "о", "а", "це", "при", "без", "після", "перед", "через", "як", "що",
    "вправа", "вправи", "варіант", "мяз", "мязи", "мязів", "м", "яз", "язи", "язів"
]);

const SORTED_PHRASES = [...PHRASES].sort((left, right) => right[0].length - left[0].length);
const SORTED_STEMS = [...STEMS].sort((left, right) => right[0].length - left[0].length);

// Apostrophes come in four flavours in real user input; fold them all away so "м'яз",
// "м’яз" and "мяз" are the same token.
export function normalizeUkrainian(text: string): string {
    return String(text || "")
        .toLowerCase()
        .replace(/[’'`ʼ]/g, "")
        .replace(/ё/g, "е")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

export function isUkrainianStopword(token: string): boolean {
    return UA_STOPWORDS.has(token);
}

export function lookupToken(token: string): LexiconTerm | null {
    if (!token || UA_STOPWORDS.has(token)) {
        return null;
    }
    const exact = TOKENS[token];
    if (exact) {
        return exact;
    }
    for (const [stem, value] of SORTED_STEMS) {
        if (token.startsWith(stem)) {
            return value;
        }
    }
    return null;
}

export interface LexiconMatch {
    en: string;
    kind: LexiconKind;
}

// Translates a free-form Ukrainian string into ordered English terms. Anything with no
// lexicon entry is dropped rather than transliterated: a phonetic guess would add noise
// tokens that only lower the dice score of the entry we actually want.
export function translateUkrainian(text: string): LexiconMatch[] {
    let normalized = normalizeUkrainian(text);
    if (!normalized) {
        return [];
    }

    const matches: LexiconMatch[] = [];

    // Phrases are consumed out of the string and replaced by a marker so their words
    // cannot be translated a second time by the token pass.
    for (const [phrase, value] of SORTED_PHRASES) {
        let index = normalized.indexOf(phrase);
        while (index >= 0) {
            const beforeOk = index === 0 || normalized[index - 1] === " ";
            const afterIndex = index + phrase.length;
            const afterOk = afterIndex >= normalized.length || normalized[afterIndex] === " ";
            if (!beforeOk || !afterOk) {
                index = normalized.indexOf(phrase, index + 1);
                continue;
            }
            matches.push({ en: value.en, kind: value.kind });
            normalized = `${normalized.slice(0, index)} ${normalized.slice(afterIndex)}`;
            index = normalized.indexOf(phrase);
        }
    }

    for (const token of normalized.split(" ").filter(Boolean)) {
        const found = lookupToken(token);
        if (found) {
            matches.push({ en: found.en, kind: found.kind });
        }
    }

    return matches;
}

// Single-value helpers for the equipment / muscle scoring bonuses. The form feeds these
// the Ukrainian label the user picked in a select ("Штанга", "Груди").
export function translateEquipment(value: string): string {
    const matches = translateUkrainian(value);
    const equipment = matches.find((match) => match.kind === "equipment");
    return equipment ? equipment.en : latinOnly(value);
}

export function translateMuscle(value: string): string {
    const matches = translateUkrainian(value);
    const muscle = matches.find((match) => match.kind === "muscle");
    return muscle ? muscle.en : latinOnly(value);
}

// Latin-script fragments of the input are already English (users routinely type an
// English alias into the aliases field), so they pass through verbatim.
export function latinOnly(text: string): string {
    return String(text || "")
        .replace(/[^\x20-\x7e]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

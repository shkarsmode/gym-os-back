/**
 * The simulation core for the dev environment's synthetic population.
 *
 * Everything here is PURE and DETERMINISTIC: given the same seed it produces the same
 * people, the same training days and the same weights, for ever. That is not a nicety —
 * it is what makes the generator safe to re-run. `populate` can be executed twice without
 * inventing a second, contradictory history, and a bug reproduced on Tuesday is still
 * reproducible on Friday because "user 41's third week" is a fixed thing.
 *
 * The randomness is therefore always drawn from a seed derived from stable identity
 * (person + day + purpose), never from a running stream, so adding a person or changing
 * the order of a loop cannot shift everybody else's history underneath them.
 */

export type Rng = () => number;

/** mulberry32 — small, fast, and good enough for plausible-looking gym data. */
export function makeRng(seed: number): Rng {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** FNV-1a over a string, so a seed can be built from meaningful parts rather than a counter. */
export function hashSeed(...parts: (string | number)[]): number {
    let hash = 0x811c9dc5;
    const text = parts.join("|");
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
    return items[Math.floor(rng() * items.length) % items.length];
}

export function pickWeighted<T>(rng: Rng, weighted: readonly (readonly [T, number])[]): T {
    const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = rng() * total;
    for (const [item, weight] of weighted) {
        roll -= weight;
        if (roll <= 0) {
            return item;
        }
    }
    return weighted[weighted.length - 1][0];
}

/** Box–Muller. Human measurements cluster; uniform noise makes a population look wrong. */
export function gaussian(rng: Rng, mean: number, deviation: number): number {
    const a = Math.max(rng(), 1e-9);
    const b = rng();
    return mean + deviation * Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** Weights land on real plates: 2.5 kg steps on a bar, 1 kg on small isolation work. */
export function roundToPlate(weight: number, step = 2.5): number {
    return Math.max(0, Math.round(weight / step) * step);
}

export type Archetype = "novice" | "regular" | "veteran" | "returning" | "cardio";
export type SplitName = "full_body" | "upper_lower" | "ppl" | "bro";
export type SessionKind = "push" | "pull" | "legs" | "upper" | "lower" | "full_body" | "cardio";

/**
 * The weekly shape of each split, as a 7-slot week starting Monday.
 *
 * `null` is a rest day. Written out rather than generated because the REST PATTERN is the
 * part that makes a history look human — nobody trains Mon/Tue/Wed/Thu by accident, and a
 * feed where everybody lifts every day is the first thing that reads as fake.
 */
export const SPLITS: Record<SplitName, (SessionKind | null)[]> = {
    full_body: ["full_body", null, "full_body", null, "full_body", null, null],
    upper_lower: ["upper", "lower", null, "upper", "lower", null, null],
    ppl: ["push", "pull", "legs", null, "push", "pull", "legs"],
    bro: ["push", "pull", "legs", "upper", "cardio", null, null]
};

export interface Persona {
    /** Stable across every run. The `dev-` prefix is what makes cleanup safe. */
    id: string;
    index: number;
    email: string;
    name: string;
    displayName: string;
    gender: "male" | "female";
    height: number;
    startBodyweight: number;
    birthYear: number;
    archetype: Archetype;
    split: SplitName;
    /** Chance of actually honouring a scheduled day. Nobody is 100%. */
    consistency: number;
    /** Fraction of their eventual strength they started at, and how fast they close it. */
    strengthBase: number;
    progressionPerWeek: number;
    /** How likely they are to react or comment on somebody else's session. */
    sociability: number;
    hideWorkoutDetails: boolean;
    role: "free" | "pro";
    /** How long they have been a member — the backfill only goes back this far for them. */
    joinedDaysAgo: number;
    preferredHour: number;
    goal: string;
    experience: string;
    favoriteMuscleGroup: string;
}

const ARCHETYPE_WEIGHTS: (readonly [Archetype, number])[] = [
    ["novice", 26],
    ["regular", 38],
    ["veteran", 16],
    ["returning", 12],
    ["cardio", 8]
];

/** Per-archetype dials. Everything else about a person is drawn around these. */
const ARCHETYPE_TRAITS: Record<Archetype, {
    consistency: [number, number];
    strengthBase: [number, number];
    progression: [number, number];
    splits: (readonly [SplitName, number])[];
    membershipDays: [number, number];
}> = {
    // Improves fastest, keeps the schedule worst, and has not been here long.
    novice: {
        consistency: [0.5, 0.78],
        strengthBase: [0.35, 0.55],
        progression: [1.6, 3.2],
        splits: [["full_body", 6], ["upper_lower", 3], ["ppl", 1]],
        membershipDays: [14, 120]
    },
    regular: {
        consistency: [0.68, 0.9],
        strengthBase: [0.6, 0.8],
        progression: [0.5, 1.4],
        splits: [["upper_lower", 4], ["ppl", 4], ["full_body", 2], ["bro", 1]],
        membershipDays: [90, 420]
    },
    // Strong, consistent, and barely moving any more — which is what a plateau looks like.
    veteran: {
        consistency: [0.82, 0.96],
        strengthBase: [0.88, 1.0],
        progression: [0.05, 0.35],
        splits: [["ppl", 5], ["bro", 3], ["upper_lower", 2]],
        membershipDays: [200, 700]
    },
    // Was strong, took a break, is climbing back — visible as a gap then a steep ramp.
    returning: {
        consistency: [0.45, 0.72],
        strengthBase: [0.5, 0.72],
        progression: [1.2, 2.6],
        splits: [["full_body", 4], ["upper_lower", 4], ["ppl", 2]],
        membershipDays: [60, 500]
    },
    cardio: {
        consistency: [0.6, 0.88],
        strengthBase: [0.4, 0.62],
        progression: [0.2, 0.8],
        splits: [["full_body", 5], ["bro", 3], ["upper_lower", 2]],
        membershipDays: [30, 300]
    }
};

function between(rng: Rng, [low, high]: [number, number]): number {
    return low + rng() * (high - low);
}

export interface PersonaBankInput {
    givenMale: readonly string[];
    givenFemale: readonly string[];
    family: readonly string[];
    handleSuffixes: readonly string[];
    goals: readonly string[];
    experience: readonly string[];
    muscleGroups: readonly string[];
}

/**
 * Build the population.
 *
 * Each person is seeded from their INDEX alone, so growing the population from 60 to 100
 * leaves the first 60 histories byte-identical. That matters more than it sounds: a bug
 * filed against "dev user 12" has to still be there tomorrow.
 */
export function buildPersonas(count: number, bank: PersonaBankInput, seed = 20260821): Persona[] {
    const people: Persona[] = [];
    for (let index = 0; index < count; index += 1) {
        const rng = makeRng(hashSeed(seed, "persona", index));
        const gender: "male" | "female" = rng() < 0.62 ? "male" : "female";
        const given = pick(rng, gender === "male" ? bank.givenMale : bank.givenFemale);
        const family = pick(rng, bank.family);
        const archetype = pickWeighted(rng, ARCHETYPE_WEIGHTS);
        const traits = ARCHETYPE_TRAITS[archetype];
        const height = Math.round(gender === "male" ? gaussian(rng, 178, 7) : gaussian(rng, 166, 6));
        const bodyweight = Math.round(
            (gender === "male" ? gaussian(rng, 82, 11) : gaussian(rng, 62, 9)) * 10
        ) / 10;
        const handle = `${translit(given)}${pick(rng, bank.handleSuffixes)}`;

        people.push({
            id: `dev-u-${String(index).padStart(3, "0")}`,
            index,
            // A domain that can never collide with a real signup, and never receives mail.
            email: `dev.${String(index).padStart(3, "0")}.${translit(given)}@dev.gymos.invalid`,
            name: `${given} ${family}`,
            displayName: rng() < 0.45 ? `${given} ${family.charAt(0)}.` : handle,
            gender,
            height: clamp(height, 150, 200),
            startBodyweight: clamp(bodyweight, 45, 130),
            birthYear: Math.round(gaussian(rng, 1995, 8)),
            archetype,
            split: pickWeighted(rng, traits.splits),
            consistency: between(rng, traits.consistency),
            strengthBase: between(rng, traits.strengthBase),
            progressionPerWeek: between(rng, traits.progression),
            sociability: clamp(gaussian(rng, 0.35, 0.25), 0.02, 0.95),
            // A quarter of the population hides their details, so every privacy branch in
            // the client is exercised by simply using the dev environment.
            hideWorkoutDetails: rng() < 0.25,
            role: rng() < 0.18 ? "pro" : "free",
            joinedDaysAgo: Math.round(between(rng, traits.membershipDays)),
            preferredHour: pickWeighted(rng, [[7, 3], [8, 3], [12, 2], [17, 4], [18, 6], [19, 5], [20, 3], [21, 1]]),
            goal: pick(rng, bank.goals),
            experience: pick(rng, bank.experience),
            favoriteMuscleGroup: pick(rng, bank.muscleGroups)
        });
    }
    return people;
}

/** Latin handle from a Cyrillic given name — enough for an email local part. */
export function translit(text: string): string {
    const map: Record<string, string> = {
        а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z",
        и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
        р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
        щ: "shch", ь: "", ю: "iu", я: "ia", "'": ""
    };
    return text.toLowerCase().split("").map((char) => map[char] ?? "").join("") || "user";
}

/**
 * Did this person train on this day?
 *
 * Seeded from (person, day) so the answer never changes, and so the schedule can be asked
 * about a single day in isolation — which is exactly what the incremental `tick` needs.
 *
 * `dayIndex` counts backwards-compatible absolute days (days since epoch), NOT an offset
 * into a run, so today's answer is the same whichever command asks.
 */
export function trainsOn(persona: Persona, dayIndex: number): boolean {
    const weekday = ((dayIndex % 7) + 7) % 7;
    const planned = SPLITS[persona.split][weekday];
    if (!planned) {
        return false;
    }
    const rng = makeRng(hashSeed(persona.id, "day", dayIndex));
    if (rng() > persona.consistency) {
        return false;
    }
    // A holiday, an illness, a deadline: roughly one blank week in fifteen, taken whole
    // rather than as scattered missed days, because that is how absences actually look.
    const week = Math.floor(dayIndex / 7);
    const away = makeRng(hashSeed(persona.id, "week", week));
    return away() > 0.065;
}

export function sessionKind(persona: Persona, dayIndex: number): SessionKind {
    const weekday = ((dayIndex % 7) + 7) % 7;
    return SPLITS[persona.split][weekday] ?? "full_body";
}

/**
 * The muscle groups a session of this kind targets, in the catalogue's own vocabulary.
 *
 * Returned as a priority list: the composer takes exercises for the first group it can
 * satisfy and works down, so a thin catalogue degrades to a shorter session rather than
 * to an empty one.
 */
export const SESSION_MUSCLES: Record<SessionKind, string[]> = {
    push: ["Груди", "Плечі", "Трицепс"],
    pull: ["Спина", "Біцепс", "Передпліччя"],
    legs: ["Ноги", "Сідниці", "Прес"],
    upper: ["Груди", "Спина", "Плечі", "Біцепс", "Трицепс"],
    lower: ["Ноги", "Сідниці", "Прес"],
    full_body: ["Ноги", "Груди", "Спина", "Плечі", "Прес"],
    cardio: ["Прес", "Ноги"]
};

/**
 * How many weeks of training this person has behind them at a given day.
 *
 * Progression is driven by this rather than by a running counter, so a person's strength
 * on any specific date can be computed without replaying their whole history.
 */
export function weeksTrained(persona: Persona, dayIndex: number, todayIndex: number): number {
    const joinedIndex = todayIndex - persona.joinedDaysAgo;
    return Math.max(0, (dayIndex - joinedIndex) / 7);
}

/**
 * Working weight for a lift, in kilograms.
 *
 * A saturating curve, not a straight line: everybody's newbie gains flatten. `ceiling` is
 * what this person could eventually lift for the given exercise (derived from bodyweight
 * and the lift's own difficulty), `strengthBase` is where they started as a fraction of
 * it, and progression closes the gap week by week with diminishing returns.
 */
export function workingWeight(persona: Persona, ceiling: number, weeks: number, jitterSeed: string): number {
    const closed = 1 - Math.exp(-(persona.progressionPerWeek * weeks) / Math.max(ceiling * 0.35, 8));
    const fraction = persona.strengthBase + (1 - persona.strengthBase) * closed;
    const rng = makeRng(hashSeed(persona.id, "lift", jitterSeed, Math.floor(weeks)));
    // Day-to-day variance: sleep, food, whether the bar felt heavy. ±4%.
    const daily = 1 + (rng() - 0.5) * 0.08;
    return roundToPlate(ceiling * clamp(fraction, 0.2, 1.05) * daily);
}

/**
 * Is this session a deload?
 *
 * Every fifth week or so, and only for people who have been at it long enough to need one.
 * Without it every chart is a monotonic ramp, and monotonic ramps are the second thing
 * that reads as fake.
 */
export function isDeloadWeek(persona: Persona, dayIndex: number): boolean {
    if (persona.archetype === "novice") {
        return false;
    }
    const week = Math.floor(dayIndex / 7);
    return makeRng(hashSeed(persona.id, "deload", week))() < 0.14;
}

/** Bodyweight drifts, and the direction depends on what the person is training for. */
export function bodyweightOn(persona: Persona, weeks: number): number {
    const direction = persona.archetype === "cardio" ? -1 : persona.archetype === "novice" ? 1 : 0.35;
    const drift = direction * Math.min(weeks, 60) * 0.055;
    const rng = makeRng(hashSeed(persona.id, "bw", Math.floor(weeks)));
    return Math.round((persona.startBodyweight + drift + (rng() - 0.5) * 0.9) * 10) / 10;
}

// ---------------------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------------------

export const DAY_MS = 86_400_000;
/** Sessions are scheduled in Kyiv hours; rows are stored in UTC like everything else. */
export const KYIV_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Which Kyiv calendar day an instant falls on. */
export function dayIndexOf(when: Date): number {
    return Math.floor((when.getTime() + KYIV_OFFSET_MS) / DAY_MS);
}

/**
 * The `date` COLUMN, which is a calendar day and not an instant.
 *
 * The client sends "2026-08-21" and the backend's parseDateInput turns that into midnight
 * UTC, so every real row sits at 00:00:00Z. Deriving it from the Kyiv day start instead
 * put generated rows at 21:00 the PREVIOUS day — the same calendar day to a human reading
 * Kyiv time, and the day before to every UTC date comparison. `WHERE date::date =
 * CURRENT_DATE` returned nothing while sessions were visibly in progress, which is exactly
 * the sort of off-by-one that makes a dev environment quietly lie.
 */
export function calendarDate(dayIndex: number): Date {
    return new Date(dayIndex * DAY_MS);
}

/** An actual instant during that Kyiv day — when somebody walked into the gym. */
export function instantAt(dayIndex: number, hour: number, minute: number): Date {
    return new Date(dayIndex * DAY_MS - KYIV_OFFSET_MS + hour * 3_600_000 + minute * 60_000);
}

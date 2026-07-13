// Local, dependency-free fuzzy matching of a recognized exercise name against the catalog.
// Used as a fallback when Gemini does not return a valid catalog id, and to build the list
// of candidate options shown to the user for an ambiguous match. Handles Ukrainian /
// Russian / English by folding common character variants before comparison.

export interface CatalogEntry {
    id: string;
    name: string;
    aliases: string[];
    primaryMuscleGroup: string;
    equipment: string;
    mediaUrl: string;
}

export interface ScoredCandidate {
    entry: CatalogEntry;
    score: number;
}

export function normalizeName(value: string): string {
    return String(value || "")
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/[іїй]/g, "и")
        .replace(/є/g, "е")
        .replace(/ґ/g, "г")
        .replace(/[^a-z0-9а-я\s]/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function tokens(value: string): string[] {
    return normalizeName(value).split(" ").filter(Boolean);
}

function jaccard(a: string[], b: string[]): number {
    if (!a.length || !b.length) {
        return 0;
    }
    const setB = new Set(b);
    const intersection = a.filter((token) => setB.has(token)).length;
    const union = new Set([...a, ...b]).size;
    return union ? intersection / union : 0;
}

function levenshtein(a: string, b: string): number {
    if (a === b) {
        return 0;
    }
    if (!a.length) {
        return b.length;
    }
    if (!b.length) {
        return a.length;
    }
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 0; i < a.length; i += 1) {
        const current = [i + 1];
        for (let j = 0; j < b.length; j += 1) {
            const cost = a[i] === b[j] ? 0 : 1;
            current.push(Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + cost));
        }
        previous = current;
    }
    return previous[b.length];
}

function similarity(a: string, b: string): number {
    const normalizedA = normalizeName(a);
    const normalizedB = normalizeName(b);
    if (!normalizedA || !normalizedB) {
        return 0;
    }
    if (normalizedA === normalizedB) {
        return 1;
    }

    const longer = normalizedA.length >= normalizedB.length ? normalizedA : normalizedB;
    const shorter = normalizedA.length >= normalizedB.length ? normalizedB : normalizedA;

    // Substring containment (e.g. "жим лежачи" inside "жим штанги лежачи").
    let containment = 0;
    if (longer.includes(shorter)) {
        containment = 0.7 + 0.2 * (shorter.length / longer.length);
    }

    const editRatio = 1 - levenshtein(normalizedA, normalizedB) / longer.length;
    const tokenScore = jaccard(tokens(a), tokens(b));

    return Math.max(containment, editRatio, tokenScore);
}

// Best similarity of `name` against an entry's canonical name and every alias.
export function scoreEntry(name: string, entry: CatalogEntry): number {
    let best = similarity(name, entry.name);
    for (const alias of entry.aliases) {
        best = Math.max(best, similarity(name, alias));
        if (best >= 1) {
            break;
        }
    }
    return best;
}

export function rankCandidates(name: string, catalog: CatalogEntry[]): ScoredCandidate[] {
    return catalog
        .map((entry) => ({ entry, score: scoreEntry(name, entry) }))
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => b.score - a.score);
}

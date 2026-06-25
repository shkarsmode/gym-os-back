export type ImportedExerciseInput = {
    id?: string;
    sourceName?: string;
    sourceUrl?: string;
    licenseStatus?: string;
    name?: string;
    originalName?: string;
    aliases?: string[];
    primaryMuscleGroup?: string;
    secondaryMuscleGroups?: string[];
    movementPattern?: string;
    equipment?: string;
    category?: string;
    difficulty?: string;
    description?: string;
    techniqueSteps?: string[];
    commonMistakes?: string[];
    safetyTips?: string[];
    mediaUrl?: string;
    mediaType?: string;
    mediaReferences?: unknown[];
    importedAt?: string;
    updatedAt?: string;
};

export type NormalizedImportedExercise = {
    slug: string;
    name: string;
    aliases: string[];
    primaryMuscleGroup: string;
    secondaryMuscleGroups: string[];
    movementPattern: string;
    equipment: string;
    category: string;
    difficulty: string;
    description: string;
    techniqueSteps: string[];
    commonMistakes: string[];
    safetyTips: string[];
    mediaUrl: null;
    mediaType: "none";
    isCustom: false;
    createdByUserId: null;
    sourceName: string;
    sourceUrl: string | null;
    originalName: string | null;
    licenseStatus: string;
    mediaReferences: unknown[];
    sourceImportedAt: Date;
};

export type ExerciseCatalogImportResult = {
    exercises: NormalizedImportedExercise[];
    skipped: number;
};

export function normalizeExerciseCatalogPayload(payload: unknown, existingKeys = new Set<string>()): ExerciseCatalogImportResult {
    const rows = Array.isArray((payload as any)?.exercises) ? (payload as any).exercises : Array.isArray(payload) ? payload : [];
    const seen = new Set(existingKeys);
    const exercises: NormalizedImportedExercise[] = [];
    let skipped = 0;

    for (const row of rows) {
        const normalized = normalizeExercise(row);
        const keys = duplicateKeys(normalized);
        if (keys.some((key) => seen.has(key))) {
            skipped += 1;
            continue;
        }
        keys.forEach((key) => seen.add(key));
        exercises.push(normalized);
    }

    return { exercises, skipped };
}

export function duplicateKeys(exercise: Pick<NormalizedImportedExercise, "originalName" | "sourceUrl" | "slug">) {
    return [
        exercise.originalName ? `original:${exercise.originalName.toLowerCase()}` : "",
        exercise.sourceUrl ? `source:${exercise.sourceUrl.toLowerCase()}` : "",
        `slug:${exercise.slug}`
    ].filter(Boolean);
}

function normalizeExercise(row: ImportedExerciseInput): NormalizedImportedExercise {
    const sourceName = clean(row.sourceName) || "ExRx.net";
    const originalName = clean(row.originalName) || clean(row.name) || "Imported exercise";
    const displayName = stripSourcePrefix(clean(row.name) || originalName);
    const category = clean(row.category) || normalizeMuscleGroup(row.primaryMuscleGroup, row.category, originalName);
    const primaryMuscleGroup = normalizeMuscleGroup(row.primaryMuscleGroup, row.category, originalName);
    const movementPattern = normalizeMovementPattern(row.movementPattern, category, originalName);
    const equipment = normalizeEquipment(row.equipment, originalName);

    return {
        slug: createSlug(`${sourceName}-${originalName}`),
        name: displayName,
        aliases: uniqueStrings([...(Array.isArray(row.aliases) ? row.aliases : []), originalName]),
        primaryMuscleGroup,
        secondaryMuscleGroups: normalizeMuscleList(row.secondaryMuscleGroups),
        movementPattern,
        equipment,
        category,
        difficulty: normalizeDifficulty(row.difficulty),
        description: clean(row.description) || `${displayName} — вправа з джерела ${sourceName}. Перевіряй техніку за оригінальним джерелом перед додаванням у тренування.`,
        techniqueSteps: cleanList(row.techniqueSteps),
        commonMistakes: cleanList(row.commonMistakes),
        safetyTips: cleanList(row.safetyTips),
        mediaUrl: null,
        mediaType: "none",
        isCustom: false,
        createdByUserId: null,
        sourceName,
        sourceUrl: clean(row.sourceUrl) || null,
        originalName,
        licenseStatus: clean(row.licenseStatus) || "permission_required",
        mediaReferences: Array.isArray(row.mediaReferences) ? row.mediaReferences : [],
        sourceImportedAt: parseDate(row.importedAt || row.updatedAt)
    };
}

function normalizeMuscleList(values?: string[]) {
    return uniqueStrings((values || []).map((value) => normalizeMuscleGroup(value)));
}

function normalizeMuscleGroup(value = "", category = "", originalName = "") {
    const text = `${value} ${category} ${originalName}`.toLowerCase();
    if (/(chest|pector|pec\b|sternal|clavicular)/.test(text)) return "Груди";
    if (/(back|lat|teres|trap|rhomboid|row)/.test(text)) return "Спина";
    if (/(delt|shoulder|front delt|side delt|rear delt)/.test(text)) return "Плечі";
    if (/triceps/.test(text)) return "Трицепс";
    if (/(biceps|brachialis|curl)/.test(text)) return "Біцепс";
    if (/(forearm|wrist|grip)/.test(text)) return "Передпліччя";
    if (/(quad|thigh|leg extension)/.test(text)) return "Квадрицепс";
    if (/(hamstring|leg curl)/.test(text)) return "Задня поверхня стегна";
    if (/(glute|hip)/.test(text)) return "Сідниці";
    if (/(calf|gastrocnemius|soleus)/.test(text)) return "Литки";
    if (/(ab|oblique|waist|core)/.test(text)) return "Прес";
    if (/(neck)/.test(text)) return "Шия";
    return value && value !== "Full Body" ? clean(value) : "Все тіло";
}

function normalizeEquipment(value = "", originalName = "") {
    const text = `${value} ${originalName}`.toLowerCase();
    if (/barbell|bb\b/.test(text)) return "Штанга";
    if (/dumbbell|db\b/.test(text)) return "Гантелі";
    if (/cable|pulley/.test(text)) return "Блок";
    if (/lever|machine|sled|smith/.test(text)) return "Тренажер";
    if (/body\s?weight|self|assisted/.test(text)) return "Вага тіла";
    if (/kettlebell/.test(text)) return "Гиря";
    if (/band/.test(text)) return "Еспандер";
    if (/medicine/.test(text)) return "Медбол";
    return clean(value) || "Інше";
}

function normalizeMovementPattern(value = "", category = "", originalName = "") {
    const text = `${value} ${category} ${originalName}`.toLowerCase();
    if (/cardio|walk|run|cycle|bike|treadmill/.test(text)) return "Кардіо";
    if (/squat|lunge|step-up|leg press/.test(text)) return "Присідання";
    if (/deadlift|hinge|pull-through|good morning/.test(text)) return "Hinge";
    if (/row/.test(text)) return "Горизонтальна тяга";
    if (/pulldown|pull-up|chin-up/.test(text)) return "Вертикальна тяга";
    if (/military|overhead|shoulder press|vertical press/.test(text)) return "Вертикальний жим";
    if (/press|bench|dip|push-up/.test(text)) return "Горизонтальний жим";
    if (/raise|fly|abduction/.test(text)) return "Підйом";
    if (/curl|flexion/.test(text)) return "Згинання";
    if (/extension|pushdown/.test(text)) return "Розгинання";
    if (/rotation|twist|crunch|sit-up|plank/.test(text)) return "Кор";
    return clean(value) || "Ізоляція";
}

function normalizeDifficulty(value = "") {
    const text = value.toLowerCase();
    if (/advanced|expert/.test(text)) return "Просунутий";
    if (/beginner|basic|easy/.test(text)) return "Початковий";
    return "Середній";
}

function stripSourcePrefix(value: string) {
    return value.replace(/^ExRx\.net\s*:\s*/i, "").trim();
}

function createSlug(value: string) {
    return value.toLowerCase().trim().replace(/[^a-z0-9а-яіїєґ]+/gi, "-").replace(/^-|-$/g, "").slice(0, 90);
}

function clean(value?: string | null) {
    return String(value || "").trim();
}

function cleanList(values?: string[]) {
    return uniqueStrings((values || []).map(clean).filter(Boolean));
}

function uniqueStrings(values: string[]) {
    return [...new Set(values.map(clean).filter(Boolean))];
}

function parseDate(value?: string) {
    const date = value ? new Date(value) : new Date();
    return Number.isNaN(date.getTime()) ? new Date() : date;
}

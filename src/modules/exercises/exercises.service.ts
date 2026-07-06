import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { Exercise, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { RequestUser } from "../../shared/current-user.decorator";
import { isAdminUser, tierOf } from "../../shared/admin";
import { assertExerciseQuota } from "../../shared/exercise-quota";
import { CreateExerciseDto, UpdateExerciseDto } from "./dto/exercise.dto";

const curatedExercises = [
    {
        slug: "bench-press",
        name: "Жим лежачи",
        aliases: ["Bench Press", "Barbell Bench", "Flat Bench"],
        primaryMuscleGroup: "Груди",
        secondaryMuscleGroups: ["Трицепс", "Плечі"],
        movementPattern: "Горизонтальний жим",
        equipment: "Штанга",
        category: "Сила",
        difficulty: "Середній",
        description: "Жим лежачи — базова вправа для грудей. Тримай стабільні лопатки, контрольовану траєкторію і повторюваний сетап.",
        techniqueSteps: ["Зафіксуй стопи, лопатки і хват.", "Опускай штангу контрольовано до нижньої частини грудей.", "Вичавлюй штангу без втрати позиції плечей."],
        commonMistakes: ["Відрив таза від лавки.", "Нестабільні лопатки.", "Відбивання штанги від грудей."],
        safetyTips: ["Працюй зі страхуванням на важких підходах.", "Не жертвуй амплітудою заради ваги."]
    },
    {
        slug: "lat-pulldown",
        name: "Тяга верхнього блока",
        aliases: ["Lat Pulldown", "Pulldown"],
        primaryMuscleGroup: "Спина",
        secondaryMuscleGroups: ["Біцепс"],
        movementPattern: "Вертикальна тяга",
        equipment: "Блок",
        category: "Гіпертрофія",
        difficulty: "Початковий",
        description: "Тяга верхнього блока — базова вертикальна тяга для спини. Веди рух ліктями вниз і не перетворюй сет на ривок корпусом.",
        techniqueSteps: ["Сядь щільно, зафіксуй коліна і нейтральний корпус.", "Почни рух депресією лопаток і веди лікті вниз.", "Поверни руків'я контрольовано без втрати натягу."],
        commonMistakes: ["Надмірний нахил корпусу назад.", "Тяга руками без роботи спини.", "Коротка неконтрольована амплітуда."],
        safetyTips: ["Не тягни руків'я за голову.", "Обирай вагу, з якою можеш контролювати негативну фазу."]
    }
] as const;

// Extra hand-picked catalog exercises (chest / back / triceps / biceps / shoulders
// / forearms / calves) with fitnessprogramer.com animation gifs. Seeded once per
// instance via ensureExtraExercises() — create-missing ONLY, so it never touches
// or overwrites existing exercises, templates or standards (unlike the curated
// reset path). Muscle-group names match the frontend's filter icons.
const FP = "https://fitnessprogramer.com/wp-content/uploads";
const extraCuratedExercises = [
    {
        slug: "smith-bench-press", name: "Жим Сміта лежачи", aliases: ["Smith Machine Bench Press"],
        primaryMuscleGroup: "Груди", secondaryMuscleGroups: ["Трицепс", "Плечі"],
        movementPattern: "Горизонтальний жим", equipment: "Тренажер Сміта", category: "Сила", difficulty: "Середній",
        description: "Жим у машині Сміта: фіксована траєкторія дозволяє безпечно навантажити груди без страхувальника.",
        techniqueSteps: ["Ляж так, щоб гриф опускався на середину грудей.", "Опускай контрольовано, злегка торкаючись грудей.", "Вичавлюй угору, не блокуючи лікті жорстко."],
        commonMistakes: ["Занадто високе положення грифа над шиєю.", "Відрив таза від лавки."],
        safetyTips: ["Перевір висоту стоперів перед підходом.", "Не жертвуй амплітудою заради ваги."],
        mediaUrl: `${FP}/2021/06/Smith-Machine-Bench-Press.gif`
    },
    {
        slug: "smith-incline-bench-press", name: "Жим Сміта під кутом", aliases: ["Incline Smith Machine Bench Press"],
        primaryMuscleGroup: "Груди", secondaryMuscleGroups: ["Плечі", "Трицепс"],
        movementPattern: "Похилий жим", equipment: "Тренажер Сміта", category: "Гіпертрофія", difficulty: "Середній",
        description: "Похилий жим у Сміті акцентує верх грудей і передню дельту при стабільній траєкторії.",
        techniqueSteps: ["Встанови лавку під кутом 30–45°.", "Опускай гриф до верху грудей.", "Вичавлюй угору по фіксованій траєкторії."],
        commonMistakes: ["Надто крутий кут (переходить у плечі).", "Ривок із нижньої точки."],
        safetyTips: ["Тримай лопатки зведеними.", "Контролюй негативну фазу."],
        mediaUrl: `${FP}/2021/06/Smith-Machine-Incline-Bench-Press.gif`
    },
    {
        slug: "incline-dumbbell-press", name: "Жим гантелей під кутом", aliases: ["Incline Dumbbell Press"],
        primaryMuscleGroup: "Груди", secondaryMuscleGroups: ["Плечі", "Трицепс"],
        movementPattern: "Похилий жим", equipment: "Гантелі", category: "Гіпертрофія", difficulty: "Середній",
        description: "Жим гантелей на похилій лавці дає більшу амплітуду і навантажує верх грудей.",
        techniqueSteps: ["Сядь на лавку 30–45°, гантелі на рівні грудей.", "Жени гантелі вгору й трохи всередину.", "Опускай контрольовано до розтягнення грудей."],
        commonMistakes: ["Занадто широке зведення ліктів.", "Стук гантелей угорі."],
        safetyTips: ["Починай із помірної ваги для контролю.", "Не роняй гантелі в нижній точці."],
        mediaUrl: `${FP}/2021/02/Incline-Dumbbell-Press.gif`
    },
    {
        slug: "dumbbell-fly", name: "Розведення гантелей лежачи", aliases: ["Dumbbell Fly", "Разводка"],
        primaryMuscleGroup: "Груди", secondaryMuscleGroups: ["Плечі"],
        movementPattern: "Зведення", equipment: "Гантелі", category: "Ізоляція", difficulty: "Початковий",
        description: "Ізоляція грудних через зведення-розведення. Акцент на розтягненні й скороченні, а не на вазі.",
        techniqueSteps: ["Ляж, гантелі над грудьми, лікті трохи зігнуті.", "Розводь по дузі до легкого розтягнення.", "Зводь гантелі, стискаючи груди."],
        commonMistakes: ["Прямі лікті (перевантаження суглоба).", "Завелика вага замість техніки."],
        safetyTips: ["Не опускай гантелі надто низько.", "Тримай фіксований кут у ліктях."],
        mediaUrl: `${FP}/2021/02/Dumbbell-Fly.gif`
    },
    {
        slug: "chest-dips", name: "Віджимання на брусах", aliases: ["Chest Dips"],
        primaryMuscleGroup: "Груди", secondaryMuscleGroups: ["Трицепс", "Плечі"],
        movementPattern: "Горизонтальний жим", equipment: "Власна вага", category: "Сила", difficulty: "Середній",
        description: "Віджимання на брусах з нахилом корпусу вперед — потужна базова вправа для низу грудей і трицепса.",
        techniqueSteps: ["Нахили корпус трохи вперед.", "Опускайся, доки плечі не будуть паралельні підлозі.", "Вичавлюй угору, не блокуючи лікті."],
        commonMistakes: ["Надто глибокий провал у плечах.", "Ривки замість контролю."],
        safetyTips: ["Не опускайся нижче комфортної амплітуди плеча.", "Додавай вагу поясом лише після освоєння техніки."],
        mediaUrl: `${FP}/2021/06/Chest-Dips.gif`
    },
    {
        slug: "barbell-bent-over-row", name: "Тяга штанги в нахилі", aliases: ["Barbell Bent-Over Row"],
        primaryMuscleGroup: "Спина", secondaryMuscleGroups: ["Біцепс", "Плечі"],
        movementPattern: "Горизонтальна тяга", equipment: "Штанга", category: "Сила", difficulty: "Середній",
        description: "Базова горизонтальна тяга для товщини спини. Тримай нейтральну спину й веди рух ліктями.",
        techniqueSteps: ["Нахилися з рівною спиною під ~45°.", "Тягни штангу до низу живота, зводячи лопатки.", "Опускай контрольовано без округлення спини."],
        commonMistakes: ["Округлення попереку.", "Тяга ривком корпусу."],
        safetyTips: ["Тримай прес напруженим для захисту попереку.", "Не гнись у спині під вагою."],
        mediaUrl: `${FP}/2021/02/Barbell-Bent-Over-Row.gif`
    },
    {
        slug: "one-arm-dumbbell-row", name: "Тяга гантелі однією рукою", aliases: ["One-Arm Dumbbell Row"],
        primaryMuscleGroup: "Спина", secondaryMuscleGroups: ["Біцепс"],
        movementPattern: "Горизонтальна тяга", equipment: "Гантелі", category: "Гіпертрофія", difficulty: "Початковий",
        description: "Одностороння тяга з опорою на лавку — велика амплітуда й акцент на широчайших.",
        techniqueSteps: ["Обіприся коліном і рукою на лавку.", "Тягни гантель до пояса, ведучи ліктем.", "Опускай до повного розтягнення широчайшого."],
        commonMistakes: ["Розворот корпусу для допомоги.", "Тяга біцепсом замість спини."],
        safetyTips: ["Тримай спину рівною й паралельною підлозі.", "Не роби ривків у нижній точці."],
        mediaUrl: `${FP}/2021/02/Dumbbell-Row.gif`
    },
    {
        slug: "t-bar-row", name: "Тяга Т-грифа", aliases: ["T-Bar Row"],
        primaryMuscleGroup: "Спина", secondaryMuscleGroups: ["Біцепс"],
        movementPattern: "Горизонтальна тяга", equipment: "Штанга", category: "Гіпертрофія", difficulty: "Середній",
        description: "Тяга Т-грифа навантажує середину спини з великою вагою при стабільному положенні корпусу.",
        techniqueSteps: ["Стань над грифом, нахилися з рівною спиною.", "Тягни руків'я до грудей, зводячи лопатки.", "Опускай контрольовано, зберігаючи натяг."],
        commonMistakes: ["Випрямлення корпусу ривком.", "Округлення спини."],
        safetyTips: ["Тримай нейтральну спину протягом усього руху.", "Не бери надмірну вагу на шкоду техніці."],
        mediaUrl: `${FP}/2021/04/t-bar-rows.gif`
    },
    {
        slug: "barbell-curl", name: "Підйом штанги на біцепс", aliases: ["Barbell Curl"],
        primaryMuscleGroup: "Біцепс", secondaryMuscleGroups: ["Передпліччя"],
        movementPattern: "Згинання", equipment: "Штанга", category: "Гіпертрофія", difficulty: "Початковий",
        description: "Класична базова вправа на біцепс. Тримай лікті нерухомими й уникай розгойдування.",
        techniqueSteps: ["Візьми штангу хватом на ширині плечей.", "Згинай руки, тримаючи лікті на місці.", "Опускай контрольовано до повного випрямлення."],
        commonMistakes: ["Розгойдування корпусом.", "Рух ліктів уперед."],
        safetyTips: ["Не читінгуй попереком.", "Контролюй негативну фазу."],
        mediaUrl: `${FP}/2021/02/Barbell-Curl.gif`
    },
    {
        slug: "hammer-curl", name: "Молотки з гантелями", aliases: ["Hammer Curl"],
        primaryMuscleGroup: "Біцепс", secondaryMuscleGroups: ["Передпліччя"],
        movementPattern: "Згинання", equipment: "Гантелі", category: "Гіпертрофія", difficulty: "Початковий",
        description: "Згинання нейтральним хватом — акцент на брахіалісі й передпліччі, товщина руки.",
        techniqueSteps: ["Тримай гантелі нейтральним хватом (долоні всередину).", "Згинай руки, не обертаючи кисть.", "Опускай контрольовано."],
        commonMistakes: ["Розгойдування.", "Занадто швидкий темп."],
        safetyTips: ["Тримай лікті притиснутими до корпусу.", "Не кидай гантелі вниз."],
        mediaUrl: `${FP}/2021/02/Hammer-Curl.gif`
    },
    {
        slug: "reverse-barbell-curl", name: "Підйом штанги зворотним хватом", aliases: ["Reverse Barbell Curl"],
        primaryMuscleGroup: "Біцепс", secondaryMuscleGroups: ["Передпліччя"],
        movementPattern: "Згинання", equipment: "Штанга", category: "Ізоляція", difficulty: "Середній",
        description: "Згинання прямим (зворотним) хватом навантажує брахіаліс і передпліччя — сила хвату й товщина руки.",
        techniqueSteps: ["Візьми штангу верхнім хватом.", "Згинай руки, тримаючи зап'ястя прямими.", "Опускай контрольовано."],
        commonMistakes: ["Згинання зап'ясть.", "Читінг корпусом."],
        safetyTips: ["Бери меншу вагу, ніж у звичайному підйомі.", "Тримай лікті нерухомими."],
        mediaUrl: `${FP}/2021/02/Barbell-Reverse-Curl.gif`
    },
    {
        slug: "bench-dips", name: "Зворотні віджимання від лавки", aliases: ["Bench Dips"],
        primaryMuscleGroup: "Трицепс", secondaryMuscleGroups: ["Груди", "Плечі"],
        movementPattern: "Розгинання", equipment: "Власна вага", category: "Сила", difficulty: "Початковий",
        description: "Зворотні віджимання від лавки — доступна базова вправа на трицепс власною вагою.",
        techniqueSteps: ["Обіприся руками на край лавки.", "Опускайся, згинаючи лікті до ~90°.", "Вичавлюй угору трицепсом."],
        commonMistakes: ["Занадто глибокий провал (навантаження плеча).", "Розведення ліктів у сторони."],
        safetyTips: ["Тримай лікті напрямленими назад.", "Не опускайся нижче комфортної амплітуди."],
        mediaUrl: `${FP}/2021/02/Bench-Dips.gif`
    },
    {
        slug: "rope-pushdown", name: "Розгинання на блоці з канатом", aliases: ["Rope Pushdown", "Triceps Pushdown"],
        primaryMuscleGroup: "Трицепс", secondaryMuscleGroups: [],
        movementPattern: "Розгинання", equipment: "Блок", category: "Ізоляція", difficulty: "Початковий",
        description: "Розгинання рук на верхньому блоці з канатом — ізоляція трицепса з розведенням у нижній точці.",
        techniqueSteps: ["Візьми канат, лікті притисни до корпусу.", "Розгинай руки донизу, розводячи кінці канату.", "Повертай контрольовано, зберігаючи натяг."],
        commonMistakes: ["Рух ліктями вперед-назад.", "Нахил корпусу для допомоги."],
        safetyTips: ["Тримай лікті на місці.", "Не використовуй інерцію."],
        mediaUrl: `${FP}/2021/06/Rope-Pushdown.gif`
    },
    {
        slug: "dumbbell-shoulder-press", name: "Жим гантелей сидячи", aliases: ["Seated Dumbbell Shoulder Press"],
        primaryMuscleGroup: "Плечі", secondaryMuscleGroups: ["Трицепс"],
        movementPattern: "Вертикальний жим", equipment: "Гантелі", category: "Сила", difficulty: "Середній",
        description: "Базовий вертикальний жим на дельти сидячи. Стабільний корпус і повна амплітуда.",
        techniqueSteps: ["Сядь із опорою на спинку, гантелі на рівні вух.", "Жени гантелі вгору, не блокуючи лікті жорстко.", "Опускай контрольовано до рівня вух."],
        commonMistakes: ["Прогин у попереку.", "Стук гантелей угорі."],
        safetyTips: ["Тримай прес напруженим.", "Не заводь гантелі надто далеко за голову."],
        mediaUrl: `${FP}/2021/02/Dumbbell-Shoulder-Press.gif`
    },
    {
        slug: "dumbbell-lateral-raise", name: "Махи гантелями в сторони", aliases: ["Dumbbell Lateral Raise"],
        primaryMuscleGroup: "Плечі", secondaryMuscleGroups: [],
        movementPattern: "Розведення", equipment: "Гантелі", category: "Ізоляція", difficulty: "Початковий",
        description: "Ізоляція середньої дельти — ключова вправа для ширини плечей. Легка вага, чиста техніка.",
        techniqueSteps: ["Стань прямо, гантелі біля стегон.", "Піднімай руки в сторони до рівня плечей.", "Опускай повільно, контролюючи рух."],
        commonMistakes: ["Занадто велика вага з розгойдуванням.", "Підйом вище плечей."],
        safetyTips: ["Тримай легкий згин у ліктях.", "Не закидай гантелі інерцією."],
        mediaUrl: `${FP}/2021/02/Dumbbell-Lateral-Raise.gif`
    },
    {
        slug: "barbell-upright-row", name: "Тяга штанги до підборіддя", aliases: ["Barbell Upright Row"],
        primaryMuscleGroup: "Плечі", secondaryMuscleGroups: ["Трапеції", "Біцепс"],
        movementPattern: "Вертикальна тяга", equipment: "Штанга", category: "Гіпертрофія", difficulty: "Середній",
        description: "Вертикальна тяга штанги вздовж тіла навантажує середню дельту й трапецію.",
        techniqueSteps: ["Візьми штангу хватом трохи вужче плечей.", "Тягни вздовж тіла, ведучи ліктями вгору.", "Опускай контрольовано."],
        commonMistakes: ["Занадто вузький хват (навантаження зап'ясть).", "Підйом ліктів надто високо."],
        safetyTips: ["Не піднімай лікті вище плечей за дискомфорту.", "Тримай штангу близько до тіла."],
        mediaUrl: `${FP}/2021/02/barbell-uprightrow.gif`
    },
    {
        slug: "dumbbell-wrist-curl", name: "Згинання зап'ясть з гантелями", aliases: ["Dumbbell Wrist Curl"],
        primaryMuscleGroup: "Передпліччя", secondaryMuscleGroups: [],
        movementPattern: "Згинання", equipment: "Гантелі", category: "Ізоляція", difficulty: "Початковий",
        description: "Ізоляція згиначів передпліччя — сила хвату. Передпліччя лежать на стегнах або лавці.",
        techniqueSteps: ["Поклади передпліччя на стегна, кисті звисають.", "Згинай зап'ястя вгору гантелями.", "Опускай повільно до повного розтягнення."],
        commonMistakes: ["Рух усім передпліччям.", "Занадто велика вага."],
        safetyTips: ["Ізолюй лише зап'ястя.", "Працюй у повній, але комфортній амплітуді."],
        mediaUrl: `${FP}/2021/06/Dumbbell-Wrist-Curl.gif`
    },
    {
        slug: "standing-calf-raise", name: "Підйом на носки стоячи", aliases: ["Standing Calf Raise"],
        primaryMuscleGroup: "Литки", secondaryMuscleGroups: [],
        movementPattern: "Підйом на носки", equipment: "Тренажер", category: "Гіпертрофія", difficulty: "Початковий",
        description: "Базова вправа на литки стоячи (акцент на литковому м'язі). Повна амплітуда й пауза вгорі.",
        techniqueSteps: ["Стань носками на платформу, п'яти звисають.", "Піднімайся максимально високо на носки.", "Опускай п'яти нижче платформи до розтягнення."],
        commonMistakes: ["Коротка амплітуда.", "Пружинення без контролю."],
        safetyTips: ["Роби паузу у верхній точці.", "Не кидай п'яти вниз ривком."],
        mediaUrl: `${FP}/2021/06/Standing-Calf-Raise.gif`
    }
] as const;

@Injectable()
export class ExercisesService implements OnModuleInit {
    // Once we've confirmed the curated catalog is seeded we don't need to re-run the
    // lookup on every GET /exercises. Reset on cold start (new instance) and after a
    // catalog reset, so it self-heals.
    private curatedReady = false;
    private extraReady = false;
    private reactionTableReady = false;

    constructor(private readonly prisma: PrismaService) {}

    async onModuleInit() {
        await this.ensureReactionTable();
    }

    // Neon's pooled connection (pgbouncer) can't run `prisma db push`'s session-level
    // DDL, so the ExerciseReaction table was never created on deploy. Single DDL
    // statements DO work over the pooler, so create it idempotently here. Best-effort:
    // the reaction queries are already defensive if this somehow fails.
    private async ensureReactionTable() {
        if (this.reactionTableReady) {
            return;
        }
        try {
            await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ExerciseReaction" (
                "id" TEXT NOT NULL,
                "exerciseId" TEXT NOT NULL,
                "userId" TEXT NOT NULL,
                "type" TEXT NOT NULL,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "ExerciseReaction_pkey" PRIMARY KEY ("id"),
                CONSTRAINT "ExerciseReaction_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE,
                CONSTRAINT "ExerciseReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
            )`);
            await this.prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ExerciseReaction_exerciseId_userId_key" ON "ExerciseReaction"("exerciseId", "userId")`);
            await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ExerciseReaction_exerciseId_idx" ON "ExerciseReaction"("exerciseId")`);
            await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ExerciseReaction_userId_idx" ON "ExerciseReaction"("userId")`);
            this.reactionTableReady = true;
        } catch (error) {
            // best-effort — runtime reaction queries degrade gracefully if missing
        }
    }

    async findAll() {
        await this.ensureCuratedCatalogAvailable();
        await this.ensureExtraExercises();
        const exercises = await this.prisma.exercise.findMany({ orderBy: { name: "asc" } });
        const counts = await this.reactionCounts();
        return exercises.map((exercise) => ({
            ...exercise,
            likeCount: counts.get(exercise.id)?.likeCount || 0,
            dislikeCount: counts.get(exercise.id)?.dislikeCount || 0
        }));
    }

    // Aggregate like/dislike counts per exercise. Degrades to empty if the
    // ExerciseReaction table isn't there yet (pre-migration) so the catalog and
    // /export never 500 on a missing table.
    async reactionCounts() {
        const counts = new Map<string, { likeCount: number; dislikeCount: number }>();
        try {
            const grouped = await this.prisma.exerciseReaction.groupBy({ by: ["exerciseId", "type"], _count: { _all: true } });
            for (const row of grouped) {
                const entry = counts.get(row.exerciseId) || { likeCount: 0, dislikeCount: 0 };
                if (row.type === "like") {
                    entry.likeCount = row._count._all;
                } else if (row.type === "dislike") {
                    entry.dislikeCount = row._count._all;
                }
                counts.set(row.exerciseId, entry);
            }
        } catch (error) {
            // table missing / not migrated yet — fall back to no counts
        }
        return counts;
    }

    // Map of { exerciseId: "like" | "dislike" } for the current user (for the UI
    // state + the liked-first sort). Kept separate from the cached public catalog.
    async getMyReactions(user: RequestUser) {
        const map: Record<string, string> = {};
        try {
            const rows = await this.prisma.exerciseReaction.findMany({
                where: { userId: user.id },
                select: { exerciseId: true, type: true }
            });
            for (const row of rows) {
                map[row.exerciseId] = row.type;
            }
        } catch (error) {
            // table missing / not migrated yet — no reactions
        }
        return map;
    }

    // Set, change, or clear (type "none") the current user's reaction; returns the
    // exercise's fresh counts so the client can reconcile its optimistic update.
    async react(user: RequestUser, id: string, type: string) {
        if (type !== "none" && type !== "like" && type !== "dislike") {
            throw new BadRequestException("Reaction type must be like, dislike or none");
        }
        await this.ensureReactionTable();
        await this.findOne(id);
        try {
            if (type === "none") {
                await this.prisma.exerciseReaction.deleteMany({ where: { exerciseId: id, userId: user.id } });
            } else {
                try {
                    await this.prisma.exerciseReaction.upsert({
                        where: { exerciseId_userId: { exerciseId: id, userId: user.id } },
                        update: { type },
                        create: { exerciseId: id, userId: user.id, type }
                    });
                } catch (error) {
                    // Two concurrent first-time reactions can race the upsert's
                    // read→insert and hit the unique constraint; on conflict just update.
                    if ((error as { code?: string })?.code === "P2002") {
                        await this.prisma.exerciseReaction.update({
                            where: { exerciseId_userId: { exerciseId: id, userId: user.id } },
                            data: { type }
                        });
                    } else {
                        throw error;
                    }
                }
            }
            const [likeCount, dislikeCount] = await Promise.all([
                this.prisma.exerciseReaction.count({ where: { exerciseId: id, type: "like" } }),
                this.prisma.exerciseReaction.count({ where: { exerciseId: id, type: "dislike" } })
            ]);
            return { id, likeCount, dislikeCount, myReaction: type === "none" ? null : type };
        } catch (error) {
            // Reaction table not migrated yet / transient DB issue — don't 500;
            // report zeros so the client reverts its optimistic update cleanly.
            return { id, likeCount: 0, dislikeCount: 0, myReaction: null };
        }
    }

    async findOne(id: string) {
        const exercise = await this.prisma.exercise.findUnique({ where: { id } });
        if (!exercise) {
            throw new NotFoundException("Exercise not found");
        }
        return exercise;
    }

    async create(user: RequestUser, dto: CreateExerciseDto) {
        // Tiered: free 1/month, PRO up to 30 total, admin unlimited (handled inside).
        await assertExerciseQuota(this.prisma, user.id, tierOf(user));
        // Admins (zshkarrr@gmail.com et al.) publish instantly; everyone else lands
        // in the moderation queue until an admin approves.
        const status = isAdminUser(user) ? "approved" : "pending";
        return this.prisma.exercise.create({
            data: {
                slug: this.slugify(dto.name),
                ...dto,
                aliases: dto.aliases || [],
                secondaryMuscleGroups: dto.secondaryMuscleGroups || [],
                techniqueSteps: dto.techniqueSteps || [],
                commonMistakes: dto.commonMistakes || [],
                safetyTips: dto.safetyTips || [],
                isCustom: true,
                status,
                createdByUserId: user.id
            }
        });
    }

    async update(user: RequestUser, id: string, dto: UpdateExerciseDto) {
        const exercise = await this.findOne(id);
        const admin = isAdminUser(user);
        if (!admin && exercise.createdByUserId && exercise.createdByUserId !== user.id) {
            throw new ForbiddenException("Cannot edit another user's exercise");
        }

        // Admin edits stay approved; a regular owner editing their exercise sends it
        // back to the moderation queue.
        const status = admin ? "approved" : "pending";

        return this.prisma.exercise.update({
            where: { id },
            data: {
                ...dto,
                aliases: dto.aliases,
                secondaryMuscleGroups: dto.secondaryMuscleGroups,
                techniqueSteps: dto.techniqueSteps,
                commonMistakes: dto.commonMistakes,
                safetyTips: dto.safetyTips,
                status
            }
        });
    }

    async remove(user: RequestUser, id: string) {
        const exercise = await this.findOne(id);
        const admin = isAdminUser(user);
        if (!admin && exercise.createdByUserId !== user.id) {
            throw new ForbiddenException("Only the owner or an admin can delete this exercise");
        }

        // The exercise is referenced by workout entries and templates with
        // onDelete: Restrict, so an in-use exercise would otherwise throw an FK error
        // (500). Remove the dependents first (sets cascade from workoutExercise;
        // personal records & strength standards cascade from the exercise). Batch-array
        // $transaction keeps it pooler-safe.
        await this.prisma.$transaction([
            this.prisma.workoutSet.deleteMany({ where: { workoutExercise: { exerciseId: id } } }),
            this.prisma.workoutExercise.deleteMany({ where: { exerciseId: id } }),
            this.prisma.workoutTemplateExercise.deleteMany({ where: { exerciseId: id } }),
            this.prisma.exercise.delete({ where: { id } })
        ]);
        return { ok: true };
    }

    async findPending(user: RequestUser) {
        this.assertAdmin(user);
        return this.prisma.exercise.findMany({
            where: { status: "pending" },
            orderBy: { updatedAt: "desc" }
        });
    }

    async approve(user: RequestUser, id: string) {
        this.assertAdmin(user);
        await this.findOne(id);
        return this.prisma.exercise.update({ where: { id }, data: { status: "approved" } });
    }

    async reject(user: RequestUser, id: string) {
        this.assertAdmin(user);
        await this.findOne(id);
        await this.prisma.exercise.delete({ where: { id } });
        return { ok: true };
    }

    private assertAdmin(user: RequestUser) {
        if (!isAdminUser(user)) {
            throw new ForbiddenException("Admin access required");
        }
    }

    async resetCuratedCatalog(user: RequestUser) {
        this.assertCatalogOwner(user);
        // Force the next GET /exercises to re-verify the curated catalog.
        this.curatedReady = false;

        return this.prisma.$transaction(async (transaction) => {
            const before = await transaction.exercise.count();
            const curated: Exercise[] = [];

            for (const exercise of curatedExercises) {
                curated.push(await transaction.exercise.upsert({
                    where: { slug: exercise.slug },
                    update: this.curatedExerciseData(exercise),
                    create: this.curatedExerciseData(exercise)
                }));
            }

            const curatedIds = curated.map((exercise) => exercise.id);
            await transaction.workoutSet.deleteMany({ where: { workoutExercise: { exerciseId: { notIn: curatedIds } } } });
            await transaction.workoutExercise.deleteMany({ where: { exerciseId: { notIn: curatedIds } } });
            await transaction.workoutTemplateExercise.deleteMany();
            await transaction.workoutTemplate.deleteMany({ where: { userId: null } });
            await transaction.personalRecord.deleteMany({ where: { exerciseId: { notIn: curatedIds } } });
            await transaction.strengthStandard.deleteMany();
            await transaction.exercise.deleteMany({ where: { id: { notIn: curatedIds } } });

            await this.createCuratedTemplates(transaction, curated);
            await this.createCuratedStandards(transaction, curated);

            return {
                ok: true,
                before,
                after: curated.length,
                removed: Math.max(0, before - curated.length),
                exercises: curated.map((exercise) => ({ id: exercise.id, slug: exercise.slug, name: exercise.name }))
            };
        });
    }

    private curatedExerciseData(exercise: (typeof curatedExercises)[number]): Prisma.ExerciseUncheckedCreateInput {
        return {
            slug: exercise.slug,
            name: exercise.name,
            aliases: [...exercise.aliases],
            primaryMuscleGroup: exercise.primaryMuscleGroup,
            secondaryMuscleGroups: [...exercise.secondaryMuscleGroups],
            movementPattern: exercise.movementPattern,
            equipment: exercise.equipment,
            category: exercise.category,
            difficulty: exercise.difficulty,
            description: exercise.description,
            techniqueSteps: [...exercise.techniqueSteps],
            commonMistakes: [...exercise.commonMistakes],
            safetyTips: [...exercise.safetyTips],
            mediaUrl: "",
            mediaType: "none",
            sourceName: null,
            sourceUrl: null,
            originalName: exercise.name,
            licenseStatus: null,
            mediaReferences: [],
            sourceImportedAt: null,
            isCustom: false,
            createdByUserId: null
        };
    }

    // Seed the extra hand-picked exercises (with gifs). Create-missing ONLY — never
    // updates or deletes existing rows, templates, or standards, so it's safe to run
    // on a live catalog and won't clobber admin edits. Idempotent by slug.
    private async ensureExtraExercises() {
        if (this.extraReady) {
            return;
        }
        const slugs = extraCuratedExercises.map((exercise) => exercise.slug);
        const existing = await this.prisma.exercise.findMany({
            where: { slug: { in: slugs } },
            select: { slug: true }
        });
        const existingSlugs = new Set(existing.map((exercise) => exercise.slug));
        const missing = extraCuratedExercises.filter((exercise) => !existingSlugs.has(exercise.slug));

        if (missing.length) {
            await this.prisma.exercise.createMany({
                data: missing.map((exercise) => ({
                    slug: exercise.slug,
                    name: exercise.name,
                    aliases: [...exercise.aliases],
                    primaryMuscleGroup: exercise.primaryMuscleGroup,
                    secondaryMuscleGroups: [...exercise.secondaryMuscleGroups],
                    movementPattern: exercise.movementPattern,
                    equipment: exercise.equipment,
                    category: exercise.category,
                    difficulty: exercise.difficulty,
                    description: exercise.description,
                    techniqueSteps: [...exercise.techniqueSteps],
                    commonMistakes: [...exercise.commonMistakes],
                    safetyTips: [...exercise.safetyTips],
                    mediaUrl: exercise.mediaUrl,
                    mediaType: "gif",
                    originalName: exercise.name,
                    isCustom: false,
                    status: "approved",
                    createdByUserId: null
                })),
                skipDuplicates: true
            });
        }
        this.extraReady = true;
    }

    private async ensureCuratedCatalogAvailable() {
        if (this.curatedReady) {
            return;
        }
        const existing = await this.prisma.exercise.findMany({
            where: { slug: { in: curatedExercises.map((exercise) => exercise.slug) } },
            select: { slug: true }
        });
        const existingSlugs = new Set(existing.map((exercise) => exercise.slug));
        const missingCuratedExercises = curatedExercises.filter((exercise) => !existingSlugs.has(exercise.slug));

        if (!missingCuratedExercises.length) {
            this.curatedReady = true;
            return;
        }

        await this.prisma.$transaction(async (transaction) => {
            const curated: Exercise[] = [];
            for (const exercise of curatedExercises) {
                curated.push(await transaction.exercise.upsert({
                    where: { slug: exercise.slug },
                    update: this.curatedExerciseData(exercise),
                    create: this.curatedExerciseData(exercise)
                }));
            }

            await transaction.strengthStandard.deleteMany();
            await this.createCuratedTemplates(transaction, curated);
            await this.createCuratedStandards(transaction, curated);
        });
        this.curatedReady = true;
    }

    private async createCuratedTemplates(transaction: Prisma.TransactionClient, curated: Array<{ id: string; slug: string }>) {
        await transaction.workoutTemplateExercise.deleteMany();
        await transaction.workoutTemplate.deleteMany({ where: { userId: null } });

        const bySlug = new Map(curated.map((exercise) => [exercise.slug, exercise]));
        const rows = [
            { type: "push", title: "Push", description: "Базовий жим для грудей.", slugs: ["bench-press"] },
            { type: "pull", title: "Pull", description: "Вертикальна тяга для спини.", slugs: ["lat-pulldown"] },
            { type: "upper", title: "Upper", description: "Компактна сесія верху.", slugs: ["bench-press", "lat-pulldown"] },
            { type: "full_body", title: "Full Body", description: "Мінімальна силова сесія з curated-каталогу.", slugs: ["bench-press", "lat-pulldown"] }
        ];

        for (const row of rows) {
            await transaction.workoutTemplate.create({
                data: {
                    title: row.title,
                    description: row.description,
                    type: row.type,
                    isPublic: true,
                    exercises: {
                        create: row.slugs.map((slug, index) => ({
                            exerciseId: bySlug.get(slug)!.id,
                            order: index + 1,
                            targetSets: 3,
                            targetReps: 8,
                            restSeconds: 90,
                            notes: "Підказка із curated-шаблону"
                        }))
                    }
                }
            });
        }
    }

    private async createCuratedStandards(transaction: Prisma.TransactionClient, curated: Array<{ id: string; slug: string }>) {
        const multipliers = new Map([
            ["bench-press", 1],
            ["lat-pulldown", 0.9]
        ]);
        const levels = [
            ["beginner", 0.45],
            ["novice", 0.7],
            ["third_class", 0.95],
            ["second_class", 1.15],
            ["first_class", 1.35],
            ["candidate_master", 1.55],
            ["master", 1.8]
        ] as const;

        for (const exercise of curated) {
            for (const gender of ["male", "female"]) {
                for (const [level, levelMultiplier] of levels) {
                    await transaction.strengthStandard.create({
                        data: {
                            exerciseId: exercise.id,
                            gender,
                            bodyweightMin: 70,
                            bodyweightMax: 90,
                            level,
                            requiredWeight: Math.round(80 * levelMultiplier * (multipliers.get(exercise.slug) || 1) * (gender === "female" ? 0.62 : 1)),
                            repetitions: 1,
                            sourceName: "Демо-нормативи",
                            sourceNote: "Демо-нормативи використовуються лише для прикладу. Їх можна оновити під реальні стандарти пізніше.",
                            isOfficial: false
                        }
                    });
                }
            }
        }
    }

    private assertCatalogOwner(user: RequestUser) {
        const adminEmails = String(process.env.ADMIN_EMAILS || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
        const demoOwnerEmail = String(process.env.DEMO_OWNER_EMAIL || "zshkarrr@gmail.com").trim().toLowerCase();
        const demoOwnerUserId = String(process.env.DEMO_OWNER_USER_ID || "").trim();
        const userEmail = String(user.email || "").trim().toLowerCase();

        if (adminEmails.includes(userEmail) || userEmail === demoOwnerEmail || (demoOwnerUserId && user.id === demoOwnerUserId)) {
            return;
        }

        throw new ForbiddenException("Only the demo owner can reset the exercise catalog");
    }

    private slugify(value: string) {
        return value.toLowerCase().trim().replace(/[^a-z0-9а-яіїєґ]+/gi, "-").replace(/^-|-$/g, "");
    }
}

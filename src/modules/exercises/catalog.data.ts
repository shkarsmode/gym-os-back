// The hand-picked exercise catalogue, and the one-off corrections made to the live one.
//
// `extraCuratedExercises` is what a catalogue SHOULD contain: seedCatalog() creates any of
// them that are missing (by slug or by name — see missingCatalogExercises), never updating
// or deleting a row, so it is safe against a live catalogue an admin has been editing. The
// animations come from fitnessprogramer.com; a static hold may use a still image instead.
//
// `CATALOG_MERGES` and `CATALOG_PATCHES` are corrections to rows that already exist. They
// are applied deliberately, from the command line (catalog-cli.ts), never on startup — and
// both are idempotent, so they can stay listed here after they have run.

// Mirrors gym-os-front/lib/constants.js (muscles / patterns / equipment). A value outside
// these lists cannot be shown by the exercise editor's selects, and saving any unrelated
// edit would then silently rewrite it — so the spec holds every catalogue row to them.
export const CATALOG_MUSCLES = ["Груди", "Спина", "Плечі", "Біцепс", "Трицепс", "Квадрицепс", "Задня поверхня стегна", "Сідниці", "Внутрішня поверхня стегна", "Литки", "Прес", "Передпліччя", "Все тіло"];
export const CATALOG_PATTERNS = ["Горизонтальний жим", "Похилий жим", "Вертикальний жим", "Горизонтальна тяга", "Вертикальна тяга", "Присідання", "Hinge", "Випад", "Згинання", "Розгинання", "Розведення", "Зведення", "Підйом", "Підйом на носки", "Перенесення", "Ротація", "Кор", "Кардіо"];
export const CATALOG_EQUIPMENT = ["Штанга", "Гантелі", "Тренажер", "Блок", "Вага тіла", "Тренажер Сміта", "Гиря", "Еспандер", "Інше"];

export interface CatalogExercise {
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
    mediaUrl: string;
    /** "gif" unless said otherwise — a static hold may only have a still image. */
    mediaType?: "gif" | "image";
    /** Static holds and timed carries: sets added from this exercise default to seconds. */
    isTimed?: boolean;
}

export const FP = "https://fitnessprogramer.com/wp-content/uploads";

export const extraCuratedExercises: CatalogExercise[] = [
    // ---- Груди ---------------------------------------------------------------------------
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
        movementPattern: "Горизонтальний жим", equipment: "Вага тіла", category: "Сила", difficulty: "Середній",
        description: "Віджимання на брусах з нахилом корпусу вперед — потужна базова вправа для низу грудей і трицепса.",
        techniqueSteps: ["Нахили корпус трохи вперед.", "Опускайся, доки плечі не будуть паралельні підлозі.", "Вичавлюй угору, не блокуючи лікті."],
        commonMistakes: ["Надто глибокий провал у плечах.", "Ривки замість контролю."],
        safetyTips: ["Не опускайся нижче комфортної амплітуди плеча.", "Додавай вагу поясом лише після освоєння техніки."],
        mediaUrl: `${FP}/2021/06/Chest-Dips.gif`
    },
    {
        slug: "decline-dumbbell-press", name: "Жим гантелей на лаві з від'ємним нахилом", aliases: ["Decline Dumbbell Press", "Жим гантелей головою вниз"],
        primaryMuscleGroup: "Груди", secondaryMuscleGroups: ["Трицепс", "Плечі"],
        movementPattern: "Горизонтальний жим", equipment: "Гантелі", category: "Гіпертрофія", difficulty: "Середній",
        description: "Жим гантелей головою вниз зміщує акцент на нижню частину грудей і дає більшу амплітуду, ніж штанга.",
        techniqueSteps: ["Зафіксуй ноги у валиках лави з нахилом 15–30° вниз.", "Опускай гантелі до низу грудей, лікті під кутом ~45° до корпусу.", "Вичавлюй угору, зводячи гантелі над грудьми."],
        commonMistakes: ["Надто крутий нахил лави.", "Лікті розведені строго в сторони."],
        safetyTips: ["Бери й віддавай гантелі з допомогою партнера або від стегон.", "Не затримуйся головою вниз між підходами."],
        mediaUrl: `${FP}/2021/02/Decline-Dumbbell-Press.gif`
    },
    {
        slug: "incline-push-up", name: "Віджимання з упором у лаву", aliases: ["Incline Push-Up", "Віджимання від лави", "Віджимання з підвищення"],
        primaryMuscleGroup: "Груди", secondaryMuscleGroups: ["Трицепс", "Плечі"],
        movementPattern: "Горизонтальний жим", equipment: "Вага тіла", category: "Гіпертрофія", difficulty: "Початковий",
        description: "Полегшені віджимання: руки на лаві чи іншій опорі, тож на них припадає менша частка ваги тіла.",
        techniqueSteps: ["Постав руки на край лави трохи ширше плечей.", "Тримай тіло прямою лінією від голови до п'ят.", "Опускайся грудьми до лави й відштовхуйся до прямих рук."],
        commonMistakes: ["Прогин у попереку.", "Лікті розведені в сторони під 90°."],
        safetyTips: ["Переконайся, що опора стійка й не ковзає.", "Ускладнюй, поступово знижуючи висоту опори."],
        mediaUrl: `${FP}/2021/06/Incline-Push-Up.gif`
    },
    {
        slug: "decline-push-up", name: "Віджимання з ногами на лаві", aliases: ["Decline Push-Up", "Віджимання з ногами на опорі"],
        primaryMuscleGroup: "Груди", secondaryMuscleGroups: ["Плечі", "Трицепс"],
        movementPattern: "Горизонтальний жим", equipment: "Вага тіла", category: "Гіпертрофія", difficulty: "Середній",
        description: "Ноги на підвищенні переносять більше ваги на руки й зміщують акцент на верх грудей і передню дельту.",
        techniqueSteps: ["Постав стопи на лаву, руки на підлогу трохи ширше плечей.", "Тримай корпус рівним, прес напружений.", "Опускайся майже до підлоги й вичавлюй себе вгору."],
        commonMistakes: ["Провисання таза.", "Неповна амплітуда."],
        safetyTips: ["Не закидай голову назад.", "Починай з невисокої опори."],
        mediaUrl: `${FP}/2015/07/Decline-Push-Up.gif`
    },
    {
        slug: "dumbbell-pullover", name: "Пуловер з гантеллю лежачи", aliases: ["Dumbbell Pullover", "Пуловер з гантелею"],
        primaryMuscleGroup: "Груди", secondaryMuscleGroups: ["Спина", "Трицепс"],
        movementPattern: "Вертикальна тяга", equipment: "Гантелі", category: "Ізоляція", difficulty: "Середній",
        description: "Класичний пуловер: гантель по дузі за голову розтягує груди й найширші м'язи спини.",
        techniqueSteps: ["Ляж на лаву, тримай гантель обома руками над грудьми.", "Опускай її по дузі за голову з ледь зігнутими ліктями.", "Повертай гантель над груди тією ж дугою, не згинаючи руки."],
        commonMistakes: ["Згинання ліктів — рух перетворюється на розгинання на трицепс.", "Сильний прогин у попереку в нижній точці."],
        safetyTips: ["Опускай лише до комфортного розтягнення плечей.", "Тримай гантель надійно за диск."],
        mediaUrl: `${FP}/2021/02/Dumbbell-Pullover.gif`
    },
    {
        slug: "incline-cable-fly", name: "Зведення рук у кросовері на похилій лаві", aliases: ["Incline Cable Fly"],
        primaryMuscleGroup: "Груди", secondaryMuscleGroups: ["Плечі"],
        movementPattern: "Зведення", equipment: "Блок", category: "Ізоляція", difficulty: "Середній",
        description: "Зведення на похилій лаві між нижніми блоками тримає верх грудей під натягом у всій амплітуді.",
        techniqueSteps: ["Постав похилу лаву між нижніми блоками й візьми руків'я.", "Розведи руки по дузі до розтягнення грудей, лікті злегка зігнуті.", "Зведи руки над верхом грудей, стискаючи м'язи."],
        commonMistakes: ["Жим замість зведення — лікті згинаються.", "Ривок з нижньої точки."],
        safetyTips: ["Не розводь руки нижче лінії плечей.", "Контролюй повернення руків'їв."],
        mediaUrl: `${FP}/2021/02/Incline-Cable-Fly.gif`
    },

    // ---- Спина ---------------------------------------------------------------------------
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
        // Named after the row that already holds this movement in the live catalogue, so the
        // seed recognises it instead of adding «Тяга Т-грифа» next to it a second time.
        slug: "t-bar-row", name: "Тяга Т-грифа в нахилі", aliases: ["T-Bar Row"],
        primaryMuscleGroup: "Спина", secondaryMuscleGroups: ["Біцепс"],
        movementPattern: "Горизонтальна тяга", equipment: "Штанга", category: "Гіпертрофія", difficulty: "Середній",
        description: "Тяга Т-грифа навантажує середину спини з великою вагою при стабільному положенні корпусу.",
        techniqueSteps: ["Стань над грифом, нахилися з рівною спиною.", "Тягни руків'я до грудей, зводячи лопатки.", "Опускай контрольовано, зберігаючи натяг."],
        commonMistakes: ["Випрямлення корпусу ривком.", "Округлення спини."],
        safetyTips: ["Тримай нейтральну спину протягом усього руху.", "Не бери надмірну вагу на шкоду техніці."],
        mediaUrl: `${FP}/2021/04/t-bar-rows.gif`
    },
    {
        slug: "barbell-shrug", name: "Шраги зі штангою", aliases: ["Barbell Shrug", "Знизування плечима зі штангою"],
        primaryMuscleGroup: "Спина", secondaryMuscleGroups: ["Плечі", "Передпліччя"],
        movementPattern: "Підйом", equipment: "Штанга", category: "Гіпертрофія", difficulty: "Початковий",
        description: "Шраги зі штангою навантажують верхню частину трапецієподібних м'язів великою вагою.",
        techniqueSteps: ["Тримай штангу перед стегнами хватом на ширині плечей.", "Піднімай плечі прямо вгору до вух.", "Затримайся на секунду й повільно опускай."],
        commonMistakes: ["Обертання плечима по колу.", "Згинання рук і допомога біцепсом."],
        safetyTips: ["Тримай голову нейтрально, не тягни шию вперед.", "Для важких підходів використовуй лямки."],
        mediaUrl: `${FP}/2021/02/Barbell-Shrug.gif`
    },
    {
        slug: "smith-machine-shrug", name: "Шраги в тренажері Сміта", aliases: ["Smith Machine Shrug"],
        primaryMuscleGroup: "Спина", secondaryMuscleGroups: ["Плечі"],
        movementPattern: "Підйом", equipment: "Тренажер Сміта", category: "Гіпертрофія", difficulty: "Початковий",
        description: "Шраги в Сміті: фіксована траєкторія дає змогу зосередитися на скороченні трапеції.",
        techniqueSteps: ["Стань під гриф Сміта й візьми його на ширині плечей.", "Зніми гриф з гаків і піднімай плечі вгору.", "Пауза вгорі й повільне опускання."],
        commonMistakes: ["Коротка амплітуда.", "Ривки корпусом."],
        safetyTips: ["Перевір, що гриф легко повертається на гаки.", "Не прогинайся в попереку."],
        mediaUrl: `${FP}/2021/10/smith-machine-shrug.gif`
    },
    {
        slug: "seated-row-machine", name: "Тяга в тренажері сидячи", aliases: ["Seated Row Machine", "Machine Row", "Горизонтальна тяга в тренажері"],
        primaryMuscleGroup: "Спина", secondaryMuscleGroups: ["Біцепс", "Плечі"],
        movementPattern: "Горизонтальна тяга", equipment: "Тренажер", category: "Гіпертрофія", difficulty: "Початковий",
        description: "Горизонтальна тяга з упором у груди: тренажер стабілізує корпус, тож працює саме спина.",
        techniqueSteps: ["Налаштуй сидіння так, щоб руків'я були на рівні середини грудей.", "Упрись грудьми в подушку й тягни руків'я до корпусу, ведучи лікті назад.", "Зведи лопатки й повільно відпусти до повного розтягнення."],
        commonMistakes: ["Відрив грудей від упору.", "Тяга руками без зведення лопаток."],
        safetyTips: ["Не округлюй плечі вперед наприкінці повторення.", "Тримай шию нейтрально."],
        mediaUrl: `${FP}/2021/02/Seated-Row-Machine.gif`
    },
    {
        slug: "lever-high-row", name: "Тяга зверху у важільному тренажері", aliases: ["Lever High Row", "Hammer Strength High Row", "Тяга Хаммер зверху"],
        primaryMuscleGroup: "Спина", secondaryMuscleGroups: ["Біцепс", "Плечі"],
        movementPattern: "Вертикальна тяга", equipment: "Тренажер", category: "Гіпертрофія", difficulty: "Середній",
        description: "Тяга по діагоналі зверху вниз у важільному тренажері — щось середнє між тягою верхнього блока й горизонтальною тягою.",
        techniqueSteps: ["Сядь, закріпи коліна під валиками й візьми руків'я.", "Тягни руків'я вниз і назад, ведучи лікті вздовж корпусу.", "Повертай руки повільно до повного розтягнення."],
        commonMistakes: ["Відкидання корпусу назад.", "Неповна амплітуда вгорі."],
        safetyTips: ["Не випрямляй лікті ривком у верхній точці.", "Працюй однаково обома руками."],
        mediaUrl: `${FP}/2023/06/Lever-High-Row.gif`
    },
    {
        slug: "reverse-grip-barbell-row", name: "Тяга штанги в нахилі зворотним хватом", aliases: ["Reverse Grip Barbell Row", "Yates Row", "Тяга Єйтса"],
        primaryMuscleGroup: "Спина", secondaryMuscleGroups: ["Біцепс"],
        movementPattern: "Горизонтальна тяга", equipment: "Штанга", category: "Сила", difficulty: "Середній",
        description: "Тяга в нахилі хватом знизу: корпус вищий, лікті ближче до тіла — більше навантаження на низ найширших і біцепс.",
        techniqueSteps: ["Візьми штангу хватом знизу на ширині плечей і нахилися на 30–45°.", "Тягни штангу до низу живота, притискаючи лікті до корпусу.", "Опускай контрольовано, не втрачаючи нахилу."],
        commonMistakes: ["Випрямлення корпусу на кожному повторенні.", "Округлення спини."],
        safetyTips: ["Тримай прес напруженим і спину нейтральною.", "Не бери вагу, з якою починаєш смикати."],
        mediaUrl: `${FP}/2021/04/Reverse-Grip-Barbell-Row.gif`
    },
    {
        slug: "bent-over-dumbbell-row", name: "Тяга гантелей у нахилі", aliases: ["Bent Over Dumbbell Row", "Тяга двох гантелей у нахилі"],
        primaryMuscleGroup: "Спина", secondaryMuscleGroups: ["Біцепс", "Плечі"],
        movementPattern: "Горизонтальна тяга", equipment: "Гантелі", category: "Гіпертрофія", difficulty: "Середній",
        description: "Тяга двох гантелей одночасно в нахилі — аналог тяги штанги з вільнішою траєкторією для плечей.",
        techniqueSteps: ["Нахилися з рівною спиною, гантелі звисають під плечима.", "Тягни гантелі до пояса, зводячи лопатки.", "Опускай повільно до прямих рук."],
        commonMistakes: ["Округлення попереку.", "Ривки корпусом."],
        safetyTips: ["Тримай коліна злегка зігнутими.", "Не задирай голову — шия в нейтралі."],
        mediaUrl: `${FP}/2021/02/Bent-Over-Dumbbell-Row.gif`
    },
    {
        slug: "rack-pull", name: "Тяга з плінтів", aliases: ["Rack Pull", "Тяга з упорів", "Часткова станова тяга"],
        primaryMuscleGroup: "Спина", secondaryMuscleGroups: ["Сідниці", "Задня поверхня стегна", "Передпліччя"],
        movementPattern: "Hinge", equipment: "Штанга", category: "Сила", difficulty: "Середній",
        description: "Станова тяга з підвищення (плінтів або упорів рами): коротша амплітуда, більша вага, акцент на спину й хват.",
        techniqueSteps: ["Постав штангу на упори на рівні колін або трохи нижче.", "Візьми гриф, напруж спину й прес.", "Виведи таз уперед до повного випрямлення й повільно поверни штангу на упори."],
        commonMistakes: ["Округлення спини під великою вагою.", "Перерозгинання в попереку вгорі."],
        safetyTips: ["Опускай штангу на упори контрольовано, не кидай.", "Використовуй лямки, якщо хват здається раніше за спину."],
        mediaUrl: `${FP}/2023/08/barbell-rack-pull.gif`
    },
    {
        slug: "superman", name: "Супермен", aliases: ["Superman", "Човник на животі", "Розгинання спини лежачи"],
        primaryMuscleGroup: "Спина", secondaryMuscleGroups: ["Сідниці"],
        movementPattern: "Розгинання", equipment: "Вага тіла", category: "Ізоляція", difficulty: "Початковий",
        description: "Розгиначі спини без обладнання: лежачи на животі, одночасно піднімаєш руки й ноги.",
        techniqueSteps: ["Ляж на живіт, руки витягнуті вперед.", "Одночасно підніми руки, груди й ноги від підлоги.", "Затримайся на 1–2 секунди й плавно опустись."],
        commonMistakes: ["Закидання голови назад.", "Ривки замість контрольованого підйому."],
        safetyTips: ["Піднімай лише до комфортної висоти.", "Тримай сідниці напруженими."],
        mediaUrl: `${FP}/2021/02/Superman-exercise.gif`
    },

    // ---- Плечі ---------------------------------------------------------------------------
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
        // Named after the live row for this movement (see t-bar-row above).
        slug: "dumbbell-lateral-raise", name: "Махи гантелей через сторони", aliases: ["Dumbbell Lateral Raise", "Махи гантелями в сторони"],
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
        primaryMuscleGroup: "Плечі", secondaryMuscleGroups: ["Спина", "Біцепс"],
        movementPattern: "Вертикальна тяга", equipment: "Штанга", category: "Гіпертрофія", difficulty: "Середній",
        description: "Вертикальна тяга штанги вздовж тіла навантажує середню дельту й трапецію.",
        techniqueSteps: ["Візьми штангу хватом трохи вужче плечей.", "Тягни вздовж тіла, ведучи ліктями вгору.", "Опускай контрольовано."],
        commonMistakes: ["Занадто вузький хват (навантаження зап'ясть).", "Підйом ліктів надто високо."],
        safetyTips: ["Не піднімай лікті вище плечей за дискомфорту.", "Тримай штангу близько до тіла."],
        mediaUrl: `${FP}/2021/02/barbell-uprightrow.gif`
    },
    {
        slug: "dumbbell-front-raise", name: "Підйом гантелей перед собою", aliases: ["Dumbbell Front Raise", "Фронтальні підйоми гантелей", "Махи гантелями вперед"],
        primaryMuscleGroup: "Плечі", secondaryMuscleGroups: ["Груди"],
        movementPattern: "Підйом", equipment: "Гантелі", category: "Ізоляція", difficulty: "Початковий",
        description: "Ізоляція передньої дельти: гантелі по черзі або разом піднімаються перед собою до рівня плечей.",
        techniqueSteps: ["Стань рівно, гантелі перед стегнами.", "Піднімай гантель майже прямою рукою до рівня плечей.", "Опускай повільно й повтори іншою рукою."],
        commonMistakes: ["Розгойдування корпусом.", "Підйом вище рівня очей."],
        safetyTips: ["Тримай лікті ледь зігнутими.", "Обирай легку вагу — передня дельта й так багато працює в жимах."],
        mediaUrl: `${FP}/2021/06/Alternating-Dumbbell-Front-Raise.gif`
    },
    {
        slug: "barbell-front-raise", name: "Підйом штанги перед собою", aliases: ["Barbell Front Raise"],
        primaryMuscleGroup: "Плечі", secondaryMuscleGroups: ["Груди"],
        movementPattern: "Підйом", equipment: "Штанга", category: "Ізоляція", difficulty: "Початковий",
        description: "Підйом штанги перед собою прямими руками — передня дельта працює обома руками синхронно.",
        techniqueSteps: ["Візьми штангу хватом зверху на ширині плечей.", "Піднімай її прямими руками до рівня плечей.", "Повільно опускай до стегон."],
        commonMistakes: ["Закидання штанги інерцією.", "Прогин у попереку."],
        safetyTips: ["Напружуй прес і сідниці, щоб не відхилятися назад.", "Почни з порожнього або EZ-грифа."],
        mediaUrl: `${FP}/2021/02/Barbell-Front-Raise.gif`
    },
    {
        slug: "weight-plate-front-raise", name: "Підйом диска перед собою", aliases: ["Plate Front Raise", "Підйом млинця перед собою"],
        primaryMuscleGroup: "Плечі", secondaryMuscleGroups: ["Груди"],
        movementPattern: "Підйом", equipment: "Інше", category: "Ізоляція", difficulty: "Початковий",
        description: "Підйом диска (млинця) обома руками перед собою — простий варіант для передньої дельти.",
        techniqueSteps: ["Тримай диск за краї на рівні стегон.", "Піднімай його прямими руками до рівня очей.", "Повільно опускай."],
        commonMistakes: ["Розгойдування корпусом.", "Згинання рук у ліктях."],
        safetyTips: ["Тримай диск міцно за обидва краї.", "Не піднімай вище голови, якщо з'являється дискомфорт у плечах."],
        mediaUrl: `${FP}/2021/04/Weight-Plate-Front-Raise-1.gif`
    },
    {
        slug: "smith-machine-shoulder-press", name: "Жим Сміта сидячи", aliases: ["Smith Machine Shoulder Press", "Жим у Сміті на плечі"],
        primaryMuscleGroup: "Плечі", secondaryMuscleGroups: ["Трицепс"],
        movementPattern: "Вертикальний жим", equipment: "Тренажер Сміта", category: "Сила", difficulty: "Середній",
        description: "Жим над головою в машині Сміта: стабільна траєкторія дає змогу безпечно працювати важко без страхувальника.",
        techniqueSteps: ["Постав лавку з вертикальною спинкою під гриф.", "Опускай гриф до рівня підборіддя або верху грудей.", "Вичавлюй угору до майже прямих рук."],
        commonMistakes: ["Лавка стоїть так, що гриф іде на обличчя.", "Сильний прогин у попереку."],
        safetyTips: ["Встанови стопери трохи нижче нижньої точки.", "Не блокуй лікті жорстко вгорі."],
        mediaUrl: `${FP}/2021/02/Smith-Machine-Shoulder-Press.gif`
    },
    {
        slug: "seated-behind-neck-press", name: "Жим штанги з-за голови сидячи", aliases: ["Behind the Neck Press", "Жим з-за голови"],
        primaryMuscleGroup: "Плечі", secondaryMuscleGroups: ["Трицепс"],
        movementPattern: "Вертикальний жим", equipment: "Штанга", category: "Сила", difficulty: "Просунутий",
        description: "Жим з-за голови сильніше навантажує середню дельту, але вимагає доброї рухливості плечей.",
        techniqueSteps: ["Сядь на лавку з вертикальною спинкою, штанга на трапеціях.", "Опускай гриф за голову до рівня мочок вух.", "Вичавлюй вертикально вгору."],
        commonMistakes: ["Опускання грифа надто низько на шию.", "Висунута вперед голова."],
        safetyTips: ["Роби вправу лише за безболісної рухливості плечей.", "Працюй з помірною вагою в силовій рамі."],
        mediaUrl: `${FP}/2021/05/Seated-Behind-the-Neck-Press.gif`
    },
    {
        slug: "standing-dumbbell-shoulder-press", name: "Жим гантелей стоячи", aliases: ["Standing Dumbbell Shoulder Press", "Standing Dumbbell Overhead Press"],
        primaryMuscleGroup: "Плечі", secondaryMuscleGroups: ["Трицепс", "Прес"],
        movementPattern: "Вертикальний жим", equipment: "Гантелі", category: "Сила", difficulty: "Середній",
        description: "Жим гантелей над головою стоячи: окрім дельт, увесь корпус працює як стабілізатор.",
        techniqueSteps: ["Стань на ширині плечей, гантелі на рівні плечей.", "Вичавлюй гантелі вгору, не прогинаючись у попереку.", "Опускай контрольовано до плечей."],
        commonMistakes: ["Прогин спини й відхилення назад.", "Допомога ногами (поштовх)."],
        safetyTips: ["Напружуй прес і сідниці.", "Не розводь лікті строго в сторони."],
        mediaUrl: `${FP}/2023/09/Standing-Dumbbell-Overhead-Press.gif`
    },
    {
        slug: "lateral-raise-machine", name: "Махи в сторони в тренажері", aliases: ["Lateral Raise Machine", "Machine Lateral Raise", "Розведення рук у тренажері на дельти"],
        primaryMuscleGroup: "Плечі", secondaryMuscleGroups: [],
        movementPattern: "Розведення", equipment: "Тренажер", category: "Ізоляція", difficulty: "Початковий",
        description: "Ізоляція середньої дельти: тренажер тримає однаковий опір по всій амплітуді й не дає читерити.",
        techniqueSteps: ["Налаштуй сидіння так, щоб плечі були на рівні осі тренажера.", "Розводь руки в сторони до рівня плечей.", "Опускай повільно, не кидаючи вагу."],
        commonMistakes: ["Підйом плечей до вух.", "Ривки й удари стеком."],
        safetyTips: ["Тримай корпус притиснутим до спинки.", "Обирай вагу на 12–20 повторень."],
        mediaUrl: `${FP}/2021/06/Lateral-Raise-Machine.gif`
    },
    {
        slug: "cable-rear-delt-fly", name: "Розведення в кросовері на задню дельту", aliases: ["Cable Rear Delt Fly", "Reverse Cable Fly", "Зворотне зведення в кросовері"],
        primaryMuscleGroup: "Плечі", secondaryMuscleGroups: ["Спина"],
        movementPattern: "Розведення", equipment: "Блок", category: "Ізоляція", difficulty: "Середній",
        description: "Зворотне розведення з верхніх блоків навхрест — постійний натяг на задню дельту.",
        techniqueSteps: ["Встанови блоки на рівні плечей і візьми троси навхрест.", "Розводь руки в сторони й назад, ведучи ліктями.", "Повертай руки повільно до перехрестя."],
        commonMistakes: ["Зведення лопаток — тягне спина замість дельт.", "Згинання ліктів."],
        safetyTips: ["Тримай лікті м'яко зігнутими.", "Не відхиляйся корпусом назад."],
        mediaUrl: `${FP}/2021/02/cable-rear-delt-fly.gif`
    },
    {
        slug: "push-press", name: "Жимовий швунг", aliases: ["Push Press", "Швунг жимовий"],
        primaryMuscleGroup: "Плечі", secondaryMuscleGroups: ["Трицепс", "Квадрицепс", "Прес"],
        movementPattern: "Вертикальний жим", equipment: "Штанга", category: "Сила", difficulty: "Просунутий",
        description: "Жим штанги над головою з поштовхом ногами: можна підняти більше, ніж у строгому жимі, і розвивати вибухову силу.",
        techniqueSteps: ["Тримай штангу на передніх дельтах, хват трохи ширше плечей.", "Зроби короткий підсід і різко випрямся, виштовхуючи штангу вгору.", "Дотисни штангу руками над головою й опусти на груди."],
        commonMistakes: ["Глибокий присід замість короткого підсіду.", "Штанга йде вперед від обличчя."],
        safetyTips: ["Опускай штангу на груди, амортизуючи колінами.", "Освоюй техніку з легкою вагою."],
        mediaUrl: `${FP}/2021/02/push-press-1.gif`
    },
    {
        slug: "pike-push-up", name: "Віджимання щучкою", aliases: ["Pike Push-Up", "Віджимання на плечі"],
        primaryMuscleGroup: "Плечі", secondaryMuscleGroups: ["Трицепс"],
        movementPattern: "Вертикальний жим", equipment: "Вага тіла", category: "Сила", difficulty: "Середній",
        description: "Віджимання з тазом угорі переносять навантаження на плечі — домашній аналог жиму над головою.",
        techniqueSteps: ["Стань у позицію перевернутої V: таз угорі, руки на ширині плечей.", "Згинай руки, опускаючи голову до підлоги перед кистями.", "Вичавлюй себе назад угору."],
        commonMistakes: ["Таз опускається — виходять звичайні віджимання.", "Лікті розходяться в сторони."],
        safetyTips: ["Опускай голову повільно й контрольовано.", "Ускладнюй, піднімаючи ноги на лаву."],
        mediaUrl: `${FP}/2021/06/Pike-Push-up.gif`
    },

    // ---- Біцепс --------------------------------------------------------------------------
    {
        // Named after the live row for this movement (see t-bar-row above).
        slug: "barbell-curl", name: "Біцепс зі штангою", aliases: ["Barbell Curl", "Підйом штанги на біцепс", "EZ Bar Curl"],
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
        slug: "dumbbell-curl", name: "Згинання рук з гантелями стоячи", aliases: ["Dumbbell Curl", "Біцепс з гантелями", "Підйом гантелей на біцепс"],
        primaryMuscleGroup: "Біцепс", secondaryMuscleGroups: ["Передпліччя"],
        movementPattern: "Згинання", equipment: "Гантелі", category: "Ізоляція", difficulty: "Початковий",
        description: "Базова вправа на біцепс з гантелями — одночасно або по черзі, з розворотом кисті долонею вгору.",
        techniqueSteps: ["Стань рівно, гантелі в опущених руках, лікті біля корпусу.", "Згинай руки, розвертаючи долоні вгору.", "Повільно опускай до повного випрямлення."],
        commonMistakes: ["Розгойдування корпусом.", "Лікті виходять уперед."],
        safetyTips: ["Не відхиляйся назад, щоб закинути вагу.", "Повністю розгинай руки внизу."],
        mediaUrl: `${FP}/2021/02/Dumbbell-Curl.gif`
    },
    {
        slug: "dumbbell-preacher-curl", name: "Згинання на лаві Скотта з гантеллю", aliases: ["Dumbbell Preacher Curl", "Скотт з гантеллю"],
        primaryMuscleGroup: "Біцепс", secondaryMuscleGroups: ["Передпліччя"],
        movementPattern: "Згинання", equipment: "Гантелі", category: "Ізоляція", difficulty: "Початковий",
        description: "Згинання однією рукою на лаві Скотта: упор не дає допомагати корпусом, тож біцепс працює ізольовано.",
        techniqueSteps: ["Поклади плече на подушку лави Скотта, гантель у руці.", "Згинай руку до повного скорочення біцепса.", "Опускай повільно, не розгинаючи лікоть ривком."],
        commonMistakes: ["Відрив плеча від подушки.", "Кидання гантелі вниз."],
        safetyTips: ["Не розгинай руку різко в нижній точці.", "Обирай вагу, яку контролюєш у негативній фазі."],
        mediaUrl: `${FP}/2021/02/Dumbbell-Preacher-Curl.gif`
    },
    {
        slug: "bicep-curl-machine", name: "Згинання рук у тренажері", aliases: ["Machine Biceps Curl", "Bicep Curl Machine", "Біцепс у тренажері"],
        primaryMuscleGroup: "Біцепс", secondaryMuscleGroups: [],
        movementPattern: "Згинання", equipment: "Тренажер", category: "Ізоляція", difficulty: "Початковий",
        description: "Згинання рук у тренажері зі стабільним упором — зручно доводити біцепс до відмови без ризику.",
        techniqueSteps: ["Налаштуй сидіння так, щоб лікті лежали на подушці на осі обертання.", "Згинай руки до повного скорочення.", "Повертай руків'я повільно."],
        commonMistakes: ["Лікті не на осі тренажера.", "Ривки й неповна амплітуда."],
        safetyTips: ["Не розгинай лікті з ударом унизу.", "Тримай спину притиснутою."],
        mediaUrl: `${FP}/2021/09/Bicep-Curl-Machine.gif`
    },

    // ---- Трицепс -------------------------------------------------------------------------
    {
        slug: "bench-dips", name: "Зворотні віджимання від лавки", aliases: ["Bench Dips"],
        primaryMuscleGroup: "Трицепс", secondaryMuscleGroups: ["Груди", "Плечі"],
        movementPattern: "Розгинання", equipment: "Вага тіла", category: "Сила", difficulty: "Початковий",
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
        slug: "dumbbell-kickback", name: "Розгинання руки з гантеллю в нахилі", aliases: ["Dumbbell Kickback", "Кікбек з гантеллю", "Трицепс у нахилі"],
        primaryMuscleGroup: "Трицепс", secondaryMuscleGroups: [],
        movementPattern: "Розгинання", equipment: "Гантелі", category: "Ізоляція", difficulty: "Початковий",
        description: "Кікбек: плече нерухоме й паралельне підлозі, а розгинання в лікті ізольовано навантажує трицепс.",
        techniqueSteps: ["Обіприся рукою й коліном на лаву, плече притисни до корпусу.", "Розгинай руку назад до повного випрямлення.", "Повільно поверни передпліччя вниз."],
        commonMistakes: ["Рух плечем замість ліктя.", "Розмах і інерція."],
        safetyTips: ["Тримай спину рівною.", "Бери легку вагу — це вправа на скорочення, а не на силу."],
        mediaUrl: `${FP}/2021/02/Dumbbell-Kickback.gif`
    },
    {
        slug: "cable-tricep-kickback", name: "Розгинання руки в кросовері в нахилі", aliases: ["Cable Triceps Kickback", "Кікбек у кросовері"],
        primaryMuscleGroup: "Трицепс", secondaryMuscleGroups: [],
        movementPattern: "Розгинання", equipment: "Блок", category: "Ізоляція", difficulty: "Початковий",
        description: "Кікбек з нижнього блока: трос тримає трицепс під натягом навіть у верхній точці.",
        techniqueSteps: ["Візьми руків'я нижнього блока й нахилися вперед.", "Притисни плече до корпусу й розгинай руку назад.", "Повільно поверни передпліччя."],
        commonMistakes: ["Плече рухається разом з передпліччям.", "Корпус розгойдується."],
        safetyTips: ["Тримай рівну спину в нахилі.", "Працюй плавно, без ривків."],
        mediaUrl: `${FP}/2021/02/Cable-Tricep-Kickback.gif`
    },
    {
        slug: "seated-dumbbell-triceps-extension", name: "Французький жим з гантеллю сидячи", aliases: ["Seated Dumbbell Triceps Extension", "Розгинання гантелі з-за голови двома руками", "Французький жим сидячи"],
        primaryMuscleGroup: "Трицепс", secondaryMuscleGroups: [],
        movementPattern: "Розгинання", equipment: "Гантелі", category: "Ізоляція", difficulty: "Початковий",
        description: "Розгинання однієї гантелі з-за голови двома руками — розтягує й навантажує довгу головку трицепса.",
        techniqueSteps: ["Сядь на лавку зі спинкою, тримай гантель обома руками над головою.", "Опускай гантель за голову, згинаючи лікті.", "Розгинай руки вгору, не розводячи лікті."],
        commonMistakes: ["Лікті розходяться в сторони.", "Прогин у попереку."],
        safetyTips: ["Тримай гантель надійно за диск.", "Опускай повільно — гантель проходить біля шиї."],
        mediaUrl: `${FP}/2021/06/Seated-Dumbbell-Triceps-Extension.gif`
    },
    {
        slug: "triceps-dip-machine", name: "Віджимання в тренажері на трицепс", aliases: ["Triceps Dip Machine", "Seated Dip Machine", "Бруси в тренажері"],
        primaryMuscleGroup: "Трицепс", secondaryMuscleGroups: ["Груди", "Плечі"],
        movementPattern: "Вертикальний жим", equipment: "Тренажер", category: "Гіпертрофія", difficulty: "Початковий",
        description: "Тренажер, що імітує бруси сидячи: точна вага замість власної ваги тіла.",
        techniqueSteps: ["Сядь і візьми руків'я, лікті позаду.", "Тисни руків'я вниз до майже прямих рук.", "Повільно повертай до кута ~90° у ліктях."],
        commonMistakes: ["Підйом плечей до вух.", "Нахил корпусу вперед для допомоги."],
        safetyTips: ["Не опускайся глибше, ніж комфортно плечам.", "Тримай спину притиснутою."],
        mediaUrl: `${FP}/2021/09/Triceps-Dip-Machine.gif`
    },
    {
        slug: "triceps-extension-machine", name: "Розгинання рук у тренажері", aliases: ["Triceps Extension Machine", "Трицепс у тренажері"],
        primaryMuscleGroup: "Трицепс", secondaryMuscleGroups: [],
        movementPattern: "Розгинання", equipment: "Тренажер", category: "Ізоляція", difficulty: "Початковий",
        description: "Розгинання рук у тренажері з упором для ліктів — ізоляція трицепса з постійним опором.",
        techniqueSteps: ["Налаштуй сидіння, лікті на подушці на осі обертання.", "Розгинай руки до повного випрямлення.", "Повертай повільно до згинання."],
        commonMistakes: ["Лікті відриваються від подушки.", "Ривок на старті."],
        safetyTips: ["Не розгинай лікті з ударом.", "Обирай вагу на 10–15 повторень."],
        mediaUrl: `${FP}/2021/09/Triceps-Extension-Machine.gif`
    },
    {
        slug: "assisted-chest-dip", name: "Віджимання на брусах у гравітроні", aliases: ["Assisted Dip", "Assisted Chest Dip", "Бруси з противагою"],
        primaryMuscleGroup: "Трицепс", secondaryMuscleGroups: ["Груди", "Плечі"],
        movementPattern: "Вертикальний жим", equipment: "Тренажер", category: "Гіпертрофія", difficulty: "Початковий",
        description: "Бруси з противагою: тренажер забирає частину ваги тіла, тож можна відпрацювати техніку й набрати повторення.",
        techniqueSteps: ["Налаштуй противагу й стань колінами на платформу.", "Опускайся до кута ~90° у ліктях, корпус трохи вперед.", "Вичавлюй себе вгору до майже прямих рук."],
        commonMistakes: ["Надто глибоке опускання.", "Плечі тягнуться до вух."],
        safetyTips: ["Більша противага — легше; зменшуй її поступово.", "Сходь з платформи обережно, коли вона внизу."],
        mediaUrl: `${FP}/2021/06/Assisted-Chest-Dip.gif`
    },

    // ---- Передпліччя ---------------------------------------------------------------------
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
        slug: "wrist-roller", name: "Ролик для зап'ясть", aliases: ["Wrist Roller", "Намотування вантажу на ролик"],
        primaryMuscleGroup: "Передпліччя", secondaryMuscleGroups: ["Плечі"],
        movementPattern: "Згинання", equipment: "Інше", category: "Ізоляція", difficulty: "Початковий",
        description: "Намотування вантажу на мотузці на палицю — передпліччя працюють до сильного забивання.",
        techniqueSteps: ["Тримай ролик на прямих руках перед собою.", "Почергово прокручуй ролик, намотуючи мотузку.", "Так само контрольовано розмотуй вниз."],
        commonMistakes: ["Опускання рук під час намотування.", "Швидке розмотування з падінням вантажу."],
        safetyTips: ["Почни з легкого диска.", "Опусти руки трохи нижче, якщо першими втомлюються плечі."],
        mediaUrl: `${FP}/2021/08/wrist-roller.gif`
    },
    {
        slug: "hand-gripper", name: "Кистьовий еспандер", aliases: ["Hand Gripper", "Еспандер для кисті"],
        primaryMuscleGroup: "Передпліччя", secondaryMuscleGroups: [],
        movementPattern: "Згинання", equipment: "Еспандер", category: "Ізоляція", difficulty: "Початковий",
        description: "Стискання кистьового еспандера тренує силу хвату — корисно для тяг і висів.",
        techniqueSteps: ["Візьми еспандер так, щоб руків'я лежали в долоні й на пальцях.", "Стисни до зіткнення руків'їв.", "Повільно розтисни."],
        commonMistakes: ["Неповне стискання.", "Ривкове відпускання."],
        safetyTips: ["Підбирай жорсткість, з якою виконуєш 8–15 повторень.", "Зроби перерву, якщо болять суглоби пальців."],
        mediaUrl: `${FP}/2022/01/Hand-Gripper.gif`
    },

    // ---- Прес ----------------------------------------------------------------------------
    {
        slug: "sit-ups", name: "Підйом тулуба лежачи", aliases: ["Sit-Up", "Сіт-ап", "Підйом корпусу"],
        primaryMuscleGroup: "Прес", secondaryMuscleGroups: [],
        movementPattern: "Кор", equipment: "Вага тіла", category: "Ізоляція", difficulty: "Початковий",
        description: "Класичний підйом тулуба з положення лежачи до сидячого — прес і згиначі стегна.",
        techniqueSteps: ["Ляж на спину, ноги зігнуті, стопи на підлозі.", "Піднімай корпус до сидячого положення, скручуючись від голови.", "Повільно повертайся на спину."],
        commonMistakes: ["Ривки руками за голову.", "Падіння спиною на підлогу."],
        safetyTips: ["Не тягни шию руками.", "Закріпи стопи, якщо вони відриваються."],
        mediaUrl: `${FP}/2021/02/Sit-ups.gif`
    },
    {
        slug: "decline-sit-up", name: "Скручування на похилій лаві", aliases: ["Decline Sit-Up", "Decline Crunch", "Прес на похилій лаві"],
        primaryMuscleGroup: "Прес", secondaryMuscleGroups: [],
        movementPattern: "Кор", equipment: "Вага тіла", category: "Гіпертрофія", difficulty: "Середній",
        description: "Підйом корпусу на лаві головою вниз — більша амплітуда й навантаження, ніж на підлозі.",
        techniqueSteps: ["Зафіксуй ноги у валиках похилої лави.", "Скручуйся вгору, підводячи груди до колін.", "Повільно опускайся, не падаючи на лаву."],
        commonMistakes: ["Ривок інерцією.", "Прогин у попереку внизу."],
        safetyTips: ["Тримай підборіддя трохи прибраним.", "Додавай вагу лише після 15+ чистих повторень."],
        mediaUrl: `${FP}/2021/05/Decline-Sit-up.gif`
    },
    {
        slug: "seated-crunch-machine", name: "Скручування в тренажері", aliases: ["Ab Crunch Machine", "Machine Crunch", "Прес у тренажері"],
        primaryMuscleGroup: "Прес", secondaryMuscleGroups: [],
        movementPattern: "Кор", equipment: "Тренажер", category: "Гіпертрофія", difficulty: "Початковий",
        description: "Скручування з опором у тренажері: прогресуєш вагою, як у будь-якій силовій вправі.",
        techniqueSteps: ["Налаштуй сидіння й візьми руків'я.", "Скручуйся вперед, наближаючи груди до таза.", "Повільно повертайся, не кидаючи вагу."],
        commonMistakes: ["Тягнеш руками замість пресу.", "Неповна амплітуда."],
        safetyTips: ["Не бери надмірну вагу — рух має йти від пресу.", "Видихай на скручуванні."],
        mediaUrl: `${FP}/2021/09/Seated-Crunch-Machine.gif`
    },
    {
        slug: "dumbbell-side-bend", name: "Нахили в сторони з гантеллю", aliases: ["Dumbbell Side Bend", "Бічні нахили з гантеллю"],
        primaryMuscleGroup: "Прес", secondaryMuscleGroups: [],
        movementPattern: "Кор", equipment: "Гантелі", category: "Ізоляція", difficulty: "Початковий",
        description: "Бічні нахили з гантеллю навантажують косі м'язи живота й квадратний м'яз попереку.",
        techniqueSteps: ["Стань рівно, гантель в одній руці.", "Нахиляйся в бік гантелі, не нахиляючись уперед.", "Повертайся вгору зусиллям протилежного боку."],
        commonMistakes: ["Гантелі в обох руках — вони врівноважують одна одну.", "Нахил уперед чи назад."],
        safetyTips: ["Рухайся повільно, без ривків.", "Не опускайся нижче комфортної амплітуди."],
        mediaUrl: `${FP}/2021/05/Dumbbell-Side-Bend.gif`
    },
    {
        slug: "hanging-leg-raise", name: "Підйом прямих ніг у висі", aliases: ["Hanging Leg Raise", "Підйом ніг на турніку"],
        primaryMuscleGroup: "Прес", secondaryMuscleGroups: ["Передпліччя"],
        movementPattern: "Кор", equipment: "Вага тіла", category: "Гіпертрофія", difficulty: "Просунутий",
        description: "Підйом прямих ніг у висі на перекладині — одна з найважчих вправ на нижню частину пресу.",
        techniqueSteps: ["Повисни на перекладині хватом на ширині плечей.", "Піднімай прямі ноги до горизонталі або вище, підкручуючи таз.", "Опускай повільно, не розгойдуючись."],
        commonMistakes: ["Розгойдування тіла.", "Ноги піднімаються без підкручування таза."],
        safetyTips: ["Почни з підйому колін, якщо прямі ноги не виходять.", "Використовуй лямки, якщо не тримає хват."],
        mediaUrl: `${FP}/2021/08/Hanging-Leg-Raises.gif`
    },
    {
        slug: "flutter-kicks", name: "Ножиці", aliases: ["Flutter Kicks", "Ножиці лежачи"],
        primaryMuscleGroup: "Прес", secondaryMuscleGroups: [],
        movementPattern: "Кор", equipment: "Вага тіла", category: "Ізоляція", difficulty: "Початковий", isTimed: true,
        description: "Почергові махи прямими ногами вгору-вниз лежачи на спині — витривалість нижньої частини пресу.",
        techniqueSteps: ["Ляж на спину, руки під сідницями, ноги трохи над підлогою.", "Почергово піднімай і опускай прямі ноги з невеликою амплітудою.", "Тримай поперек притиснутим до підлоги."],
        commonMistakes: ["Поперек відривається від підлоги.", "Затримка дихання."],
        safetyTips: ["Підніми ноги вище, якщо прогинається поперек.", "Дихай рівно."],
        mediaUrl: `${FP}/2021/02/Flutter-Kicks.gif`
    },
    {
        slug: "jackknife-sit-up", name: "Складка", aliases: ["V-Up", "Jackknife Sit-Up", "Книжка"],
        primaryMuscleGroup: "Прес", secondaryMuscleGroups: [],
        movementPattern: "Кор", equipment: "Вага тіла", category: "Гіпертрофія", difficulty: "Середній",
        description: "Одночасний підйом корпусу й прямих ніг, щоб дотягнутися руками до стоп, — інтенсивна вправа на весь прес.",
        techniqueSteps: ["Ляж на спину, руки витягнуті за головою.", "Одночасно піднімай корпус і прямі ноги, тягнучись руками до стоп.", "Повільно опускайся у вихідне положення."],
        commonMistakes: ["Ривок інерцією.", "Сильно зігнуті ноги."],
        safetyTips: ["Не падай спиною на підлогу.", "Зменш амплітуду, якщо тягне поперек."],
        mediaUrl: `${FP}/2021/02/Jackknife-Sit-ups.gif`
    },
    {
        slug: "toes-to-bar", name: "Носки до перекладини", aliases: ["Toes to Bar", "T2B"],
        primaryMuscleGroup: "Прес", secondaryMuscleGroups: ["Передпліччя", "Спина"],
        movementPattern: "Кор", equipment: "Вага тіла", category: "Функціональна", difficulty: "Просунутий",
        description: "З висі на перекладині піднімаєш ноги до торкання грифа носками — класика кросфіту для пресу й хвату.",
        techniqueSteps: ["Повисни на перекладині, хват на ширині плечей.", "Підкрути таз і підніми ноги, торкнувшись грифа носками.", "Контрольовано опусти ноги, гасячи розгойдування."],
        commonMistakes: ["Неконтрольоване розгойдування.", "Ноги не доходять до грифа."],
        safetyTips: ["Спершу освой підйом колін у висі.", "Не зістрибуй з перекладини ривком."],
        mediaUrl: `${FP}/2022/01/Toes-to-Bar.gif`
    },
    {
        slug: "l-sit", name: "Кут на брусах (L-sit)", aliases: ["L-Sit", "Куточок"],
        primaryMuscleGroup: "Прес", secondaryMuscleGroups: ["Трицепс", "Квадрицепс"],
        movementPattern: "Кор", equipment: "Вага тіла", category: "Сила", difficulty: "Просунутий", isTimed: true,
        description: "Статичне утримання прямих ніг під кутом 90° в упорі на руках — прес, згиначі стегна й трицепс.",
        techniqueSteps: ["Стань в упор на брусах або паралетах на прямих руках.", "Підніми прямі ноги паралельно підлозі.", "Утримуй положення, опустивши плечі."],
        commonMistakes: ["Плечі піднімаються до вух.", "Ноги опускаються нижче горизонталі."],
        safetyTips: ["Почни із зігнутих колін, якщо прямі ноги не виходять.", "Тримай лікті повністю прямими."],
        mediaUrl: `${FP}/2021/09/L-Sit.gif`
    },
    {
        slug: "hollow-hold", name: "Човник на спині", aliases: ["Hollow Hold", "Hollow Body Hold", "Банан"],
        primaryMuscleGroup: "Прес", secondaryMuscleGroups: [],
        movementPattern: "Кор", equipment: "Вага тіла", category: "Ізоляція", difficulty: "Середній", isTimed: true,
        description: "Статичне утримання човника лежачи на спині: руки й ноги над підлогою, поперек притиснутий.",
        techniqueSteps: ["Ляж на спину й притисни поперек до підлоги.", "Підніми плечі, прямі руки й ноги над підлогою.", "Утримуй положення, дихаючи рівно."],
        commonMistakes: ["Поперек відривається від підлоги.", "Затримка дихання."],
        safetyTips: ["Підніми ноги вище або зігни коліна, щоб полегшити.", "Зупинись, щойно поперек прогинається."],
        mediaUrl: `${FP}/2021/02/HollowHold.png`, mediaType: "image"
    },
    {
        slug: "stomach-vacuum", name: "Вакуум живота", aliases: ["Stomach Vacuum", "Вакуум"],
        primaryMuscleGroup: "Прес", secondaryMuscleGroups: [],
        movementPattern: "Кор", equipment: "Вага тіла", category: "Ізоляція", difficulty: "Початковий", isTimed: true,
        description: "Втягування живота на видиху з утриманням — тренує глибокий поперечний м'яз живота.",
        techniqueSteps: ["Стань рівно, руки на стегнах.", "Повністю видихни й максимально втягни живіт під ребра.", "Утримуй 15–30 секунд, потім вдихни й розслабся."],
        commonMistakes: ["Спроба втягнути живіт на вдиху.", "Напружені плечі й шия."],
        safetyTips: ["Роби на порожній шлунок.", "Припини, якщо паморочиться в голові."],
        mediaUrl: `${FP}/2025/05/Standing-Stomach-Vacuum.gif`
    },

    // ---- Квадрицепс ----------------------------------------------------------------------
    {
        slug: "bodyweight-squat", name: "Присідання з власною вагою", aliases: ["Bodyweight Squat", "Air Squat", "Присідання без ваги"],
        primaryMuscleGroup: "Квадрицепс", secondaryMuscleGroups: ["Сідниці"],
        movementPattern: "Присідання", equipment: "Вага тіла", category: "Гіпертрофія", difficulty: "Початковий",
        description: "Базове присідання без обладнання — розминка, робота на витривалість або старт для новачка.",
        techniqueSteps: ["Стань на ширині плечей, носки трохи врізнобіч.", "Опускайся, відводячи таз назад, до паралелі стегон із підлогою.", "Піднімайся, відштовхуючись усією стопою."],
        commonMistakes: ["Коліна завалюються всередину.", "П'яти відриваються від підлоги."],
        safetyTips: ["Тримай спину рівною, груди розкриті.", "Опускайся на комфортну глибину."],
        mediaUrl: `${FP}/2021/05/bodyweight-squat-full-version.gif`
    },
    {
        slug: "jump-squat", name: "Присідання з вистрибуванням", aliases: ["Jump Squat", "Стрибкові присідання"],
        primaryMuscleGroup: "Квадрицепс", secondaryMuscleGroups: ["Сідниці", "Литки"],
        movementPattern: "Присідання", equipment: "Вага тіла", category: "Функціональна", difficulty: "Середній",
        description: "Пліометричне присідання з вибуховим стрибком — потужність ніг і пульс.",
        techniqueSteps: ["Присядь до паралелі, руки перед собою.", "Вибухово вистрибни вгору.", "Приземляйся м'яко на носки й одразу переходь у наступне присідання."],
        commonMistakes: ["Жорстке приземлення на прямі ноги.", "Коліна завалюються всередину під час приземлення."],
        safetyTips: ["Приземляйся тихо, амортизуючи колінами.", "Не роби на втомлених ногах наприкінці тренування."],
        mediaUrl: `${FP}/2021/02/Jump-Squat.gif`
    },
    {
        slug: "dumbbell-walking-lunge", name: "Випади в русі з гантелями", aliases: ["Walking Lunge", "Dumbbell Walking Lunge", "Крокуючі випади"],
        primaryMuscleGroup: "Квадрицепс", secondaryMuscleGroups: ["Сідниці", "Задня поверхня стегна"],
        movementPattern: "Випад", equipment: "Гантелі", category: "Гіпертрофія", difficulty: "Середній",
        description: "Випади з кроком уперед через увесь зал — квадрицепс, сідниці й баланс.",
        techniqueSteps: ["Тримай гантелі в опущених руках.", "Зроби широкий крок уперед і опустись, доки заднє коліно майже торкнеться підлоги.", "Відштовхнись передньою ногою й крокуй далі іншою."],
        commonMistakes: ["Короткий крок — коліно далеко виходить за носок.", "Завалювання корпусу вперед."],
        safetyTips: ["Перевір, що попереду вільно.", "Тримай корпус вертикально."],
        mediaUrl: `${FP}/2023/09/dumbbell-lunges.gif`
    },
    {
        slug: "barbell-lunge", name: "Випади зі штангою", aliases: ["Barbell Lunge"],
        primaryMuscleGroup: "Квадрицепс", secondaryMuscleGroups: ["Сідниці", "Задня поверхня стегна"],
        movementPattern: "Випад", equipment: "Штанга", category: "Сила", difficulty: "Середній",
        description: "Випади зі штангою на плечах — важчий варіант для квадрицепса й сідниць.",
        techniqueSteps: ["Поклади штангу на трапеції й стань рівно.", "Зроби крок уперед і опустись до кута 90° в обох колінах.", "Повернись у стійку й повтори іншою ногою."],
        commonMistakes: ["Втрата балансу через постановку ніг в одну лінію.", "Нахил корпусу вперед."],
        safetyTips: ["Став ноги на ширині стегон, а не в одну лінію.", "Працюй у рамі або з легкою вагою, поки не відчуєш баланс."],
        mediaUrl: `${FP}/2021/05/Barbell-Lunge.gif`
    },
    {
        slug: "smith-machine-lunge", name: "Випади в тренажері Сміта", aliases: ["Smith Machine Lunge", "Smith Split Squat", "Спліт-присід у Сміті"],
        primaryMuscleGroup: "Квадрицепс", secondaryMuscleGroups: ["Сідниці"],
        movementPattern: "Випад", equipment: "Тренажер Сміта", category: "Гіпертрофія", difficulty: "Початковий",
        description: "Статичні випади в Сміті: гриф тримає баланс, тож можна зосередитися на роботі ноги.",
        techniqueSteps: ["Стань під гриф: одна нога попереду, друга позаду.", "Опускайся вертикально, доки заднє коліно майже торкнеться підлоги.", "Піднімайся зусиллям передньої ноги."],
        commonMistakes: ["Передня нога надто близько до грифа.", "Відштовхування задньою ногою."],
        safetyTips: ["Встанови стопери на безпечній висоті.", "Тримай корпус рівним."],
        mediaUrl: `${FP}/2022/07/Smith-Machine-Lunge.gif`
    },
    {
        slug: "barbell-lateral-lunge", name: "Бічні випади зі штангою", aliases: ["Lateral Lunge", "Side Lunge", "Бічні випади", "Випади в сторону"],
        primaryMuscleGroup: "Квадрицепс", secondaryMuscleGroups: ["Сідниці", "Внутрішня поверхня стегна"],
        movementPattern: "Випад", equipment: "Штанга", category: "Гіпертрофія", difficulty: "Середній",
        description: "Випад у бік: квадрицепс і сідниці робочої ноги плюс розтягнення привідних м'язів другої.",
        techniqueSteps: ["Стань рівно, штанга на трапеціях (або без ваги).", "Зроби широкий крок убік і сядь на цю ногу, друга залишається прямою.", "Відштовхнись і повернись у стійку."],
        commonMistakes: ["Коліно робочої ноги завалюється всередину.", "Округлення спини."],
        safetyTips: ["Тримай п'яту робочої ноги на підлозі.", "Освой рух без ваги."],
        mediaUrl: `${FP}/2021/05/Barbell-Lateral-Lunge.gif`
    },
    {
        slug: "box-jump", name: "Стрибки на тумбу", aliases: ["Box Jump", "Запригування на тумбу"],
        primaryMuscleGroup: "Квадрицепс", secondaryMuscleGroups: ["Сідниці", "Литки"],
        movementPattern: "Присідання", equipment: "Інше", category: "Функціональна", difficulty: "Середній",
        description: "Пліометричний стрибок на тумбу — вибухова сила ніг.",
        techniqueSteps: ["Стань перед тумбою на ширині стегон.", "Махни руками й вистрибни на тумбу, приземлившись м'яко на всю стопу.", "Випрямся на тумбі й зійди вниз кроком."],
        commonMistakes: ["Стрибок униз з тумби замість кроку.", "Приземлення на край тумби."],
        safetyTips: ["Почни з невисокої тумби.", "Сходь, а не зістрибуй, — бережи ахіллове сухожилля."],
        mediaUrl: `${FP}/2015/07/The-Box-Jump.gif`
    },
    {
        slug: "wall-sit", name: "Стільчик біля стіни", aliases: ["Wall Sit", "Присід біля стіни"],
        primaryMuscleGroup: "Квадрицепс", secondaryMuscleGroups: ["Сідниці"],
        movementPattern: "Присідання", equipment: "Вага тіла", category: "Ізоляція", difficulty: "Початковий", isTimed: true,
        description: "Статичне утримання присіду спиною до стіни — витривалість квадрицепса без навантаження на хребет.",
        techniqueSteps: ["Притулися спиною до стіни, стопи на крок від неї.", "Опустись до кута 90° у колінах.", "Утримуй положення, не спираючись руками на стегна."],
        commonMistakes: ["Коліна виходять далеко за носки.", "Руки впираються в стегна."],
        safetyTips: ["Опускайся лише до кута, на якому не болять коліна.", "Дихай рівно, не затримуй подих."],
        mediaUrl: `${FP}/2021/06/Wall-Sit.png`, mediaType: "image"
    },
    {
        slug: "pendulum-squat", name: "Маятникові присідання", aliases: ["Pendulum Squat", "Маятниковий присід"],
        primaryMuscleGroup: "Квадрицепс", secondaryMuscleGroups: ["Сідниці"],
        movementPattern: "Присідання", equipment: "Тренажер", category: "Гіпертрофія", difficulty: "Середній",
        description: "Присідання в маятниковому тренажері: дугова траєкторія дає глибоку амплітуду з акцентом на квадрицепс.",
        techniqueSteps: ["Стань на платформу, плечі під подушками.", "Опускайся глибоко, тримаючи спину притиснутою.", "Вставай, відштовхуючись серединою стопи."],
        commonMistakes: ["Відрив п'ят.", "Неповна глибина."],
        safetyTips: ["Тримай спину й таз притиснутими до спинки.", "Користуйся стопорами тренажера."],
        mediaUrl: `${FP}/2022/10/Pendulum-Squat.gif`
    },
    {
        slug: "pistol-squat", name: "Присідання на одній нозі (пістолетик)", aliases: ["Pistol Squat", "Пістолетик"],
        primaryMuscleGroup: "Квадрицепс", secondaryMuscleGroups: ["Сідниці", "Прес"],
        movementPattern: "Присідання", equipment: "Вага тіла", category: "Сила", difficulty: "Просунутий",
        description: "Присідання на одній нозі, друга витягнута вперед, — сила, баланс і рухливість.",
        techniqueSteps: ["Стань на одну ногу, другу витягни вперед.", "Опускайся якомога нижче, тримаючи п'яту на підлозі.", "Піднімайся без допомоги другої ноги."],
        commonMistakes: ["Коліно завалюється всередину.", "Округлення спини внизу."],
        safetyTips: ["Тримайся за опору, поки не освоїш баланс.", "Почни з присідання на лавку на одній нозі."],
        mediaUrl: `${FP}/2021/02/Pistol-Squat.gif`
    },

    // ---- Задня поверхня стегна -----------------------------------------------------------
    {
        slug: "stiff-leg-deadlift", name: "Станова тяга на прямих ногах", aliases: ["Stiff-Leg Deadlift", "Мертва тяга", "Тяга на прямих ногах"],
        primaryMuscleGroup: "Задня поверхня стегна", secondaryMuscleGroups: ["Сідниці", "Спина"],
        movementPattern: "Hinge", equipment: "Штанга", category: "Сила", difficulty: "Середній",
        description: "Тяга з майже прямими ногами від підлоги: сильне розтягнення задньої поверхні стегна.",
        techniqueSteps: ["Стань на ширині стегон, коліна ледь зігнуті.", "Нахиляйся з рівною спиною, ведучи штангу вздовж ніг.", "Піднімайся, виводячи таз уперед і напружуючи сідниці."],
        commonMistakes: ["Округлення спини.", "Згинання колін — виходить звичайна станова."],
        safetyTips: ["Опускай штангу лише доти, доки спина лишається рівною.", "Тримай гриф близько до ніг."],
        mediaUrl: `${FP}/2022/01/Stiff-Leg-Deadlift.gif`
    },
    {
        slug: "standing-leg-curl", name: "Згинання ноги стоячи в тренажері", aliases: ["Standing Leg Curl", "Standing Single Leg Curl"],
        primaryMuscleGroup: "Задня поверхня стегна", secondaryMuscleGroups: ["Литки"],
        movementPattern: "Згинання", equipment: "Тренажер", category: "Ізоляція", difficulty: "Початковий",
        description: "Згинання однієї ноги стоячи — ізоляція біцепса стегна, кожна нога працює окремо.",
        techniqueSteps: ["Стань у тренажер, валик над п'ятою.", "Згинай ногу, підводячи п'яту до сідниці.", "Повільно опускай."],
        commonMistakes: ["Прогин у попереку.", "Ривок ногою."],
        safetyTips: ["Тримайся за руків'я для стабільності.", "Не відводь стегно назад."],
        mediaUrl: `${FP}/2022/10/Standing-Single-Leg-Curl-Machine.gif`
    },
    {
        slug: "stability-ball-leg-curl", name: "Згинання ніг на фітболі", aliases: ["Stability Ball Leg Curl", "Swiss Ball Leg Curl"],
        primaryMuscleGroup: "Задня поверхня стегна", secondaryMuscleGroups: ["Сідниці"],
        movementPattern: "Згинання", equipment: "Інше", category: "Гіпертрофія", difficulty: "Середній",
        description: "Лежачи на спині з п'ятами на фітболі, підкочуєш м'яч до себе — задня поверхня стегна й сідниці без тренажера.",
        techniqueSteps: ["Ляж на спину, п'яти на фітболі, підніми таз.", "Згинай ноги, підкочуючи м'яч до сідниць.", "Повільно викоти м'яч назад, не опускаючи таза."],
        commonMistakes: ["Таз опускається на підлогу.", "Швидке розкочування."],
        safetyTips: ["Розведи руки в сторони для балансу.", "Почни з утримання моста без згинання."],
        mediaUrl: `${FP}/2021/08/leg-curl-on-stability-ball.gif`
    },

    // ---- Сідниці -------------------------------------------------------------------------
    {
        slug: "glute-bridge", name: "Сідничний місток з власною вагою", aliases: ["Glute Bridge", "Сідничний міст", "Ягодичний мостик"],
        primaryMuscleGroup: "Сідниці", secondaryMuscleGroups: ["Задня поверхня стегна"],
        movementPattern: "Hinge", equipment: "Вага тіла", category: "Ізоляція", difficulty: "Початковий",
        description: "Підйом таза лежачи на спині без ваги — активація сідниць, розминка або домашнє тренування.",
        techniqueSteps: ["Ляж на спину, ноги зігнуті, стопи на ширині стегон.", "Підніми таз, стискаючи сідниці, до прямої лінії від плечей до колін.", "Затримайся на секунду й опусти таз."],
        commonMistakes: ["Прогин у попереку замість роботи сідниць.", "Стопи надто далеко від таза."],
        safetyTips: ["Тримай ребра опущеними, прес напруженим.", "Відштовхуйся п'ятами."],
        mediaUrl: `${FP}/2021/02/Glute-Bridge-.gif`
    },
    {
        slug: "single-leg-glute-bridge", name: "Сідничний місток на одній нозі", aliases: ["Single Leg Glute Bridge", "Single Leg Bridge"],
        primaryMuscleGroup: "Сідниці", secondaryMuscleGroups: ["Задня поверхня стегна"],
        movementPattern: "Hinge", equipment: "Вага тіла", category: "Гіпертрофія", difficulty: "Початковий",
        description: "Місток на одній нозі: кожна сідниця працює окремо, а вага тіла відчувається значно сильніше.",
        techniqueSteps: ["Ляж на спину: одна стопа на підлозі, друга нога піднята.", "Підніми таз опорною ногою, стискаючи сідницю.", "Опусти повільно, а після підходу зміни ногу."],
        commonMistakes: ["Перекіс таза.", "Прогин у попереку."],
        safetyTips: ["Тримай таз рівно.", "Роби однакову кількість повторень на кожну ногу."],
        mediaUrl: `${FP}/2021/06/Single-Leg-Bridge.gif`
    },
    {
        slug: "hip-thrust-machine", name: "Підйом таза в тренажері", aliases: ["Hip Thrust Machine", "Glute Drive", "Хіп-траст у тренажері"],
        primaryMuscleGroup: "Сідниці", secondaryMuscleGroups: ["Задня поверхня стегна"],
        movementPattern: "Hinge", equipment: "Тренажер", category: "Гіпертрофія", difficulty: "Початковий",
        description: "Хіп-траст у тренажері: зручний сетап без штанги й стабільне навантаження на сідниці.",
        techniqueSteps: ["Сядь у тренажер: ремінь або валик на тазі, спина на подушці.", "Виштовхни таз угору до прямої лінії корпусу.", "Затримайся вгорі й повільно опусти."],
        commonMistakes: ["Перерозгинання в попереку вгорі.", "Неповне випрямлення таза."],
        safetyTips: ["Тримай підборіддя трохи прибраним.", "Налаштуй тренажер так, щоб угорі гомілки були вертикальні."],
        mediaUrl: `${FP}/2022/02/Hip-Thrust-Machine.gif`
    },
    {
        slug: "glute-kickback-machine", name: "Відведення ноги назад у тренажері", aliases: ["Glute Kickback Machine", "Махи ногою назад у тренажері"],
        primaryMuscleGroup: "Сідниці", secondaryMuscleGroups: ["Задня поверхня стегна"],
        movementPattern: "Розгинання", equipment: "Тренажер", category: "Ізоляція", difficulty: "Початковий",
        description: "Відведення ноги назад з упором у тренажері — ізоляція великого сідничного м'яза.",
        techniqueSteps: ["Стань у тренажер і обіприся грудьми або руками.", "Відводь ногу назад і вгору, стискаючи сідницю.", "Повільно повертай ногу."],
        commonMistakes: ["Прогин у попереку заради більшої амплітуди.", "Ривки."],
        safetyTips: ["Тримай корпус нерухомим.", "Працюй у контрольованому темпі."],
        mediaUrl: `${FP}/2021/06/Glute-Kickback-Machine.gif`
    },
    {
        slug: "donkey-kicks", name: "Махи ногою назад на четвереньках", aliases: ["Donkey Kicks", "Віслючі махи"],
        primaryMuscleGroup: "Сідниці", secondaryMuscleGroups: [],
        movementPattern: "Розгинання", equipment: "Вага тіла", category: "Ізоляція", difficulty: "Початковий",
        description: "Махи зігнутою ногою вгору в упорі на колінах — проста вправа на сідниці вдома чи для розминки.",
        techniqueSteps: ["Стань на четвереньки: руки під плечима, коліна під тазом.", "Підніми зігнуту ногу п'ятою до стелі.", "Повільно опусти й повтори."],
        commonMistakes: ["Прогин у попереку.", "Розворот таза вбік."],
        safetyTips: ["Тримай прес напруженим.", "Додай гумку, щоб ускладнити."],
        mediaUrl: `${FP}/2021/02/Donkey-Kicks.gif`
    },
    {
        slug: "fire-hydrant", name: "Відведення ноги вбік на четвереньках", aliases: ["Fire Hydrant", "Пожежний гідрант"],
        primaryMuscleGroup: "Сідниці", secondaryMuscleGroups: [],
        movementPattern: "Розведення", equipment: "Вага тіла", category: "Ізоляція", difficulty: "Початковий",
        description: "Відведення зігнутої ноги в бік в упорі на колінах — середній сідничний м'яз.",
        techniqueSteps: ["Стань на четвереньки.", "Відведи зігнуту ногу вбік до рівня таза.", "Повільно поверни."],
        commonMistakes: ["Перекочування корпусу вбік.", "Швидкі махи."],
        safetyTips: ["Тримай таз рівно.", "Ускладнюй гумкою над колінами."],
        mediaUrl: `${FP}/2021/02/Fire-Hydrant.gif`
    },
    {
        slug: "cable-hip-abduction", name: "Відведення ноги вбік у кросовері", aliases: ["Cable Hip Abduction", "Махи ногою вбік у кросовері"],
        primaryMuscleGroup: "Сідниці", secondaryMuscleGroups: [],
        movementPattern: "Розведення", equipment: "Блок", category: "Ізоляція", difficulty: "Початковий",
        description: "Відведення ноги в бік з манжетою нижнього блока — середній сідничний з постійним натягом.",
        techniqueSteps: ["Закріпи манжету на щиколотці дальньої від блока ноги.", "Відводь пряму ногу в бік.", "Повільно поверни, не торкаючись стеку."],
        commonMistakes: ["Нахил корпусу в протилежний бік.", "Розворот стопи носком угору."],
        safetyTips: ["Тримайся за стійку тренажера.", "Працюй з легкою вагою."],
        mediaUrl: `${FP}/2021/02/Cable-Hip-Abduction.gif`
    },
    {
        slug: "side-lying-leg-raise", name: "Підйом ноги лежачи на боці", aliases: ["Side Lying Leg Raise", "Side Hip Abduction", "Махи ногою вбік лежачи"],
        primaryMuscleGroup: "Сідниці", secondaryMuscleGroups: [],
        movementPattern: "Розведення", equipment: "Вага тіла", category: "Ізоляція", difficulty: "Початковий",
        description: "Відведення прямої ноги вгору лежачи на боці — середній сідничний м'яз без обладнання.",
        techniqueSteps: ["Ляж на бік, нижня нога зігнута, верхня пряма.", "Піднімай верхню ногу вгору, не розвертаючи носок.", "Повільно опусти."],
        commonMistakes: ["Перекочування таза назад.", "Махи з інерцією."],
        safetyTips: ["Тримай корпус нерухомим.", "Додай гумку або обтяжувач, коли стане легко."],
        mediaUrl: `${FP}/2022/06/Side-Hip-Abduction.gif`
    },
    {
        slug: "band-side-lying-clam", name: "Розкладачка з гумовою стрічкою", aliases: ["Clamshell", "Clam", "Мушля"],
        primaryMuscleGroup: "Сідниці", secondaryMuscleGroups: [],
        movementPattern: "Розведення", equipment: "Еспандер", category: "Ізоляція", difficulty: "Початковий",
        description: "Лежачи на боці з гумкою над колінами, розкриваєш коліна, як мушлю, — середній сідничний м'яз.",
        techniqueSteps: ["Ляж на бік, ноги зігнуті, гумка над колінами.", "Не розмикаючи стоп, підніми верхнє коліно.", "Повільно опусти."],
        commonMistakes: ["Таз перекочується назад.", "Ривки."],
        safetyTips: ["Тримай таз нерухомим.", "Почни з легкої гумки."],
        mediaUrl: `${FP}/2022/02/Band-Side-Lying-Clam.gif`
    },
    {
        slug: "dumbbell-sumo-squat", name: "Присідання сумо з гантеллю", aliases: ["Dumbbell Sumo Squat", "Пліє з гантеллю", "Пліє"],
        primaryMuscleGroup: "Сідниці", secondaryMuscleGroups: ["Квадрицепс", "Внутрішня поверхня стегна"],
        movementPattern: "Присідання", equipment: "Гантелі", category: "Гіпертрофія", difficulty: "Початковий",
        description: "Широка стійка з носками врізнобіч і гантеллю між ніг — сідниці й привідні м'язи стегна.",
        techniqueSteps: ["Стань ширше плечей, носки розвернуті назовні, гантель тримай перед собою.", "Опускайся вертикально, коліна йдуть у напрямку носків.", "Піднімайся, стискаючи сідниці."],
        commonMistakes: ["Коліна завалюються всередину.", "Нахил корпусу вперед."],
        safetyTips: ["Розводь коліна по лінії стоп.", "Не опускайся нижче комфортної глибини."],
        mediaUrl: `${FP}/2021/02/dumbbell-sumo-squat.gif`
    },
    {
        slug: "sumo-deadlift", name: "Станова тяга сумо", aliases: ["Sumo Deadlift", "Сумо"],
        primaryMuscleGroup: "Сідниці", secondaryMuscleGroups: ["Квадрицепс", "Задня поверхня стегна", "Внутрішня поверхня стегна", "Спина"],
        movementPattern: "Hinge", equipment: "Штанга", category: "Сила", difficulty: "Середній",
        description: "Станова тяга з широкою постановкою ніг і хватом між колінами: коротша амплітуда й більше роботи ніг.",
        techniqueSteps: ["Стань широко, носки назовні, гриф над серединою стопи.", "Візьми гриф хватом на ширині плечей між колінами й розведи коліна.", "Тягни, відштовхуючись ногами й виводячи таз уперед."],
        commonMistakes: ["Коліна сходяться всередину.", "Таз піднімається раніше за плечі."],
        safetyTips: ["Тримай спину нейтральною.", "Розімни привідні м'язи перед важкими підходами."],
        mediaUrl: `${FP}/2021/04/Barbell-Sumo-Deadlift.gif`
    },
    {
        slug: "trap-bar-deadlift", name: "Станова тяга з трап-грифом", aliases: ["Trap Bar Deadlift", "Hex Bar Deadlift", "Тяга з шестикутним грифом"],
        primaryMuscleGroup: "Сідниці", secondaryMuscleGroups: ["Квадрицепс", "Задня поверхня стегна", "Спина"],
        movementPattern: "Hinge", equipment: "Штанга", category: "Сила", difficulty: "Початковий",
        description: "Тяга з трап-грифом: вага з боків від тіла, менше навантаження на поперек і простіша техніка.",
        techniqueSteps: ["Стань у центр грифа й візьми руків'я.", "Опусти таз, спина рівна, груди вперед.", "Встань, відштовхуючись ногами, і повільно опусти гриф."],
        commonMistakes: ["Округлення спини.", "Ривок руками."],
        safetyTips: ["Тримай лікті прямими.", "Опускай гриф контрольовано."],
        mediaUrl: `${FP}/2021/06/Trap-Bar-Deadlift.gif`
    },
    {
        slug: "kettlebell-swing", name: "Махи гирею", aliases: ["Kettlebell Swing", "Свінг гирі"],
        primaryMuscleGroup: "Сідниці", secondaryMuscleGroups: ["Задня поверхня стегна", "Спина", "Плечі"],
        movementPattern: "Hinge", equipment: "Гиря", category: "Функціональна", difficulty: "Середній",
        description: "Вибухові махи гирею за рахунок розгинання таза — сідниці, задня поверхня стегна й витривалість.",
        techniqueSteps: ["Стань трохи ширше плечей, гиря перед тобою.", "Заведи гирю між ніг, відвівши таз назад.", "Різко виштовхни таз уперед — гиря злітає до рівня грудей."],
        commonMistakes: ["Присідання замість нахилу.", "Підйом гирі руками."],
        safetyTips: ["Тримай спину рівною в нижній точці.", "Контролюй гирю на всій траєкторії."],
        mediaUrl: `${FP}/2021/09/Kettlebell-Swings.gif`
    },
    {
        slug: "curtsy-lunge", name: "Перехресні випади (реверанс)", aliases: ["Curtsy Lunge", "Реверанс", "Випад навхрест"],
        primaryMuscleGroup: "Сідниці", secondaryMuscleGroups: ["Квадрицепс", "Внутрішня поверхня стегна"],
        movementPattern: "Випад", equipment: "Вага тіла", category: "Гіпертрофія", difficulty: "Початковий",
        description: "Випад назад навхрест — акцент на сідницях, особливо на середньому сідничному м'язі.",
        techniqueSteps: ["Стань рівно, руки перед собою або гантелі в руках.", "Відведи одну ногу назад навхрест за опорну.", "Опустись і повернись, відштовхнувшись передньою ногою."],
        commonMistakes: ["Коліно опорної ноги завалюється всередину.", "Скручування корпусу."],
        safetyTips: ["Тримай таз рівно.", "Почни без ваги."],
        mediaUrl: `${FP}/2023/09/curtsy-lunge.gif`
    },

    // ---- Литки ---------------------------------------------------------------------------
    {
        slug: "standing-calf-raise", name: "Підйом на носки стоячи", aliases: ["Standing Calf Raise"],
        primaryMuscleGroup: "Литки", secondaryMuscleGroups: [],
        movementPattern: "Підйом на носки", equipment: "Тренажер", category: "Гіпертрофія", difficulty: "Початковий",
        description: "Базова вправа на литки стоячи (акцент на литковому м'язі). Повна амплітуда й пауза вгорі.",
        techniqueSteps: ["Стань носками на платформу, п'яти звисають.", "Піднімайся максимально високо на носки.", "Опускай п'яти нижче платформи до розтягнення."],
        commonMistakes: ["Коротка амплітуда.", "Пружинення без контролю."],
        safetyTips: ["Роби паузу у верхній точці.", "Не кидай п'яти вниз ривком."],
        mediaUrl: `${FP}/2021/06/Standing-Calf-Raise.gif`
    },
    {
        slug: "standing-barbell-calf-raise", name: "Підйом на носки зі штангою стоячи", aliases: ["Barbell Calf Raise", "Smith Machine Calf Raise", "Литки в Сміті"],
        primaryMuscleGroup: "Литки", secondaryMuscleGroups: [],
        movementPattern: "Підйом на носки", equipment: "Штанга", category: "Гіпертрофія", difficulty: "Початковий",
        description: "Підйом на носки зі штангою на плечах (або в Сміті) — литковий м'яз під великою вагою.",
        techniqueSteps: ["Поклади штангу на трапеції, носки на невисоке підвищення.", "Піднімайся максимально високо на носки.", "Опускай п'яти нижче опори до розтягнення."],
        commonMistakes: ["Згинання колін.", "Пружинення без паузи."],
        safetyTips: ["Для балансу краще робити в Сміті.", "Роби паузу вгорі й унизу."],
        mediaUrl: `${FP}/2022/04/Standing-Barbell-Calf-Raise.gif`
    },

    // ---- Все тіло ------------------------------------------------------------------------
    {
        slug: "burpee", name: "Берпі", aliases: ["Burpee", "Burpees"],
        primaryMuscleGroup: "Все тіло", secondaryMuscleGroups: ["Груди", "Квадрицепс", "Прес"],
        movementPattern: "Кардіо", equipment: "Вага тіла", category: "Функціональна", difficulty: "Середній",
        description: "Присід, упор лежачи, повернення й стрибок — вправа на все тіло й пульс.",
        techniqueSteps: ["Зі стійки присядь і постав руки на підлогу.", "Відскоч ногами в упор лежачи; за бажання віджмися.", "Поверни ноги до рук і вистрибни вгору з оплеском над головою."],
        commonMistakes: ["Таз провисає в упорі.", "Жорстке приземлення."],
        safetyTips: ["Тримай темп, з яким техніка не розвалюється.", "Приземляйся м'яко."],
        mediaUrl: `${FP}/2021/02/burpees.gif`
    },
    {
        slug: "jumping-jack", name: "Джампінг-джек", aliases: ["Jumping Jacks", "Стрибки з розведенням рук і ніг"],
        primaryMuscleGroup: "Все тіло", secondaryMuscleGroups: ["Литки", "Плечі"],
        movementPattern: "Кардіо", equipment: "Вага тіла", category: "Функціональна", difficulty: "Початковий",
        description: "Стрибки з одночасним розведенням рук і ніг — розминка або кардіоблок.",
        techniqueSteps: ["Стань рівно, руки вздовж тіла.", "Стрибком розстав ноги й підніми руки над головою.", "Стрибком повернись у вихідне положення."],
        commonMistakes: ["Приземлення на п'яти.", "Сутулість."],
        safetyTips: ["Приземляйся на передню частину стопи.", "Тримай рівний ритм дихання."],
        mediaUrl: `${FP}/2021/05/Jumping-jack.gif`
    },
    {
        slug: "jump-rope", name: "Скакалка", aliases: ["Jump Rope", "Стрибки на скакалці"],
        primaryMuscleGroup: "Все тіло", secondaryMuscleGroups: ["Литки"],
        movementPattern: "Кардіо", equipment: "Інше", category: "Функціональна", difficulty: "Початковий", isTimed: true,
        description: "Стрибки на скакалці — кардіо, координація й литки.",
        techniqueSteps: ["Тримай руків'я на рівні пояса, лікті біля корпусу.", "Обертай скакалку кистями, а не всією рукою.", "Стрибай невисоко, на носках."],
        commonMistakes: ["Високі стрибки.", "Обертання від плечей."],
        safetyTips: ["Підбери довжину: стоячи на скакалці, руків'я мають сягати пахв.", "Стрибай на поверхні, що амортизує."],
        mediaUrl: `${FP}/2023/10/Skip-Jump-Rope.gif`
    },
    {
        slug: "battle-rope", name: "Канати (battle rope)", aliases: ["Battle Rope", "Бойові канати", "Хвилі канатами"],
        primaryMuscleGroup: "Все тіло", secondaryMuscleGroups: ["Плечі", "Прес"],
        movementPattern: "Кардіо", equipment: "Інше", category: "Функціональна", difficulty: "Середній", isTimed: true,
        description: "Хвилі важкими канатами — інтервальне навантаження на плечі, корпус і пульс.",
        techniqueSteps: ["Візьми кінці канатів і стань у напівприсід.", "Почергово або разом різко піднімай і опускай руки, створюючи хвилі.", "Тримай темп увесь інтервал."],
        commonMistakes: ["Стійка на прямих ногах.", "Рух лише кистями без участі плечей."],
        safetyTips: ["Тримай коліна злегка зігнутими, а прес напруженим.", "Працюй інтервалами по 20–40 секунд."],
        mediaUrl: `${FP}/2015/07/Battle-Rope.gif`
    },
    {
        slug: "barbell-thruster", name: "Трастер зі штангою", aliases: ["Thruster", "Присід із жимом"],
        primaryMuscleGroup: "Все тіло", secondaryMuscleGroups: ["Квадрицепс", "Плечі", "Сідниці"],
        movementPattern: "Присідання", equipment: "Штанга", category: "Функціональна", difficulty: "Середній",
        description: "Фронтальний присід, що одним рухом переходить у жим над головою, — класика кросфіту.",
        techniqueSteps: ["Тримай штангу на передніх дельтах, лікті вперед.", "Присядь до паралелі.", "Вибухово встань і на цій інерції вичави штангу над головою."],
        commonMistakes: ["Пауза між присідом і жимом.", "Лікті падають униз у присіді."],
        safetyTips: ["Опускай штангу на плечі, амортизуючи колінами.", "Почни з легкої ваги."],
        mediaUrl: `${FP}/2022/10/thruster.gif`
    },
    {
        slug: "power-clean", name: "Взяття штанги на груди", aliases: ["Power Clean", "Взяття на груди"],
        primaryMuscleGroup: "Все тіло", secondaryMuscleGroups: ["Спина", "Квадрицепс", "Сідниці", "Плечі"],
        movementPattern: "Hinge", equipment: "Штанга", category: "Сила", difficulty: "Просунутий",
        description: "Вибуховий підрив штанги з підлоги з підсідом і прийомом на груди — потужність усього тіла.",
        techniqueSteps: ["Стань як для станової й візьми гриф трохи ширше плечей.", "Відірви штангу й вибухово розігнися ногами й тазом.", "Підсядь під штангу, прийнявши її на передні дельти з ліктями вперед."],
        commonMistakes: ["Тяга руками замість розгинання ніг.", "Штанга відходить від тіла."],
        safetyTips: ["Освоюй техніку з тренером і легкою вагою.", "Використовуй бамперні диски й поміст."],
        mediaUrl: `${FP}/2021/04/Power-Clean-.gif`
    },
    {
        slug: "clean-and-jerk", name: "Поштовх штанги", aliases: ["Clean and Jerk", "Взяття й поштовх", "Поштовх"],
        primaryMuscleGroup: "Все тіло", secondaryMuscleGroups: ["Плечі", "Квадрицепс", "Сідниці", "Спина"],
        movementPattern: "Вертикальний жим", equipment: "Штанга", category: "Сила", difficulty: "Просунутий",
        description: "Класична вправа важкої атлетики: взяття штанги на груди й поштовх над головою.",
        techniqueSteps: ["Візьми штангу на груди.", "Зроби короткий підсід і виштовхни штангу вгору ногами.", "Прийми її на прямі руки в ножицях чи підсіді й зафіксуй."],
        commonMistakes: ["Жим руками замість поштовху ногами.", "Нестабільна фіксація вгорі."],
        safetyTips: ["Вчися техніки з тренером.", "Працюй з бамперами на помості."],
        mediaUrl: `${FP}/2025/06/clean-and-jerk.gif`
    },
    {
        slug: "barbell-snatch", name: "Ривок штанги", aliases: ["Snatch", "Ривок"],
        primaryMuscleGroup: "Все тіло", secondaryMuscleGroups: ["Плечі", "Спина", "Квадрицепс", "Сідниці"],
        movementPattern: "Hinge", equipment: "Штанга", category: "Сила", difficulty: "Просунутий",
        description: "Підйом штанги з підлоги над голову одним рухом широким хватом — найтехнічніша вправа важкої атлетики.",
        techniqueSteps: ["Візьми гриф широким хватом і стань як для тяги.", "Вибухово розігнися й веди штангу вгору вздовж тіла.", "Підсядь під штангу, прийнявши її на прямі руки над головою."],
        commonMistakes: ["Руки починають тягнути зарано.", "Штанга відходить від тіла."],
        safetyTips: ["Освоюй рух з палицею й порожнім грифом.", "Навчись безпечно скидати штангу вперед і назад."],
        mediaUrl: `${FP}/2022/02/Barbell-Snatch.gif`
    },
    {
        slug: "wall-ball", name: "Кидки м'яча в стіну", aliases: ["Wall Ball", "Wall Ball Shot", "Волболи"],
        primaryMuscleGroup: "Все тіло", secondaryMuscleGroups: ["Квадрицепс", "Плечі"],
        movementPattern: "Присідання", equipment: "Інше", category: "Функціональна", difficulty: "Середній",
        description: "Присід із медболом і кидок у ціль на стіні — ноги, плечі й пульс одночасно.",
        techniqueSteps: ["Тримай медбол біля грудей і стань перед стіною.", "Присядь до паралелі.", "Вибухово встань і кинь м'яч у ціль, ловлячи його вже на наступне присідання."],
        commonMistakes: ["Неповний присід.", "Кидок лише руками."],
        safetyTips: ["Стій на відстані витягнутої руки від стіни.", "Лови м'яч м'якими руками біля грудей."],
        mediaUrl: `${FP}/2023/01/wall-ball.gif`
    },
    {
        slug: "medicine-ball-slam", name: "Кидки медболу об підлогу", aliases: ["Medicine Ball Slam", "Ball Slam", "Слем-бол"],
        primaryMuscleGroup: "Все тіло", secondaryMuscleGroups: ["Прес", "Плечі", "Спина"],
        movementPattern: "Кардіо", equipment: "Інше", category: "Функціональна", difficulty: "Початковий",
        description: "Підняти медбол над головою й з силою кинути об підлогу — вибухова потужність і кардіо.",
        techniqueSteps: ["Підніми м'яч над головою на прямих руках.", "З силою кинь його вниз перед собою, згинаючись у тазі.", "Підбери м'яч і повтори."],
        commonMistakes: ["Кидок лише руками, без корпусу.", "Округлення спини, коли піднімаєш м'яч."],
        safetyTips: ["Бери слем-бол, що не відскакує.", "Не нахиляйся над м'ячем, поки він може відскочити."],
        mediaUrl: `${FP}/2022/06/Medicine-ball-Overhead-Slam-exercise.gif`
    },
    {
        slug: "turkish-get-up", name: "Турецький підйом з гирею", aliases: ["Turkish Get-Up", "TGU"],
        primaryMuscleGroup: "Все тіло", secondaryMuscleGroups: ["Плечі", "Прес", "Сідниці"],
        movementPattern: "Перенесення", equipment: "Гиря", category: "Функціональна", difficulty: "Просунутий",
        description: "Підйом з положення лежачи до стоячого з гирею на прямій руці — стабільність плечей і корпусу.",
        techniqueSteps: ["Ляж на спину, гиря на прямій руці над плечем.", "Поетапно піднімайся через лікоть, долоню й коліно до стійки, не зводячи очей з гирі.", "Так само поетапно повернись у положення лежачи."],
        commonMistakes: ["Рука з гирею згинається.", "Поспіх між етапами."],
        safetyTips: ["Освой рух без ваги.", "Тримай зап'ястя прямим."],
        mediaUrl: `${FP}/2021/04/Turkish-Get-Up-Squat-style.gif`
    },
    {
        slug: "bear-crawl", name: "Ведмежа хода", aliases: ["Bear Crawl", "Ходьба ведмедем"],
        primaryMuscleGroup: "Все тіло", secondaryMuscleGroups: ["Плечі", "Прес", "Квадрицепс"],
        movementPattern: "Кардіо", equipment: "Вага тіла", category: "Функціональна", difficulty: "Початковий", isTimed: true,
        description: "Пересування на руках і ногах з колінами над підлогою — координація, плечі й корпус.",
        techniqueSteps: ["Стань на четвереньки й підніми коліна на кілька сантиметрів.", "Рухайся вперед протилежними рукою й ногою.", "Тримай спину рівною, а таз низько."],
        commonMistakes: ["Високо піднятий таз.", "Коліна торкаються підлоги."],
        safetyTips: ["Рухайся повільно й контрольовано.", "Перевір, що попереду вільно."],
        mediaUrl: `${FP}/2021/02/Bear-Crawl.gif`
    },
    {
        slug: "high-knee-run", name: "Біг на місці з високим підніманням колін", aliases: ["High Knees", "Високі коліна"],
        primaryMuscleGroup: "Все тіло", secondaryMuscleGroups: ["Квадрицепс", "Литки"],
        movementPattern: "Кардіо", equipment: "Вага тіла", category: "Функціональна", difficulty: "Початковий", isTimed: true,
        description: "Інтенсивний біг на місці з колінами до рівня таза — кардіо для розминки чи інтервалів.",
        techniqueSteps: ["Стань рівно, руки зігнуті в ліктях.", "Почергово піднімай коліна до рівня таза у швидкому темпі.", "Працюй руками в такт ногам."],
        commonMistakes: ["Нахил корпусу назад.", "Приземлення на п'яти."],
        safetyTips: ["Приземляйся на передню частину стопи.", "Нарощуй темп поступово."],
        mediaUrl: `${FP}/2021/08/High-Knee-Run.gif`
    }
];

// ---- Corrections to the live catalogue -----------------------------------------------------
// Applied on purpose, by catalog-cli.ts. Each is idempotent: a merge whose duplicate is gone,
// or a patch whose row already holds the new values, is reported as done and skipped.

export interface CatalogMerge {
    /** Slug of the duplicate that goes away. */
    from: string;
    /** Slug of the row that keeps the movement — and receives the other one's history. */
    into: string;
    reason: string;
}

// Each pair is the same movement with the same animation. Measured on the live catalogue
// before merging: in every pair the row that goes away had no workouts, records or template
// slots — but the merge moves them anyway, because a duplicate is still a row someone could
// have logged a set against between that check and the merge.
export const CATALOG_MERGES: CatalogMerge[] = [
    { from: "barbell-curl", into: "біцепс-зі-штангою", reason: "той самий підйом штанги на біцепс, та сама анімація" },
    { from: "dumbbell-lateral-raise", into: "махи-гантелей-через-сторони", reason: "ті самі махи гантелями в сторони, та сама анімація" },
    { from: "розгинання-на-трицепс-на-блоці-канат", into: "rope-pushdown", reason: "те саме розгинання на блоці з канатом, та сама анімація" }
];

type PatchableField = "name" | "primaryMuscleGroup" | "movementPattern" | "equipment" | "mediaUrl";

export interface CatalogPatch {
    slug: string;
    /** New values. Each one is written only while the row still holds the matching `was` value,
     *  so an edit somebody has made in the app since always wins over this list. */
    set?: Partial<Record<PatchableField, string>>;
    was?: Partial<Record<PatchableField, string>>;
    /** Secondary muscles, written only while the row has none. */
    secondaryMuscleGroups?: string[];
    /** Extra names for search (the catalogue search matches aliases). Appended, never replaced. */
    addAliases?: string[];
    /** Aliases to drop — a name that now belongs to a separate exercise. */
    removeAliases?: string[];
    reason: string;
}

export const CATALOG_PATCHES: CatalogPatch[] = [
    // Values the exercise editor cannot even show: a push-up "on a machine", a fly filed as a
    // pulldown, leg raises filed as a bench press. They also hide the rows from the filters.
    { slug: "віджимання-від-підлоги", set: { equipment: "Вага тіла" }, was: { equipment: "Тренажер" }, secondaryMuscleGroups: ["Трицепс", "Плечі"], addAliases: ["Push-Up", "Віджимання"], reason: "віджимання — власна вага, не тренажер" },
    { slug: "зведення-рук-у-кросовері", set: { movementPattern: "Зведення" }, was: { movementPattern: "Вертикальна тяга" }, addAliases: ["Cable Crossover", "Cable Fly"], reason: "зведення, а не тяга" },
    { slug: "бабочка", set: { movementPattern: "Зведення" }, was: { movementPattern: "Горизонтальний жим" }, reason: "зведення, а не жим" },
    { slug: "підйом-прямих-ніг-лежачи-на-спині", set: { movementPattern: "Кор" }, was: { movementPattern: "Горизонтальний жим" }, addAliases: ["Lying Leg Raise"], reason: "вправа на прес, а не жим" },
    { slug: "captain-s-chair-straight-leg-raise", set: { name: "Підйом прямих ніг у капітанському кріслі", movementPattern: "Кор", equipment: "Тренажер" }, was: { name: "Підйом Прямих Ніг У Капітанському Кріслі", movementPattern: "Згинання", equipment: "Інше" }, addAliases: ["Captain's Chair Leg Raise"], reason: "регістр у назві; прес; це станок" },
    { slug: "прес", set: { movementPattern: "Кор", equipment: "Вага тіла" }, was: { movementPattern: "Згинання", equipment: "Інше" }, addAliases: ["Скручування", "Crunch"], reason: "скручування на підлозі — власна вага" },
    { slug: "ягодичний-місток", set: { movementPattern: "Hinge" }, was: { movementPattern: "Вертикальний жим" }, addAliases: ["Сідничний місток зі штангою", "Barbell Glute Bridge"], reason: "розгинання таза, а не жим" },
    { slug: "трицепс-штангою-за-головою", set: { movementPattern: "Розгинання" }, was: { movementPattern: "Вертикальний жим" }, addAliases: ["Французький жим стоячи", "Overhead Barbell Triceps Extension"], reason: "розгинання, а не жим" },
    { slug: "біцепс-зі-штангою", set: { movementPattern: "Згинання" }, was: { movementPattern: "Підйом" }, secondaryMuscleGroups: ["Передпліччя"], addAliases: ["Barbell Curl", "EZ Bar Curl", "Біцепс з EZ-грифом"], reason: "згинання, як і решта вправ на біцепс" },
    { slug: "литки-в-тренажері-сидячи", set: { movementPattern: "Підйом на носки" }, was: { movementPattern: "Підйом" }, addAliases: ["Seated Calf Raise"], reason: "той самий патерн, що й у решти вправ на литки" },
    { slug: "тяга-нижнього-блоку-вузьким", set: { equipment: "Блок" }, was: { equipment: "Тренажер" }, addAliases: ["Close Grip Seated Cable Row", "Тяга нижнього блока вузьким хватом"], reason: "це блок" },
    { slug: "тяга-нижнього-блоку-широким", set: { equipment: "Блок" }, was: { equipment: "Тренажер" }, addAliases: ["Seated Cable Row", "Тяга нижнього блока широким хватом"], reason: "це блок" },
    { slug: "тяга-верхнього-блоку-с-v-обр-рукояткою", set: { equipment: "Блок" }, was: { equipment: "Тренажер" }, addAliases: ["V-Bar Lat Pulldown", "Тяга верхнього блока вузьким хватом"], reason: "це блок" },
    { slug: "тяга-верхнього-на-біцепс", set: { movementPattern: "Вертикальна тяга" }, was: { movementPattern: "Горизонтальний жим" }, addAliases: ["Reverse Grip Lat Pulldown", "Тяга верхнього блока зворотним хватом"], reason: "тяга верхнього блока, а не жим" },
    { slug: "розведення-ніг-сидячи", set: { movementPattern: "Розведення" }, was: { movementPattern: "Згинання" }, addAliases: ["Hip Abduction Machine", "Абдуктор"], reason: "розведення ніг, а не згинання" },
    { slug: "зведення-ніг-сидячи", set: { movementPattern: "Зведення" }, was: { movementPattern: "Згинання" }, addAliases: ["Hip Adduction Machine", "Аддуктор"], reason: "зведення ніг, а не згинання" },
    { slug: "станова-тяга-однією-рукою", set: { movementPattern: "Hinge" }, was: { movementPattern: "Вертикальна тяга" }, reason: "станова — це hinge" },
    // «Підйом прямих ніг у висі» is its own exercise now, so the knee raise stops answering to it.
    { slug: "pidiom-kolin-u-vysi", addAliases: ["Підйом колін на турніку"], removeAliases: ["Hanging Leg Raise", "Підйом ніг у висі"], reason: "прямі ноги тепер окрема вправа" },
    // The band exercise was illustrated by a stretch.
    { slug: "zovnishnia-rotatsiia-plecha-z-humovoiu-strichkoiu", set: { mediaUrl: `${FP}/2023/06/Banded-Shoulder-External-Rotation.gif` }, was: { mediaUrl: `${FP}/2023/06/shoulder-external-rotation-stretch.gif` }, reason: "анімація показувала розтяжку, а не вправу" },
    // Search: the owner's own rows mostly carry no other names, so «leg press» or «бруси» found nothing.
    { slug: "жим-платформи-ногами", addAliases: ["Leg Press", "Жим ногами"], reason: "пошук" },
    { slug: "пуловер", addAliases: ["Lever Pullover", "Пуловер у тренажері"], reason: "пошук" },
    { slug: "гіперекстензія", addAliases: ["Hyperextension", "Back Extension"], reason: "пошук" },
    { slug: "передпліччя-зі-штангою", addAliases: ["Behind the Back Wrist Curl", "Згинання зап'ясть зі штангою за спиною"], reason: "пошук" },
    { slug: "згинання-ніг-в-тренажері", addAliases: ["Lying Leg Curl", "Згинання ніг лежачи"], reason: "пошук" },
    { slug: "розгинання-ніг-в-тренажері", addAliases: ["Leg Extension"], reason: "пошук" },
    { slug: "відведення-ноги-назад-у-кросовері", addAliases: ["Cable Glute Kickback", "Махи ногою назад у кросовері"], reason: "пошук" },
    { slug: "віджимання-на-брусах", addAliases: ["Бруси", "Chest Dips"], reason: "пошук" },
    { slug: "махи-гантелей-через-сторони", addAliases: ["Махи в сторони"], reason: "пошук" }
];

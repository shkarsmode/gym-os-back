/**
 * Text banks for the dev-environment life generator.
 *
 * Kept apart from the simulation itself so the numbers can be tested without dragging a
 * few hundred strings through every assertion, and so adding variety never means touching
 * logic.
 *
 * Everything here is deliberately obvious filler in Ukrainian — the point of the dev
 * environment is to look ALIVE while never being mistaken for real member data. Names are
 * assembled from common given/family names rather than copied from anywhere.
 */

export const GIVEN_NAMES_MALE = [
    "Андрій", "Богдан", "Валентин", "Віктор", "Владислав", "Гліб", "Данило", "Денис",
    "Дмитро", "Євген", "Іван", "Ігор", "Кирило", "Максим", "Микита", "Микола", "Олег",
    "Олександр", "Остап", "Павло", "Роман", "Ростислав", "Сергій", "Тарас", "Юрій", "Ярослав"
];

export const GIVEN_NAMES_FEMALE = [
    "Аліна", "Анастасія", "Анна", "Валерія", "Вікторія", "Дарина", "Діана", "Ірина",
    "Катерина", "Крістіна", "Ксенія", "Марина", "Марія", "Наталія", "Оксана", "Олена",
    "Ольга", "Поліна", "Світлана", "Софія", "Тетяна", "Уляна", "Юлія", "Яна"
];

export const FAMILY_NAMES = [
    "Бондаренко", "Ткаченко", "Коваленко", "Шевченко", "Мельник", "Кравченко", "Олійник",
    "Шевчук", "Поліщук", "Бондар", "Ткачук", "Мороз", "Марченко", "Лисенко", "Руденко",
    "Савченко", "Петренко", "Клименко", "Кузьменко", "Мазур", "Левченко", "Гаврилюк",
    "Данилюк", "Захарченко", "Іщенко", "Литвиненко", "Николаєнко", "Павленко"
];

/** Handles read as handles, not as "Name Surname" — that is how people actually sign up. */
export const HANDLE_SUFFIXES = ["", "", "", "_ua", "fit", "gym", "_lift", "24", "07", "_x", "pwr"];

export const TRAINING_GOALS = [
    "Набрати м'язову масу",
    "Схуднути й не втратити силу",
    "Присід 150 кг",
    "Перше підтягування з вагою",
    "Просто триматися у формі",
    "Повернутись у форму після перерви",
    "Витривалість для бігу",
    "Суха сила без зайвої ваги",
    "Здорова спина після сидячої роботи",
    "Підготовка до змагань"
];

export const EXPERIENCE_LABELS = [
    "Перші місяці", "Пів року", "1 рік", "2 роки", "3 роки", "4 роки", "5 років", "8 років"
];

/**
 * Comment bank, split by the kind of feed item being commented on.
 *
 * Split rather than pooled because a comment that fits a personal record ("вітаю з
 * рекордом") reads as nonsense under an ordinary Tuesday session, and a feed full of
 * misplaced praise is exactly the kind of fake that makes a dev environment useless for
 * judging how the real one will look.
 */
export const COMMENTS_WORKOUT = [
    "Гарна сесія 💪",
    "Скільки відпочивав між підходами?",
    "О, теж сьогодні ноги робив",
    "Красава, тримай темп",
    "Оце обсяг 🔥",
    "Як спина після цього?",
    "Впевнено йде",
    "Я б ще підхід додав",
    "Стабільно кожного тижня, поважаю",
    "Techніка на жимі як?",
    "Теж хочу спробувати цю схему",
    "Скільки за часом вийшло?",
    "Норм так вкатав",
    "Після такого два дні відходиш"
];

export const COMMENTS_RECORD = [
    "Вітаю з рекордом! 🎉",
    "Оце прогрес",
    "Наступного разу +5 кг точно",
    "Ого, красиво",
    "Давно йшов до цього?",
    "Це вже серйозна вага",
    "Респект 🙌",
    "Молодець, заслужено"
];

export const COMMENTS_ACHIEVEMENT = [
    "Заслужено 👏",
    "Красиво закрив",
    "О, я теж близько",
    "Вітаю!",
    "Так тримати",
    "Це було питання часу"
];

export const REPLY_PHRASES = [
    "Дякую!",
    "Дякую 🙏",
    "Та то дрібниці ще",
    "90 секунд десь",
    "Хвилини дві між важкими",
    "Наступного тижня спробую більше",
    "Так, вже пів року так тренуюсь",
    "Спина норм, а от ноги ватні",
    "Приєднуйся 😄"
];

export const WORKOUT_NOTES = [
    "Легко пішло сьогодні",
    "Спав погано, вага не йшла",
    "Зал забитий, чекав лаву",
    "Додав підхід у кінці",
    "Коліно трохи тягне, обережно з присідом",
    "Після відпустки важко",
    "Нарешті нормальний темп",
    "Розминка довша ніж зазвичай",
    "Пробував нову схему",
    ""
];

export const SET_NOTES = ["", "", "", "", "", "легко", "важко пішло", "техніка попливла", "останній чистий"];

/** What a session gets called. Keyed by the split day so the title matches the content. */
export const SESSION_TITLES: Record<string, string[]> = {
    push: ["Push", "Груди + трицепс", "Жимовий день", "Верх — жим"],
    pull: ["Pull", "Спина + біцепс", "Тяговий день", "Верх — тяга"],
    legs: ["Legs", "Ноги", "День ніг", "Ноги + сідниці"],
    upper: ["Upper", "Верх тіла", "Верх"],
    lower: ["Lower", "Низ тіла", "Низ + кор"],
    full_body: ["Full Body", "Все тіло", "Загальна сесія"],
    cardio: ["Кардіо", "Біг", "Кардіо + кор"]
};

export const CARDIO_TYPES = ["run", "bike", "row", "walk", "elliptical", "swim"];

export const FEATURE_REQUEST_IDEAS: { type: string; title: string; description: string }[] = [
    { type: "feature", title: "Таймер між підходами на екрані блокування", description: "Щоб не розблоковувати телефон щоразу." },
    { type: "improvement", title: "Показувати тоннаж за тиждень", description: "Зараз видно тільки за тренування." },
    { type: "fix", title: "Клавіатура перекриває поле ваги", description: "На маленьких екранах доводиться скролити." },
    { type: "feature", title: "Експорт у CSV", description: "Хочу побудувати свої графіки." },
    { type: "improvement", title: "Більше варіантів відпочинку в суперсеті", description: "45 секунд бракує." },
    { type: "feature", title: "Нагадування про тренування", description: "Пуш за годину до звичного часу." }
];

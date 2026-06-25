import { PrismaClient, WorkoutSetType, WorkoutStatus } from "@prisma/client";

const prisma = new PrismaClient();

const users = [
    { id: "user-daniil", email: "daniil@example.com", displayName: "Dunskyi", name: "Данило Шкарупа", height: 185, bodyweight: 78, gender: "male", trainingGoal: "Суха сила і видимий прогрес", trainingExperience: "4 роки", favoriteMuscleGroup: "Спина" },
    { id: "user-anastasia", email: "anastasia@example.com", displayName: "Nastya", name: "Анастасія Коваль", height: 168, bodyweight: 56, gender: "female", trainingGoal: "Мобільність, тонус і регулярність", trainingExperience: "2 роки", favoriteMuscleGroup: "Сідниці" },
    { id: "user-maxim", email: "maxim@example.com", displayName: "Max", name: "Максим Левченко", height: 181, bodyweight: 84, gender: "male", trainingGoal: "Powerbuilding", trainingExperience: "5 років", favoriteMuscleGroup: "Груди" }
];

const exercises = [
    ["bench-press", "Жим лежачи", ["Bench Press", "Barbell Bench"], "Груди", ["Трицепс", "Плечі"], "Горизонтальний жим", "Штанга", "Сила", "Середній"],
    ["incline-dumbbell-press", "Жим гантелей під кутом", ["Incline Dumbbell Press"], "Груди", ["Плечі", "Трицепс"], "Горизонтальний жим", "Гантелі", "Гіпертрофія", "Середній"],
    ["pull-ups", "Підтягування", ["Pull-ups", "Pullup"], "Спина", ["Біцепс"], "Вертикальна тяга", "Вага тіла", "Сила", "Середній"],
    ["barbell-row", "Тяга штанги в нахилі", ["Barbell Row"], "Спина", ["Біцепс"], "Горизонтальна тяга", "Штанга", "Сила", "Середній"],
    ["lat-pulldown", "Тяга верхнього блока", ["Lat Pulldown"], "Спина", ["Біцепс"], "Вертикальна тяга", "Блок", "Гіпертрофія", "Початковий"],
    ["shoulder-press", "Жим над головою", ["Overhead Press", "OHP"], "Плечі", ["Трицепс"], "Вертикальний жим", "Штанга", "Сила", "Середній"],
    ["lateral-raise", "Підйом гантелей в сторони", ["Lateral Raise"], "Плечі", [], "Підйом", "Гантелі", "Ізоляція", "Початковий"],
    ["barbell-squat", "Присідання зі штангою", ["Barbell Squat"], "Квадрицепс", ["Сідниці", "Задня поверхня стегна"], "Присідання", "Штанга", "Сила", "Просунутий"],
    ["romanian-deadlift", "Румунська тяга", ["Romanian Deadlift", "RDL"], "Задня поверхня стегна", ["Сідниці", "Спина"], "Hinge", "Штанга", "Сила", "Середній"],
    ["leg-press", "Жим ногами", ["Leg Press"], "Квадрицепс", ["Сідниці"], "Присідання", "Тренажер", "Гіпертрофія", "Початковий"],
    ["triceps-pushdown", "Розгинання на блоці", ["Triceps Pushdown"], "Трицепс", [], "Розгинання", "Блок", "Ізоляція", "Початковий"],
    ["hammer-curl", "Молоткові згинання", ["Hammer Curl"], "Біцепс", ["Передпліччя"], "Згинання", "Гантелі", "Ізоляція", "Початковий"],
    ["plank", "Планка", ["Plank"], "Прес", ["Все тіло"], "Кор", "Вага тіла", "Кор", "Початковий"],
    ["treadmill", "Бігова доріжка", ["Treadmill"], "Все тіло", ["Литки"], "Кардіо", "Тренажер", "Кардіо", "Початковий"],
    ["bike", "Велотренажер", ["Bike"], "Квадрицепс", ["Литки"], "Кардіо", "Тренажер", "Кардіо", "Початковий"]
] as const;

const templates = [
    { type: "push", title: "Push", description: "Груди, плечі та трицепс.", exercises: ["bench-press", "incline-dumbbell-press", "shoulder-press", "lateral-raise", "triceps-pushdown"] },
    { type: "pull", title: "Pull", description: "Спина та біцепс.", exercises: ["pull-ups", "barbell-row", "lat-pulldown", "hammer-curl"] },
    { type: "legs", title: "Legs", description: "Присідання, hinge і нижня частина тіла.", exercises: ["barbell-squat", "romanian-deadlift", "leg-press"] },
    { type: "full_body", title: "Full Body", description: "Компактна силова сесія.", exercises: ["bench-press", "pull-ups", "barbell-squat", "plank"] },
    { type: "cardio", title: "Cardio", description: "Тренування з фокусом на кондицію.", exercises: ["treadmill", "bike"] }
];

async function main() {
    await clearData();
    await seedUsers();
    await seedExercises();
    await seedTemplates();
    await seedWorkouts();
    await seedStandards();
    await seedAchievements();
    await seedPersonalRecords();
}

async function clearData() {
    await prisma.userAchievement.deleteMany();
    await prisma.achievement.deleteMany();
    await prisma.personalRecord.deleteMany();
    await prisma.cardioSession.deleteMany();
    await prisma.workoutSet.deleteMany();
    await prisma.workoutExercise.deleteMany();
    await prisma.workout.deleteMany();
    await prisma.workoutTemplateExercise.deleteMany();
    await prisma.workoutTemplate.deleteMany();
    await prisma.strengthStandard.deleteMany();
    await prisma.userBodyweightEntry.deleteMany();
    await prisma.exercise.deleteMany();
    await prisma.oAuthAccount.deleteMany();
    await prisma.userProfile.deleteMany();
    await prisma.user.deleteMany();
}

async function seedUsers() {
    for (const user of users) {
        await prisma.user.create({
            data: {
                id: user.id,
                email: user.email,
                googleId: `demo-google-${user.id}`,
                displayName: user.displayName,
                profile: {
                    create: {
                        name: user.name,
                        displayName: user.displayName,
                        height: user.height,
                        bodyweight: user.bodyweight,
                        gender: user.gender,
                        trainingGoal: user.trainingGoal,
                        trainingExperience: user.trainingExperience,
                        favoriteMuscleGroup: user.favoriteMuscleGroup
                    }
                },
                bodyweightEntries: {
                    create: Array.from({ length: 6 }, (_, index) => ({
                        date: addDays(new Date(), (index - 6) * 7),
                        bodyweight: user.bodyweight + Math.sin(index) * 0.8,
                        notes: "Щотижневий замір"
                    }))
                }
            }
        });
    }
}

async function seedExercises() {
    for (const [slug, name, aliases, primaryMuscleGroup, secondaryMuscleGroups, movementPattern, equipment, category, difficulty] of exercises) {
        await prisma.exercise.create({
            data: {
                slug,
                name,
                aliases,
                primaryMuscleGroup,
                secondaryMuscleGroups,
                movementPattern,
                equipment,
                category,
                difficulty,
                description: `${name} — вправа з фокусом на ${primaryMuscleGroup.toLowerCase()}.`,
                techniqueSteps: ["Налаштуй позицію.", "Виконай рух контрольовано.", "Зафіксуй результат."],
                commonMistakes: ["Зайва інерція", "Нестабільна амплітуда"],
                safetyTips: ["Працюй із контрольованим навантаженням."]
            }
        });
    }
}

async function seedTemplates() {
    for (const template of templates) {
        await prisma.workoutTemplate.create({
            data: {
                title: template.title,
                description: template.description,
                type: template.type,
                isPublic: true,
                exercises: {
                    create: template.exercises.map((slug, index) => ({
                        exercise: { connect: { slug } },
                        order: index + 1,
                        targetSets: slug === "treadmill" || slug === "bike" ? null : 3,
                        targetReps: slug === "plank" ? 45 : 8,
                        restSeconds: 90,
                        notes: "Підказка із шаблону"
                    }))
                }
            }
        });
    }
}

async function seedWorkouts() {
    const rows = [
        ["user-daniil", -21, "Push сила", "push", "completed", ["bench-press", "incline-dumbbell-press", "triceps-pushdown"]],
        ["user-daniil", -14, "Pull обсяг", "pull", "completed", ["pull-ups", "barbell-row", "lat-pulldown"]],
        ["user-daniil", -7, "Legs обсяг", "legs", "completed", ["barbell-squat", "romanian-deadlift", "leg-press"]],
        ["user-daniil", 2, "Legs план", "legs", "planned", ["barbell-squat", "romanian-deadlift"]],
        ["user-daniil", 0, "Push активне", "push", "active", ["bench-press", "shoulder-press"]],
        ["user-anastasia", -10, "Кардіо і кор", "cardio", "completed", ["treadmill", "bike", "plank"]],
        ["user-maxim", -5, "Upper щільність", "upper", "completed", ["bench-press", "barbell-row", "shoulder-press"]]
    ] as const;

    for (const [userId, offset, title, workoutType, status, slugs] of rows) {
        const date = addDays(new Date(), offset);
        await prisma.workout.create({
            data: {
                userId,
                date,
                title,
                workoutType,
                status: status as WorkoutStatus,
                startedAt: status !== "planned" ? date : null,
                finishedAt: status === "completed" ? addMinutes(date, 68) : null,
                notes: status === "planned" ? "Заплановано із seed." : "Demo-тренування для GymOS.",
                exercises: {
                    create: slugs.map((slug, index) => ({
                        exercise: { connect: { slug } },
                        order: index + 1,
                        notes: index === 0 ? "Головний рух." : "Допоміжна робота.",
                        sets: ["treadmill", "bike"].includes(slug) ? undefined : {
                            create: [
                                set("warmup", 40 + index * 5, 10, true),
                                set("working", 70 + index * 7, 8, status === "completed"),
                                set("working", 75 + index * 7, 7, status === "completed")
                            ]
                        }
                    }))
                },
                cardioSessions: workoutType === "cardio" ? {
                    create: [
                        { type: "treadmill", durationMinutes: 24, distance: 3.2, calories: 210, averageHeartRate: 132, intensity: "medium", notes: "Контрольований блок" }
                    ]
                } : undefined
            }
        });
    }
}

async function seedStandards() {
    const ranked = ["bench-press", "barbell-squat", "romanian-deadlift", "pull-ups", "shoulder-press", "barbell-row"];
    const levels = [
        ["beginner", 0.45],
        ["novice", 0.7],
        ["third_class", 0.95],
        ["second_class", 1.15],
        ["first_class", 1.35],
        ["candidate_master", 1.55],
        ["master", 1.8]
    ] as const;

    for (const slug of ranked) {
        const exercise = await prisma.exercise.findUnique({ where: { slug } });
        if (!exercise) {
            continue;
        }

        for (const gender of ["male", "female"]) {
            for (const [level, multiplier] of levels) {
                await prisma.strengthStandard.create({
                    data: {
                        exerciseId: exercise.id,
                        gender,
                        bodyweightMin: 70,
                        bodyweightMax: 90,
                        level,
                        requiredWeight: Math.round(80 * multiplier * (gender === "female" ? 0.62 : 1)),
                        repetitions: slug === "pull-ups" ? 5 : 1,
                        sourceName: "Демо-нормативи",
                        sourceNote: "Демо-нормативи використовуються лише для прикладу. Їх можна оновити під реальні стандарти пізніше."
                    }
                });
            }
        }
    }
}

async function seedAchievements() {
    const achievementRows = [
        ["first-workout", "Перше тренування", "Завершити перше тренування.", "Ритм", 1, "completedWorkouts"],
        ["first-pr", "Перший особистий рекорд", "Зафіксувати будь-який PR.", "Сила", 1, "personalRecords"],
        ["cardio-100", "100 хвилин кардіо", "Побудувати базу кондиції.", "Кардіо", 100, "cardioMinutes"]
    ] as const;

    for (const [key, title, description, category, target, metric] of achievementRows) {
        const achievement = await prisma.achievement.create({ data: { key, title, description, category, target, metric } });
        await prisma.userAchievement.create({
            data: {
                userId: "user-daniil",
                achievementId: achievement.id,
                progress: key === "cardio-100" ? 34 : 1,
                unlockedAt: key === "cardio-100" ? null : new Date()
            }
        });
    }
}

async function seedPersonalRecords() {
    const bench = await prisma.exercise.findUnique({ where: { slug: "bench-press" } });
    const workout = await prisma.workout.findFirst({ where: { userId: "user-daniil", status: "completed" } });
    if (!bench || !workout) {
        return;
    }

    await prisma.personalRecord.create({
        data: {
            userId: "user-daniil",
            exerciseId: bench.id,
            workoutId: workout.id,
            type: "estimated_one_rep_max",
            value: 94.5,
            estimatedOneRepMax: 94.5,
            weight: 75,
            repetitions: 8,
            isEstimated: true
        }
    });
}

function set(type: WorkoutSetType, weight: number, repetitions: number, isCompleted: boolean) {
    return {
        type,
        weight,
        repetitions,
        rpe: type === "warmup" ? 5 : 8,
        restSeconds: type === "warmup" ? 60 : 105,
        isCompleted
    };
}

function addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function addMinutes(date: Date, minutes: number) {
    const result = new Date(date);
    result.setMinutes(result.getMinutes() + minutes);
    return result;
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (error) => {
        console.error(error);
        await prisma.$disconnect();
        process.exit(1);
    });

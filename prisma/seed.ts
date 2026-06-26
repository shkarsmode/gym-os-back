import { PrismaClient, WorkoutSetType, WorkoutStatus } from "@prisma/client";

const prisma = new PrismaClient();

const users = [
    { id: "user-daniil", email: "daniil@example.com", displayName: "Dunskyi", name: "Данило Шкарупа", height: 185, bodyweight: 78, gender: "male", trainingGoal: "Суха сила і видимий прогрес", trainingExperience: "4 роки", favoriteMuscleGroup: "Спина" },
    { id: "user-anastasia", email: "anastasia@example.com", displayName: "Nastya", name: "Анастасія Коваль", height: 168, bodyweight: 56, gender: "female", trainingGoal: "Мобільність, тонус і регулярність", trainingExperience: "2 роки", favoriteMuscleGroup: "Сідниці" },
    { id: "user-maxim", email: "maxim@example.com", displayName: "Max", name: "Максим Левченко", height: 181, bodyweight: 84, gender: "male", trainingGoal: "Powerbuilding", trainingExperience: "5 років", favoriteMuscleGroup: "Груди" }
];

const exercises = [
    ["bench-press", "Жим лежачи", ["Bench Press", "Barbell Bench"], "Груди", ["Трицепс", "Плечі"], "Горизонтальний жим", "Штанга", "Сила", "Середній"],
    ["lat-pulldown", "Тяга верхнього блока", ["Lat Pulldown"], "Спина", ["Біцепс"], "Вертикальна тяга", "Блок", "Гіпертрофія", "Початковий"]
] as const;

const templates = [
    { type: "push", title: "Push", description: "Базовий жим для грудей.", exercises: ["bench-press"] },
    { type: "pull", title: "Pull", description: "Вертикальна тяга для спини.", exercises: ["lat-pulldown"] },
    { type: "upper", title: "Upper", description: "Компактна сесія верху.", exercises: ["bench-press", "lat-pulldown"] },
    { type: "full_body", title: "Full Body", description: "Мінімальна силова сесія з curated-каталогу.", exercises: ["bench-press", "lat-pulldown"] }
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
        ["user-daniil", -21, "Push сила", "push", "completed", ["bench-press"]],
        ["user-daniil", -14, "Pull обсяг", "pull", "completed", ["lat-pulldown"]],
        ["user-daniil", 2, "Pull план", "pull", "planned", ["lat-pulldown"]],
        ["user-daniil", 0, "Push активне", "push", "active", ["bench-press"]],
        ["user-anastasia", -10, "Кардіо і мобільність", "cardio", "completed", []],
        ["user-maxim", -5, "Upper щільність", "upper", "completed", ["bench-press", "lat-pulldown"]]
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
    const ranked = ["bench-press", "lat-pulldown"];
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
                        repetitions: 1,
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

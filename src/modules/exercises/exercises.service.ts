import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Exercise, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { RequestUser } from "../../shared/current-user.decorator";
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

@Injectable()
export class ExercisesService {
    constructor(private readonly prisma: PrismaService) {}

    async findAll() {
        await this.ensureCuratedCatalogWhenEmpty();
        return this.prisma.exercise.findMany({ orderBy: { name: "asc" } });
    }

    async findOne(id: string) {
        const exercise = await this.prisma.exercise.findUnique({ where: { id } });
        if (!exercise) {
            throw new NotFoundException("Exercise not found");
        }
        return exercise;
    }

    create(userId: string, dto: CreateExerciseDto) {
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
                createdByUserId: userId
            }
        });
    }

    async update(userId: string, id: string, dto: UpdateExerciseDto) {
        const exercise = await this.findOne(id);
        if (exercise.createdByUserId && exercise.createdByUserId !== userId) {
            throw new ForbiddenException("Cannot edit another user's custom exercise");
        }

        return this.prisma.exercise.update({
            where: { id },
            data: {
                ...dto,
                aliases: dto.aliases,
                secondaryMuscleGroups: dto.secondaryMuscleGroups,
                techniqueSteps: dto.techniqueSteps,
                commonMistakes: dto.commonMistakes,
                safetyTips: dto.safetyTips
            }
        });
    }

    async remove(userId: string, id: string) {
        const exercise = await this.findOne(id);
        if (!exercise.isCustom || exercise.createdByUserId !== userId) {
            throw new ForbiddenException("Only the owner can delete a custom exercise");
        }

        await this.prisma.exercise.delete({ where: { id } });
        return { ok: true };
    }

    async resetCuratedCatalog(user: RequestUser) {
        this.assertCatalogOwner(user);

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

    private async ensureCuratedCatalogWhenEmpty() {
        const existing = await this.prisma.exercise.findMany({
            where: { slug: { in: curatedExercises.map((exercise) => exercise.slug) } },
            select: { slug: true }
        });
        const existingSlugs = new Set(existing.map((exercise) => exercise.slug));
        const missingCuratedExercises = curatedExercises.filter((exercise) => !existingSlugs.has(exercise.slug));

        if (!missingCuratedExercises.length) {
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

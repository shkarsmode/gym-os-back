import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Exercise, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { RequestUser } from "../../shared/current-user.decorator";
import { isAdminUser, hasUnlimitedQuota } from "../../shared/admin";
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

@Injectable()
export class ExercisesService {
    // Once we've confirmed the curated catalog is seeded we don't need to re-run the
    // lookup on every GET /exercises. Reset on cold start (new instance) and after a
    // catalog reset, so it self-heals.
    private curatedReady = false;

    constructor(private readonly prisma: PrismaService) {}

    async findAll() {
        await this.ensureCuratedCatalogAvailable();
        const [exercises, grouped] = await Promise.all([
            this.prisma.exercise.findMany({ orderBy: { name: "asc" } }),
            this.prisma.exerciseReaction.groupBy({ by: ["exerciseId", "type"], _count: { _all: true } })
        ]);
        const counts = new Map<string, { likeCount: number; dislikeCount: number }>();
        for (const row of grouped) {
            const entry = counts.get(row.exerciseId) || { likeCount: 0, dislikeCount: 0 };
            if (row.type === "like") {
                entry.likeCount = row._count._all;
            } else if (row.type === "dislike") {
                entry.dislikeCount = row._count._all;
            }
            counts.set(row.exerciseId, entry);
        }
        return exercises.map((exercise) => ({
            ...exercise,
            likeCount: counts.get(exercise.id)?.likeCount || 0,
            dislikeCount: counts.get(exercise.id)?.dislikeCount || 0
        }));
    }

    // Map of { exerciseId: "like" | "dislike" } for the current user (for the UI
    // state + the liked-first sort). Kept separate from the cached public catalog.
    async getMyReactions(user: RequestUser) {
        const rows = await this.prisma.exerciseReaction.findMany({
            where: { userId: user.id },
            select: { exerciseId: true, type: true }
        });
        const map: Record<string, string> = {};
        for (const row of rows) {
            map[row.exerciseId] = row.type;
        }
        return map;
    }

    // Set, change, or clear (type "none") the current user's reaction; returns the
    // exercise's fresh counts so the client can reconcile its optimistic update.
    async react(user: RequestUser, id: string, type: string) {
        await this.findOne(id);
        if (type === "none" || !type) {
            await this.prisma.exerciseReaction.deleteMany({ where: { exerciseId: id, userId: user.id } });
        } else if (type === "like" || type === "dislike") {
            await this.prisma.exerciseReaction.upsert({
                where: { exerciseId_userId: { exerciseId: id, userId: user.id } },
                update: { type },
                create: { exerciseId: id, userId: user.id, type }
            });
        } else {
            throw new BadRequestException("Reaction type must be like, dislike or none");
        }
        const [likeCount, dislikeCount] = await Promise.all([
            this.prisma.exerciseReaction.count({ where: { exerciseId: id, type: "like" } }),
            this.prisma.exerciseReaction.count({ where: { exerciseId: id, type: "dislike" } })
        ]);
        const myReaction = type === "none" || !type ? null : type;
        return { id, likeCount, dislikeCount, myReaction };
    }

    async findOne(id: string) {
        const exercise = await this.prisma.exercise.findUnique({ where: { id } });
        if (!exercise) {
            throw new NotFoundException("Exercise not found");
        }
        return exercise;
    }

    async create(user: RequestUser, dto: CreateExerciseDto) {
        // Free tier: 1 custom exercise per month; admins & premium are unlimited.
        if (!hasUnlimitedQuota(user)) {
            await assertExerciseQuota(this.prisma, user.id);
        }
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

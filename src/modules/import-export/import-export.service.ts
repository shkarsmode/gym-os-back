import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { WorkoutSetType, WorkoutStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { RequestUser } from "../../shared/current-user.decorator";
import { isAdminUser, isSuperAdminUser } from "../../shared/admin";
import { duplicateKeys, normalizeExerciseCatalogPayload } from "./exercise-catalog-importer";
// Shared with /scoring so both feed the scoring kernel identical data — two
// near-identical serializers would drift and nobody would notice until a level moved.
import { dateInput, numberValue, serializeWorkout, serializeWorkoutSummary } from "../../shared/serialize";
import { WORKOUT_PAGE_ORDER, encodeCursor } from "../../shared/cursor";
import { ScoringService } from "../scoring/scoring.service";

@Injectable()
export class ImportExportService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly scoring: ScoringService
    ) {}

    /**
     * The boot payload.
     *
     * Two shapes behind one route, so client and server can deploy in either order:
     *
     *   legacy (default)  version 3, every workout of every user, fully hydrated.
     *   windowed          version 4. Own workouts hydrated but limited to a window;
     *                     peers reduced to summaries carrying aggregates and no sets;
     *                     progression computed server-side and shipped in `scoring`.
     *
     * The windowed shape only makes sense together with server-side scoring: the client
     * derives XP, levels, records and all 39 achievements from the complete lifetime
     * corpus, so truncating history without replacing that computation would silently
     * give every member a wrong-but-plausible level.
     */
    async export(user: RequestUser, options: { windowed?: boolean; ownLimit?: number } = {}) {
        const requesterIsAdmin = isAdminUser(user);
        const windowed = options.windowed === true;
        // 30 covers the history list, the recent-workouts strips and several weeks of
        // scrollback without a second request for the overwhelmingly common session.
        const ownLimit = Math.min(Math.max(options.ownLimit || 30, 1), 200);
        // Peers are needed for the calendar, the day sheet and the activity feed, all of
        // which look at recent activity only. Sixty days keeps those surfaces intact
        // while dropping the long tail that dominates the payload.
        const peerWindowStart = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
        // strengthStandards intentionally not exported anymore — the demo standards
        // are dropped from the payload; the frontend links to real external
        // strength-standard references instead.
        const [users, exercises, bodyweightEntries, workouts] = await Promise.all([
            this.prisma.user.findMany({ include: { profile: true }, orderBy: { createdAt: "asc" } }),
            this.prisma.exercise.findMany({ orderBy: { name: "asc" } }),
            // Scoped to the caller: bodyweight is health data and no peer surface renders
            // it. bodyweightChart (app.js) has exactly one call site, inside profile(),
            // always with currentUser().id — so every other user's log was transmitted
            // to every client and displayed nowhere.
            this.prisma.userBodyweightEntry.findMany({ where: { userId: user.id }, orderBy: { date: "asc" } }),
            this.prisma.workout.findMany({
                // In windowed mode this fetch is scoped to the caller and limited; one
                // extra row is taken so we can tell "there is another page" from "this
                // is the end" without a second count query.
                where: windowed ? { userId: user.id } : undefined,
                take: windowed ? ownLimit + 1 : undefined,
                include: {
                    exercises: { include: { sets: true }, orderBy: { order: "asc" } },
                    cardioSessions: true
                },
                // date DESC is load-bearing beyond paging: the scoring kernel resolves
                // tied one-rep-max records by visit order, so ascending input would move
                // personal-record dates. See shared/serialize.ts.
                orderBy: WORKOUT_PAGE_ORDER
            })
        ]);

        // Shared like/dislike counts + this user's own reaction, merged onto each
        // exercise so the catalog can show totals and sort liked-first for everyone.
        // Degrades to empty if the ExerciseReaction table isn't migrated yet — /export
        // must never 500 on a missing table.
        const reactionCounts = new Map<string, { likeCount: number; dislikeCount: number }>();
        const myReactionMap = new Map<string, string>();
        try {
            const [reactionGroups, myReactions] = await Promise.all([
                this.prisma.exerciseReaction.groupBy({ by: ["exerciseId", "type"], _count: { _all: true } }),
                this.prisma.exerciseReaction.findMany({ where: { userId: user.id }, select: { exerciseId: true, type: true } })
            ]);
            for (const group of reactionGroups) {
                const entry = reactionCounts.get(group.exerciseId) || { likeCount: 0, dislikeCount: 0 };
                if (group.type === "like") {
                    entry.likeCount = group._count._all;
                } else if (group.type === "dislike") {
                    entry.dislikeCount = group._count._all;
                }
                reactionCounts.set(group.exerciseId, entry);
            }
            for (const row of myReactions) {
                myReactionMap.set(row.exerciseId, row.type);
            }
        } catch (error) {
            // ExerciseReaction table not migrated yet — export without reactions.
        }

        // Feature-request / feedback board (public). Degrades to [] if the table
        // isn't created yet so /export can never 500 on a missing table.
        let featureRequests: Array<{ id: string; userId: string; type: string; title: string; description: string | null; status: string; createdAt: Date; updatedAt: Date }> = [];
        try {
            featureRequests = await this.prisma.featureRequest.findMany({ orderBy: { createdAt: "desc" } });
        } catch (error) {
            featureRequests = [];
        }

        // --- windowed extras -------------------------------------------------------
        // Fetched only for the windowed shape so the legacy path costs exactly what it
        // did before and cannot regress.
        let ownWorkouts = workouts;
        let peerSummaries: ReturnType<typeof serializeWorkoutSummary>[] = [];
        let workoutsCursor: string | null = null;
        let scoring: Awaited<ReturnType<ScoringService["scoreEveryone"]>> | null = null;

        if (windowed) {
            // The extra row taken above answers "is there more?" — drop it before
            // serializing, and cursor from the last row actually returned.
            const hasMore = workouts.length > ownLimit;
            ownWorkouts = hasMore ? workouts.slice(0, ownLimit) : workouts;
            const last = ownWorkouts[ownWorkouts.length - 1];
            workoutsCursor = hasMore && last ? encodeCursor(last) : null;

            const [activeOutsideWindow, peers, computed] = await Promise.all([
                // An in-progress workout must always be present regardless of the
                // window, or a member who leaves one running and comes back weeks later
                // opens the app to no active session and starts a duplicate.
                this.prisma.workout.findMany({
                    where: {
                        userId: user.id,
                        status: "active",
                        id: { notIn: ownWorkouts.map((item) => item.id) }
                    },
                    include: { exercises: { include: { sets: true }, orderBy: { order: "asc" } }, cardioSessions: true }
                }),
                // Peers as summaries: enough for the calendar, day sheet and activity
                // feed, without a single set crossing the wire.
                this.prisma.workout.findMany({
                    where: { userId: { not: user.id }, date: { gte: peerWindowStart } },
                    include: { exercises: { include: { sets: true }, orderBy: { order: "asc" } }, cardioSessions: true },
                    orderBy: WORKOUT_PAGE_ORDER
                }),
                this.scoring.scoreEveryone()
            ]);

            ownWorkouts = [...activeOutsideWindow, ...ownWorkouts];
            peerSummaries = peers.map(serializeWorkoutSummary);

            // Strip peer XP ledgers. Only the caller's own ledger is ever rendered (the
            // Прокачка tab); for everyone else the leaderboard needs nothing but the xp
            // total and the level. Measured on production this is 18.6 KB of the 45.6 KB
            // scoring block, almost all of it for people whose ledger nobody can open.
            scoring = {
                ...computed,
                users: Object.fromEntries(Object.entries(computed.users).map(([id, entry]) => [
                    id,
                    id === user.id ? entry : { ...entry, xpLedger: [] }
                ]))
            };
        }

        return {
            // Bumped so a client can tell the shapes apart. databaseProblem accepts
            // version >= 3, so an old client handed a v4 payload still boots.
            version: windowed ? 4 : 3,
            shape: windowed ? "windowed" : "full",
            ...(windowed ? { workoutsCursor, scoring } : {}),
            currentUserId: user.id,
            users: users.map((item) => ({
                id: item.id,
                name: item.profile?.name || item.displayName,
                displayName: item.profile?.displayName || item.displayName,
                avatarInitials: initials(item.profile?.displayName || item.displayName),
                avatarColor: colorFor(item.id),
                avatarUrl: item.avatarUrl || "",
                email: requesterIsAdmin ? (item.email || "") : "",
                // Only admins (who run the approval queue) see real approval state;
                // for everyone else peers always read as approved so we don't leak
                // who is still pending.
                approved: requesterIsAdmin ? (item.approved ?? false) : true,
                role: item.role || "free",
                isSuperAdmin: isSuperAdminUser(item),
                height: item.profile?.height || 0,
                bodyweight: numberValue(item.profile?.bodyweight, 0),
                birthYear: 2000,
                gender: item.profile?.gender || "male",
                trainingGoal: item.profile?.trainingGoal || "Персональний прогрес",
                trainingExperience: item.profile?.trainingExperience || "Не вказано",
                favoriteMuscleGroup: item.profile?.favoriteMuscleGroup || "Все тіло",
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })),
            exercises: exercises.map((item) => ({
                id: item.id,
                name: item.name,
                aliases: item.aliases,
                primaryMuscleGroup: item.primaryMuscleGroup,
                secondaryMuscleGroups: item.secondaryMuscleGroups,
                movementPattern: item.movementPattern,
                equipment: item.equipment,
                category: item.category,
                difficulty: item.difficulty,
                description: item.description || "",
                techniqueSteps: item.techniqueSteps,
                commonMistakes: item.commonMistakes,
                safetyTips: item.safetyTips,
                mediaUrl: item.mediaUrl || "",
                mediaType: item.mediaType,
                sourceName: item.sourceName,
                sourceUrl: item.sourceUrl,
                originalName: item.originalName,
                licenseStatus: item.licenseStatus,
                mediaReferences: item.mediaReferences,
                isCustom: item.isCustom,
                status: item.status,
                createdByUserId: item.createdByUserId,
                likeCount: reactionCounts.get(item.id)?.likeCount || 0,
                dislikeCount: reactionCounts.get(item.id)?.dislikeCount || 0,
                myReaction: myReactionMap.get(item.id) || null,
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })),
            bodyweightEntries: bodyweightEntries.map((item) => ({
                id: item.id,
                userId: item.userId,
                date: dateInput(item.date),
                bodyweight: numberValue(item.bodyweight, 0),
                notes: item.notes || ""
            })),
            // Own workouts hydrated; peers as summaries with aggregates but no sets.
            // In legacy mode peerSummaries is empty and this is every workout, as before.
            workouts: [...ownWorkouts.map(serializeWorkout), ...peerSummaries],
            featureRequests: featureRequests.map((item) => ({
                id: item.id,
                userId: item.userId,
                type: item.type,
                title: item.title,
                description: item.description || "",
                status: item.status,
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })),
            exportedAt: new Date().toISOString()
        };
    }

    async startImport(user: RequestUser, payload: any) {
        // This wipes the named resources before any replacement chunk is written, so it
        // is gated twice: an explicit resource list (readImportResources throws otherwise)
        // and an explicit confirmation token, so no accidental or empty POST can reach it.
        if (payload?.confirm !== "replace") {
            throw new BadRequestException('confirm must be "replace" to erase existing data');
        }

        const resources = readImportResources(payload?.resources);

        // Batch-array form, not the interactive callback — see the note in
        // workouts.service.ts: the production pooler (Neon/pgbouncer, transaction mode)
        // does not support interactive transactions and hangs until the function times out.
        const operations: any[] = [];
        if (resources.includes("workouts")) {
            operations.push(this.prisma.workout.deleteMany({ where: { userId: user.id } }));
        }

        if (resources.includes("bodyweightEntries")) {
            operations.push(this.prisma.userBodyweightEntry.deleteMany({ where: { userId: user.id } }));
        }

        if (resources.includes("customExercises")) {
            operations.push(this.prisma.exercise.deleteMany({ where: { isCustom: true, createdByUserId: user.id } }));
        }

        await this.prisma.$transaction(operations);

        return {
            ok: true,
            resources
        };
    }

    async importChunk(user: RequestUser, payload: any) {
        const resource = String(payload?.resource || "");
        const items = Array.isArray(payload?.items) ? payload.items : [];

        if (!["customExercises", "bodyweightEntries", "workouts"].includes(resource)) {
            return {
                ok: false,
                resource,
                imported: 0,
                message: "Unsupported import resource"
            };
        }

        const imported = await this.prisma.$transaction(async (transaction) => {
            if (resource === "customExercises") {
                const customExercises = items.filter((item: any) => item?.isCustom && item?.createdByUserId === user.id);
                await importCustomExercises(transaction, user.id, customExercises);
                return customExercises.length;
            }

            if (resource === "bodyweightEntries") {
                const bodyweightEntries = items.filter((item: any) => item?.userId === user.id);
                await importBodyweightEntries(transaction, user.id, bodyweightEntries);
                return bodyweightEntries.length;
            }

            const workouts = items.filter((item: any) => item?.userId === user.id);
            await importWorkouts(transaction, user.id, workouts);
            return workouts.length;
        });

        return {
            ok: true,
            resource,
            imported
        };
    }

    async finishImport(user: RequestUser, payload: any) {
        const [workouts, bodyweightEntries, customExercises] = await Promise.all([
            this.prisma.workout.count({ where: { userId: user.id } }),
            this.prisma.userBodyweightEntry.count({ where: { userId: user.id } }),
            this.prisma.exercise.count({ where: { isCustom: true, createdByUserId: user.id } })
        ]);

        return {
            ok: true,
            requested: payload || {},
            imported: {
                workouts,
                bodyweightEntries,
                customExercises
            }
        };
    }

    async importExercises(user: RequestUser, payload: unknown) {
        this.assertExerciseImportPermission(user);

        const existing = await this.prisma.exercise.findMany({
            select: { slug: true, originalName: true, sourceUrl: true }
        });
        const existingKeys = new Set(existing.flatMap((item) => duplicateKeys({
            slug: item.slug,
            originalName: item.originalName,
            sourceUrl: item.sourceUrl
        })));
        const result = normalizeExerciseCatalogPayload(payload, existingKeys);

        for (const exercise of result.exercises) {
            await this.prisma.exercise.create({ data: exercise as any });
        }

        return {
            ok: true,
            imported: result.exercises.length,
            skipped: result.skipped,
            source: "ExRx.net"
        };
    }

    private assertExerciseImportPermission(user: RequestUser) {
        const adminEmails = String(process.env.ADMIN_EMAILS || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
        const email = user.email.toLowerCase();
        if (adminEmails.includes(email) || email === "daniil@example.com" || user.id === "user-daniil") {
            return;
        }
        throw new ForbiddenException("Exercise catalog import requires admin or demo owner access");
    }
}

function exerciseData(exercise: any, userId: string) {
    return {
        name: exercise.name,
        aliases: exercise.aliases || [],
        primaryMuscleGroup: exercise.primaryMuscleGroup || "Все тіло",
        secondaryMuscleGroups: exercise.secondaryMuscleGroups || [],
        movementPattern: exercise.movementPattern || "Ізоляція",
        equipment: exercise.equipment || "Інше",
        category: exercise.category || "Custom",
        difficulty: exercise.difficulty || "Середній",
        description: exercise.description || "",
        techniqueSteps: exercise.techniqueSteps || [],
        commonMistakes: exercise.commonMistakes || [],
        safetyTips: exercise.safetyTips || [],
        mediaUrl: exercise.mediaUrl || null,
        mediaType: exercise.mediaType || "none",
        isCustom: true,
        createdByUserId: userId
    };
}

// A restore must name exactly what it replaces. This used to default to ALL THREE
// resources when `resources` was absent or unrecognised, which made a ~30-byte
// `POST /import/start {}` silently delete every workout, bodyweight entry and custom
// exercise belonging to the caller. Never widen a destructive scope on missing input.
export function readImportResources(resources: unknown) {
    const allowedResources = ["customExercises", "bodyweightEntries", "workouts"];
    if (!Array.isArray(resources)) {
        throw new BadRequestException("resources must be a non-empty array naming what to replace");
    }

    const requestedResources = resources
        .map((item) => String(item))
        .filter((item) => allowedResources.includes(item));

    if (requestedResources.length === 0) {
        throw new BadRequestException(`resources must name at least one of: ${allowedResources.join(", ")}`);
    }

    return [...new Set(requestedResources)];
}

async function importCustomExercises(transaction: any, userId: string, customExercises: any[]) {
    for (const exercise of customExercises) {
        await transaction.exercise.upsert({
            where: { id: exercise.id },
            update: exerciseData(exercise, userId),
            create: { id: exercise.id, slug: slugify(exercise.name), ...exerciseData(exercise, userId) }
        });
    }
}

async function importBodyweightEntries(transaction: any, userId: string, bodyweightEntries: any[]) {
    for (const entry of bodyweightEntries) {
        await transaction.userBodyweightEntry.upsert({
            where: { id: entry.id },
            update: {
                date: parseDate(entry.date),
                bodyweight: Number(entry.bodyweight) || 0,
                notes: entry.notes || null
            },
            create: {
                id: entry.id,
                userId,
                date: parseDate(entry.date),
                bodyweight: Number(entry.bodyweight) || 0,
                notes: entry.notes || null
            }
        });
    }
}

async function importWorkouts(transaction: any, userId: string, workouts: any[]) {
    for (const workout of workouts) {
        // Delete by id alone (ids are globally unique) so a leftover row from a
        // previous/overlapping import never triggers a unique-constraint failure on create.
        await transaction.workout.deleteMany({ where: { id: workout.id } });
        await transaction.workout.create({
            data: {
                id: workout.id,
                userId,
                date: parseDate(workout.date),
                title: workout.title || "Тренування",
                status: (workout.status || "planned") as WorkoutStatus,
                workoutType: workout.workoutType || "custom",
                startedAt: workout.startedAt ? parseDate(workout.startedAt) : null,
                finishedAt: workout.finishedAt ? parseDate(workout.finishedAt) : null,
                durationOverride: workout.durationOverride === undefined || workout.durationOverride === null ? null : Math.round(Number(workout.durationOverride)),
                notes: workout.notes || null,
                exercises: {
                    create: (workout.exercises || []).map((exercise: any, index: number) => ({
                        id: exercise.id,
                        exerciseId: exercise.exerciseId,
                        order: exercise.order || index + 1,
                        notes: exercise.notes || null,
                        sets: {
                            create: (exercise.sets || []).map((set: any) => ({
                                id: set.id,
                                type: (set.type || "working") as WorkoutSetType,
                                weight: Number(set.weight) || 0,
                                repetitions: Number(set.repetitions) || 0,
                                rpe: Number(set.rpe) || null,
                                restSeconds: Number(set.restSeconds) || 90,
                                isCompleted: Boolean(set.isCompleted),
                                notes: set.notes || null
                            }))
                        }
                    }))
                },
                cardioSessions: {
                    create: (workout.cardioSessions || []).map((session: any) => ({
                        id: session.id,
                        type: session.type || "treadmill",
                        durationMinutes: Number(session.durationMinutes) || 0,
                        distance: Number(session.distance) || null,
                        calories: Number(session.calories) || null,
                        averageHeartRate: Number(session.averageHeartRate) || null,
                        intensity: session.intensity || null,
                        notes: session.notes || null
                    }))
                }
            }
        });
    }
}

function initials(value: string) {
    return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "GO";
}

function colorFor(value: string) {
    const palette = ["#8c6f3f", "#6e604a", "#465369", "#5d6a57", "#7a5d54"];
    const index = value.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length;
    return palette[index];
}

// numberValue and dateInput now live in ../../shared/serialize so /export and /scoring
// cannot drift apart in how they present the same rows to the scoring kernel.

function parseDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
}

function slugify(value: string) {
    return value.toLowerCase().trim().replace(/[^a-z0-9а-яіїєґ]+/gi, "-").replace(/^-|-$/g, "");
}

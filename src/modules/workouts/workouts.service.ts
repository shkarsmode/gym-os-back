import { ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { LiveBus } from "../live/live.bus";
import { WorkoutSetType, WorkoutStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { parseDateInput } from "../../shared/parse-date";
import { assertWorkoutQuota as enforceWorkoutQuota } from "../../shared/workout-quota";
import { QuotaTier } from "../../shared/admin";
import { WORKOUT_PAGE_ORDER, cursorFilter, decodeCursor, encodeCursor } from "../../shared/cursor";
import { serializeWorkout } from "../../shared/serialize";
import { Visibility } from "../../shared/visibility";
import { AddWorkoutExerciseDto, CreateCardioSessionDto, CreateWorkoutDto, CreateWorkoutSetDto, SaveWorkoutDto, UpdateCardioSessionDto, UpdateWorkoutDto, UpdateWorkoutExerciseDto, UpdateWorkoutSetDto } from "./dto/workout.dto";

function parseOptionalDate(value?: string | null): Date | null {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}

@Injectable()
export class WorkoutsService {
    // LiveBus is @Optional so the service stays constructible as `new WorkoutsService(prisma)`
    // in the unit tests, which have no Nest container. Every publish site is guarded.
    constructor(
        private readonly prisma: PrismaService,
        @Optional() private readonly live?: LiveBus
    ) {}

    /**
     * Tell this person's other devices that some of their workouts moved.
     *
     * Only ids and a version travel — never content. A listener answers by re-reading
     * through the normal guarded route, so this can never widen what anyone may see, and
     * a failure here can never corrupt anything: the write has already committed and the
     * worst case is the old behaviour of finding out on the next refresh.
     */
    private announce(
        userId: string,
        name: "workout.changed" | "workout.deleted",
        ids: string[],
        version?: string | null,
        // Whether this write changed something OTHER people can see: the session opened
        // or closed, the first set was ticked, the row appeared or vanished.
        //
        // Deliberately not "always". saveFull runs on every autosave — several times a
        // minute for the whole length of a session — and telling the entire gym to
        // re-read on each of those turns one person training into a steady broadcast to
        // every connected device that changes nothing on any of their screens.
        touches: { presence?: boolean; feed?: boolean; peers?: boolean } | null = null
    ) {
        if (!this.live || !userId || !ids.length) {
            return;
        }
        try {
            this.live.publish(userId, { name, ids, version: version ?? null, at: new Date().toISOString() });
            if (touches && (touches.presence || touches.feed || touches.peers)) {
                this.live.broadcast({ name: "team.changed", ids, touches, at: new Date().toISOString() });
            }
        } catch (error) {
            // Never let a notification failure surface as a failed save.
        }
    }

    /**
     * The caller's own history, one page at a time.
     *
     * Serves "load more" under the windowed boot payload, which ships only the most
     * recent slice. Hydrated rows, because this is the user's own data and the history
     * list can expand a workout inline.
     */
    async findMine(userId: string, limit?: number, cursor?: string) {
        const take = Math.min(Math.max(limit || 30, 1), 100);
        const decoded = decodeCursor(cursor);
        const rows = await this.prisma.workout.findMany({
            where: { userId, ...cursorFilter(decoded) },
            // One extra row distinguishes "there is another page" from "this is the end"
            // without a second count query.
            take: take + 1,
            include: { exercises: { include: { sets: true }, orderBy: { order: "asc" } }, cardioSessions: true },
            orderBy: WORKOUT_PAGE_ORDER
        });

        const hasMore = rows.length > take;
        const page = hasMore ? rows.slice(0, take) : rows;
        const last = page[page.length - 1];
        return {
            workouts: page.map(serializeWorkout),
            nextCursor: hasMore && last ? encodeCursor(last) : null
        };
    }

    // Scoped to the caller. This is about to become the peer-hydration path (opening a
    // teammate's workout fetches it here instead of receiving every set in the boot
    // payload), so it decides what one member may read of another's.
    //
    // Own workouts: always. Peers: completed ones only — those already appear in the
    // team feed and calendar, so the sets behind them are not new information. A peer's
    // planned or in-progress workout stays private; 404 rather than 403 so the response
    // does not confirm the id exists.
    async findOne(id: string, callerId: string, isAdmin = false, visibility?: Visibility) {
        // Ownership is settled from a scalar read BEFORE the sets are fetched. Loading
        // the tree and then deciding not to send it would mean a private member's every
        // repetition had already left the database — the requirement is that it never
        // does, not that it is stripped on the way out.
        const owner = await this.prisma.workout.findUnique({
            where: { id },
            select: { userId: true, status: true }
        });
        if (!owner) {
            throw new NotFoundException("Workout not found");
        }
        const isOwner = owner.userId === callerId;
        // There used to be a second, implicit privacy rule here: a peer's planned or
        // in-progress session was refused outright. It predates this app having any real
        // privacy model and now contradicts it — a session is shared by default, and the
        // owner's own setting is the single thing that decides otherwise. Keeping both
        // meant a teammate's live session read as "Деталі недоступні" to everyone,
        // including people the owner had never hidden anything from.
        if (!isOwner && visibility && !visibility.canSeeDetail(owner.userId)) {
            // 403 with a code, not the 404 used above: the caller is meant to see that
            // this session exists and to be offered the chance to ask for access. Hiding
            // its existence would make the request button impossible to explain.
            throw new ForbiddenException({
                code: "WORKOUT_PRIVATE",
                ownerId: owner.userId,
                message: "This member keeps their workout details private."
            });
        }
        const workout = await this.prisma.workout.findUnique({
            where: { id },
            include: this.includeWorkout()
        });
        if (!workout) {
            throw new NotFoundException("Workout not found");
        }
        // Serialize like every other workout-returning route. Raw Prisma sends weight and
        // rpe as Decimals (JSON strings) and date as a full timestamp, so a client merging
        // this row into its store got string weights and a date that no longer matched the
        // YYYY-MM-DD every other row carries.
        return serializeWorkout(workout);
    }

    async create(userId: string, dto: CreateWorkoutDto, tier: QuotaTier = "free") {
        const date = parseDateInput(dto.date);
        await enforceWorkoutQuota(this.prisma, userId, date, tier);
        const now = new Date();
        const created = await this.prisma.workout.create({
            data: {
                userId,
                date,
                title: dto.title,
                status: dto.status || "planned",
                workoutType: dto.workoutType,
                startedAt: dto.status === "active" ? now : undefined,
                finishedAt: dto.status === "completed" ? now : undefined,
                notes: dto.notes
            },
            include: this.includeWorkout()
        });
        // This announced nothing at all until now, so a session planned from the calendar
        // on one device simply never appeared on another until a reload.
        this.announce(userId, "workout.changed", [created.id], created.updatedAt?.toISOString(), {
            presence: created.status === "active",
            peers: true,
            feed: created.status === "completed"
        });
        return created;
    }

    // Atomic full upsert of a single workout (scalars + nested exercises/sets/cardio).
    // Replaces the fragile "wipe-everything-then-reimport" save: a failure here rolls
    // back the whole transaction, so a single workout can never be left half-deleted.
    async saveFull(userId: string, id: string, dto: SaveWorkoutDto, isAdmin = false, tier: QuotaTier = "free") {
        const existing = await this.prisma.workout.findUnique({
            where: { id },
            select: {
                id: true,
                userId: true,
                updatedAt: true,
                status: true,
                firstSetAt: true,
                startedAt: true,
                finishedAt: true,
                _count: { select: { exercises: true } }
            }
        });
        if (existing && existing.userId !== userId && !isAdmin) {
            throw new ForbiddenException("Cannot edit another user's workout");
        }

        // Optimistic concurrency. This endpoint replaces the whole tree, so a save built
        // from a stale copy does not merge badly — it deletes whatever the other device
        // added. Refusing here is what turns silent data loss into a recoverable 409 the
        // client answers by re-reading and replaying its edit.
        //
        // Compared at second resolution: `updatedAt` crosses the wire as an ISO string
        // and Postgres keeps microseconds, so an exact equality test would reject every
        // legitimate save on a round-trip.
        if (existing && dto.baseUpdatedAt) {
            const base = Math.floor(new Date(dto.baseUpdatedAt).getTime() / 1000);
            const current = Math.floor(existing.updatedAt.getTime() / 1000);
            if (Number.isFinite(base) && base < current) {
                throw new ConflictException({
                    code: "STALE_WORKOUT",
                    message: "This workout changed elsewhere since you loaded it. Re-read it and reapply the edit.",
                    currentUpdatedAt: existing.updatedAt.toISOString()
                });
            }
        }

        // This endpoint is a destructive full replace: everything below deletes every
        // set, exercise and cardio session of the workout and recreates them from the
        // payload. An empty exercises array against a workout that has some therefore
        // erases real training data in one transaction.
        //
        // A cardio-only workout legitimately has none, and clearing a workout by hand
        // is legitimate too — so this is not a ban, it is a confirmation. It is the only
        // guard that survives a client-side bug, which matters because the client is
        // about to start holding summary-shaped workout rows that carry no sets.
        const wouldEraseExercises =
            existing && existing._count.exercises > 0 && (dto.exercises?.length ?? 0) === 0;
        if (wouldEraseExercises && dto.confirmEmpty !== true) {
            throw new ConflictException({
                code: "WOULD_ERASE_EXERCISES",
                message: `Refusing to replace ${existing._count.exercises} exercise(s) with an empty list. Resend with confirmEmpty: true if this is intended.`
            });
        }
        // When an admin edits someone else's workout, keep it owned by the original user.
        const ownerId = existing ? existing.userId : userId;

        // Quota only applies when CREATING a new workout (not on the many autosaves
        // of an existing one). Admin tier is a no-op inside enforceWorkoutQuota.
        if (!existing) {
            await enforceWorkoutQuota(this.prisma, userId, parseDateInput(dto.date), tier);
        }

        const requestedExercises = dto.exercises || [];
        const exerciseIds = [...new Set(requestedExercises.map((item) => item.exerciseId).filter(Boolean))];
        const known = exerciseIds.length
            ? await this.prisma.exercise.findMany({ where: { id: { in: exerciseIds } }, select: { id: true } })
            : [];
        const knownIds = new Set(known.map((item) => item.id));
        const exercises = requestedExercises.filter((item) => knownIds.has(item.exerciseId));

        const timings = this.deriveTimings(dto.status, existing);
        const scalar = {
            date: parseDateInput(dto.date),
            title: dto.title || "Тренування",
            status: dto.status as WorkoutStatus,
            workoutType: dto.workoutType || "custom",
            notes: dto.notes ?? null,
            startedAt: timings.startedAt,
            finishedAt: timings.finishedAt,
            // Stored verbatim: the client is the only party that knows when a set was
            // actually ticked. An absent value clears the mark (all sets un-ticked).
            firstSetAt: parseOptionalDate(dto.firstSetAt),
            lastSetAt: parseOptionalDate(dto.lastSetAt),
            durationOverride: dto.durationOverride === undefined || dto.durationOverride === null ? null : Math.round(Number(dto.durationOverride))
        };

        const exercisesCreate = exercises.map((exercise, index) => ({
            exerciseId: exercise.exerciseId,
            order: exercise.order ?? index + 1,
            notes: exercise.notes ?? null,
            sets: {
                create: (exercise.sets || []).map((set) => ({
                    type: (set.type || "working") as WorkoutSetType,
                    weight: Number(set.weight) || 0,
                    repetitions: Number(set.repetitions) || 0,
                    durationSeconds: set.durationSeconds === undefined || set.durationSeconds === null ? null : Math.round(Number(set.durationSeconds)),
                    rpe: set.rpe === undefined || set.rpe === null ? null : Number(set.rpe),
                    restSeconds: set.restSeconds ?? 90,
                    // Product rule: a finished session has no half-done sets. Anything left
                    // unticked when the workout is completed still counts as performed.
                    isCompleted: dto.status === "completed" ? true : Boolean(set.isCompleted),
                    notes: set.notes ?? null
                }))
            }
        }));
        const cardioCreate = (dto.cardioSessions || []).map((cardio) => ({
            type: cardio.type || "treadmill",
            durationMinutes: Number(cardio.durationMinutes) || 0,
            distance: cardio.distance === undefined || cardio.distance === null ? null : Number(cardio.distance),
            calories: cardio.calories === undefined || cardio.calories === null ? null : Number(cardio.calories),
            averageHeartRate: cardio.averageHeartRate === undefined || cardio.averageHeartRate === null ? null : Number(cardio.averageHeartRate),
            intensity: cardio.intensity ?? null,
            notes: cardio.notes ?? null
        }));

        // IMPORTANT: use the batch-array form of $transaction (not the interactive
        // callback). The production DB is behind a connection pooler in transaction
        // mode (Neon/pgbouncer), which does NOT support interactive transactions —
        // they hang and the serverless function times out (surfaces as a browser
        // "CORS error"). The array form runs as a single batched BEGIN..COMMIT.
        const operations: any[] = [];
        // Sessions this save closes as a side effect. Resolved to ids BEFORE the write
        // rather than left as a blind updateMany, because the caller has to be able to
        // tell the user's other devices which rows changed — an invalidation event that
        // names only the saved workout leaves a session showing as active on the phone
        // long after the desktop closed it.
        let closedOtherIds: string[] = [];
        if (dto.status === "active") {
            // Starting a session closes the previous one — and a closed session has all
            // its sets marked done, same rule as finish().
            closedOtherIds = (await this.prisma.workout.findMany({
                where: { userId: ownerId, status: "active", id: { not: id } },
                select: { id: true }
            })).map((row) => row.id);
            if (closedOtherIds.length) {
                operations.push(this.prisma.workoutSet.updateMany({
                    where: {
                        isCompleted: false,
                        workoutExercise: { workoutId: { in: closedOtherIds } }
                    },
                    data: { isCompleted: true }
                }));
                operations.push(this.prisma.workout.updateMany({
                    where: { id: { in: closedOtherIds } },
                    data: { status: "completed", finishedAt: new Date() }
                }));
            }
        }
        if (existing) {
            operations.push(this.prisma.workoutSet.deleteMany({
                where: {
                    workoutExercise: {
                        workoutId: id
                    }
                }
            }));

            operations.push(this.prisma.workoutExercise.deleteMany({
                where: {
                    workoutId: id
                }
            }));

            operations.push(this.prisma.cardioSession.deleteMany({
                where: {
                    workoutId: id
                }
            }));

            operations.push(this.prisma.workout.update({
                where: {
                    id
                },
                data: {
                    ...scalar,
                    exercises: {
                        create: exercisesCreate
                    },
                    cardioSessions: {
                        create: cardioCreate
                    }
                }
            }));
        } else {
            operations.push(this.prisma.workout.create({
                data: { id, userId: ownerId, ...scalar, exercises: { create: exercisesCreate }, cardioSessions: { create: cardioCreate } }
            }));
        }

        const results = await this.prisma.$transaction(operations);
        // Still a lightweight ack rather than a deep re-read — but it now carries the
        // row's new version, which the client must hold to send as `baseUpdatedAt` on
        // the next save. Without it the very first save would make every subsequent one
        // look stale. The workout write is always the last queued operation, so its
        // result is the fresh row; the re-read is only a fallback if that ever changes.
        const written = results[results.length - 1] as { updatedAt?: Date } | undefined;
        const updatedAt = written?.updatedAt
            ?? (await this.prisma.workout.findUnique({ where: { id }, select: { updatedAt: true } }))?.updatedAt;
        // The saved row plus anything this save closed as a side effect: a device showing
        // the superseded session as still running has to hear about it too.
        // Presence and the feed move for DIFFERENT reasons, and saying which lets every
        // listener refresh only what actually changed. Somebody ticking their first set
        // changes who is shown as training; it does not put anything in the feed, which
        // contains finished sessions only.
        const isNew = !existing;
        const statusChanged = isNew || existing.status !== dto.status;
        const startedLifting = Boolean(existing?.firstSetAt) !== Boolean(dto.firstSetAt);
        const touches = {
            presence: statusChanged || startedLifting || closedOtherIds.length > 0,
            // The feed holds finished sessions only.
            feed: (statusChanged && dto.status === "completed") || closedOtherIds.length > 0,
            // The calendar and day sheet show PLANNED and ACTIVE rows too, so a session
            // appearing or changing state belongs to them even when the feed will never
            // mention it.
            peers: isNew || statusChanged || closedOtherIds.length > 0
        };
        this.announce(ownerId, "workout.changed", [id, ...closedOtherIds], updatedAt?.toISOString() || null, touches);
        return {
            ok: true,
            id,
            status: dto.status,
            updatedAt: updatedAt?.toISOString() || null,
            closedOtherIds
        };
    }

    private deriveTimings(status: string, existing: { startedAt: Date | null; finishedAt: Date | null } | null) {
        const now = new Date();
        if (status === "active") {
            return { startedAt: existing?.startedAt ?? now, finishedAt: null };
        }
        if (status === "completed") {
            return { startedAt: existing?.startedAt ?? now, finishedAt: existing?.finishedAt ?? now };
        }
        return { startedAt: existing?.startedAt ?? null, finishedAt: null };
    }

    async update(userId: string, id: string, dto: UpdateWorkoutDto) {
        await this.assertOwner(userId, id);
        return this.prisma.workout.update({
            where: { id },
            data: {
                ...dto,
                date: dto.date ? parseDateInput(dto.date) : undefined
            },
            include: this.includeWorkout()
        });
    }

    async remove(userId: string, id: string, isAdmin = false) {
        const owner = await this.assertOwner(userId, id, isAdmin);
        await this.prisma.workout.delete({ where: { id } });
        this.announce(owner?.userId || userId, "workout.deleted", [id], null, { presence: true, peers: true, feed: true });
        return { ok: true };
    }

    async start(userId: string, id: string) {
        await this.assertOwner(userId, id);
        const superseded = await this.prisma.workout.findMany({
            where: { userId, status: "active", id: { not: id } },
            select: { id: true }
        });
        for (const item of superseded) {
            await this.completeSetsOf(item.id);
        }
        await this.prisma.workout.updateMany({
            where: { userId, status: "active", id: { not: id } },
            data: { status: "completed", finishedAt: new Date() }
        });
        const started = await this.prisma.workout.update({
            where: { id },
            data: { status: "active", startedAt: new Date(), finishedAt: null },
            include: this.includeWorkout()
        });
        // Starting closes any other running session, and a closed session IS a feed entry.
        this.announce(userId, "workout.changed", [id, ...superseded.map((item) => item.id)], started.updatedAt?.toISOString(), { presence: true, peers: true, feed: superseded.length > 0 });
        return started;
    }

    async finish(userId: string, id: string) {
        await this.assertOwner(userId, id);
        await this.prisma.$transaction([
            this.completeSetsOf(id),
            this.prisma.workout.update({
                where: { id },
                data: { status: "completed", finishedAt: new Date() }
            })
        ]);
        const finished = await this.prisma.workout.findUnique({ where: { id }, include: this.includeWorkout() });
        this.announce(userId, "workout.changed", [id], finished?.updatedAt?.toISOString(), { presence: true, peers: true, feed: true });
        return finished;
    }

    // Every set of a completed workout is a performed set — see the product rule in
    // saveFull. Used by every path that moves a workout into "completed".
    private completeSetsOf(workoutId: string) {
        return this.prisma.workoutSet.updateMany({
            where: { isCompleted: false, workoutExercise: { workoutId } },
            data: { isCompleted: true }
        });
    }

    async addExercise(userId: string, workoutId: string, dto: AddWorkoutExerciseDto) {
        await this.assertOwner(userId, workoutId);
        const order = dto.order || await this.nextExerciseOrder(workoutId);
        return this.prisma.workoutExercise.create({
            data: {
                workoutId,
                exerciseId: dto.exerciseId,
                order,
                notes: dto.notes
            },
            include: { exercise: true, sets: true }
        });
    }

    async updateExercise(userId: string, workoutId: string, workoutExerciseId: string, dto: UpdateWorkoutExerciseDto) {
        await this.assertWorkoutExerciseOwner(userId, workoutId, workoutExerciseId);
        return this.prisma.workoutExercise.update({ where: { id: workoutExerciseId }, data: dto });
    }

    async deleteExercise(userId: string, workoutId: string, workoutExerciseId: string) {
        await this.assertWorkoutExerciseOwner(userId, workoutId, workoutExerciseId);
        await this.prisma.workoutExercise.delete({ where: { id: workoutExerciseId } });
        return { ok: true };
    }

    async addSet(userId: string, workoutId: string, workoutExerciseId: string, dto: CreateWorkoutSetDto) {
        await this.assertWorkoutExerciseOwner(userId, workoutId, workoutExerciseId);
        return this.prisma.workoutSet.create({
            data: {
                workoutExerciseId,
                ...dto,
                restSeconds: dto.restSeconds ?? 90,
                isCompleted: dto.isCompleted ?? false
            }
        });
    }

    async updateSet(userId: string, workoutId: string, workoutExerciseId: string, setId: string, dto: UpdateWorkoutSetDto) {
        await this.assertWorkoutExerciseOwner(userId, workoutId, workoutExerciseId);
        return this.prisma.workoutSet.update({ where: { id: setId }, data: dto });
    }

    async deleteSet(userId: string, workoutId: string, workoutExerciseId: string, setId: string) {
        await this.assertWorkoutExerciseOwner(userId, workoutId, workoutExerciseId);
        await this.prisma.workoutSet.delete({ where: { id: setId } });
        return { ok: true };
    }

    async addCardio(userId: string, workoutId: string, dto: CreateCardioSessionDto) {
        await this.assertOwner(userId, workoutId);
        return this.prisma.cardioSession.create({ data: { workoutId, ...dto } });
    }

    async updateCardio(userId: string, workoutId: string, cardioId: string, dto: UpdateCardioSessionDto) {
        await this.assertOwner(userId, workoutId);
        return this.prisma.cardioSession.update({ where: { id: cardioId }, data: dto });
    }

    async deleteCardio(userId: string, workoutId: string, cardioId: string) {
        await this.assertOwner(userId, workoutId);
        await this.prisma.cardioSession.delete({ where: { id: cardioId } });
        return { ok: true };
    }

    private async assertOwner(userId: string, workoutId: string, isAdmin = false) {
        const workout = await this.prisma.workout.findUnique({ where: { id: workoutId } });
        if (!workout) {
            throw new NotFoundException("Workout not found");
        }
        if (workout.userId !== userId && !isAdmin) {
            throw new ForbiddenException("Cannot edit another user's workout");
        }
        return workout;
    }

    private async assertWorkoutExerciseOwner(userId: string, workoutId: string, workoutExerciseId: string) {
        await this.assertOwner(userId, workoutId);
        const workoutExercise = await this.prisma.workoutExercise.findFirst({
            where: { id: workoutExerciseId, workoutId }
        });
        if (!workoutExercise) {
            throw new NotFoundException("Workout exercise not found");
        }
        return workoutExercise;
    }

    private async nextExerciseOrder(workoutId: string) {
        const last = await this.prisma.workoutExercise.findFirst({
            where: { workoutId },
            orderBy: { order: "desc" }
        });
        return (last?.order || 0) + 1;
    }

    private includeWorkout() {
        return {
            // `select`, not `include`: the full User row carries email (and the profile
            // carries height/bodyweight), which /export deliberately redacts for peers.
            // Phase 6 hydrates peer workouts through findOne, so this must not leak.
            user: { select: { id: true, displayName: true, avatarUrl: true } },
            exercises: { include: { exercise: true, sets: true }, orderBy: { order: "asc" as const } },
            cardioSessions: true
        };
    }
}

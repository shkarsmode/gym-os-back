import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { RequestUser } from "../../shared/current-user.decorator";
import { isAdminUser } from "../../shared/admin";
import { PushService } from "./push.service";
import {
    COMMENT_MAX_LENGTH,
    COMMENT_PAGE_SIZE,
    FEED_MAX_PAGE_SIZE,
    FEED_PAGE_SIZE,
    NOTIFICATION_PAGE_SIZE,
    NOTIFICATION_TYPES,
    REPORT_DETAILS_MAX_LENGTH
} from "./feed.constants";
import {
    FeedCursor,
    FeedRow,
    REACTABLE_TYPES,
    decodeFeedCursor,
    encodeFeedCursor,
    keysetWhere,
    mergeFeedRows,
    timelineAt,
    workoutFeedPayload
} from "./feed.timeline";

@Injectable()
export class FeedService {
    private readonly logger = new Logger(FeedService.name);
    private tablesReady = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly push: PushService
    ) {}

    // Idempotent DDL-on-init, the same approach the feedback and reaction tables use:
    // the deploy pipeline has no migration step, so every table this module needs is
    // reconciled on first use and never again within the process.
    private async ensureTables(): Promise<void> {
        if (this.tablesReady) {
            return;
        }
        await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "FeedReaction" (
            "id" TEXT NOT NULL,
            "userId" TEXT NOT NULL,
            "targetType" TEXT NOT NULL,
            "targetId" TEXT NOT NULL,
            "kind" TEXT NOT NULL DEFAULT 'like',
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "FeedReaction_pkey" PRIMARY KEY ("id"),
            CONSTRAINT "FeedReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`);
        await this.prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "FeedReaction_userId_targetType_targetId_key" ON "FeedReaction"("userId","targetType","targetId")`);
        await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FeedReaction_target_idx" ON "FeedReaction"("targetType","targetId")`);

        await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "FeedComment" (
            "id" TEXT NOT NULL,
            "userId" TEXT NOT NULL,
            "targetType" TEXT NOT NULL,
            "targetId" TEXT NOT NULL,
            "parentId" TEXT,
            "body" TEXT NOT NULL,
            "editedAt" TIMESTAMP(3),
            "hidden" BOOLEAN NOT NULL DEFAULT false,
            "deletedAt" TIMESTAMP(3),
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "FeedComment_pkey" PRIMARY KEY ("id"),
            CONSTRAINT "FeedComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`);
        await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FeedComment_target_idx" ON "FeedComment"("targetType","targetId","createdAt")`);
        await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FeedComment_parentId_idx" ON "FeedComment"("parentId")`);

        await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Notification" (
            "id" TEXT NOT NULL,
            "userId" TEXT NOT NULL,
            "actorId" TEXT,
            "type" TEXT NOT NULL,
            "targetType" TEXT,
            "targetId" TEXT,
            "preview" TEXT,
            "readAt" TIMESTAMP(3),
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
            CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`);
        await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId","createdAt")`);

        await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ContentReport" (
            "id" TEXT NOT NULL,
            "reporterId" TEXT NOT NULL,
            "targetType" TEXT NOT NULL,
            "targetId" TEXT NOT NULL,
            "reason" TEXT NOT NULL,
            "details" TEXT,
            "status" TEXT NOT NULL DEFAULT 'open',
            "resolvedById" TEXT,
            "resolvedAt" TIMESTAMP(3),
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
        )`);
        await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ContentReport_status_idx" ON "ContentReport"("status","createdAt")`);
        await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ContentReport_target_idx" ON "ContentReport"("targetType","targetId")`);

        await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PushSubscription" (
            "id" TEXT NOT NULL,
            "userId" TEXT NOT NULL,
            "endpoint" TEXT NOT NULL,
            "p256dh" TEXT NOT NULL,
            "auth" TEXT NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id"),
            CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`);
        await this.prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint")`);
        await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId")`);

        this.tablesReady = true;
    }

    // ---- Feed -------------------------------------------------------------
    // Three sources (finished sessions, unlocked achievements, personal records)
    // merged into one stream. The cursor is the timestamp of the last item shown, and
    // every source is asked for rows strictly older than it — so a page boundary can
    // neither duplicate nor skip an item even though the sources are queried apart.
    async feed(user: RequestUser, scope: string, cursor: string | undefined, limit?: number) {
        await this.ensureTables();
        const take = Math.min(Math.max(Number(limit) || FEED_PAGE_SIZE, 1), FEED_MAX_PAGE_SIZE);
        const before = decodeFeedCursor(cursor);
        const mineOnly = scope === "mine";
        const rows: FeedRow[] = [];

        if (scope === "team" || scope === "mine") {
            // A session belongs on the timeline at the moment it was TRAINED, not the
            // moment it happened to be saved. Ordering by finishedAt put a retroactively
            // entered July session between two August ones, buried a Wednesday session
            // seven rows down because it had been planned on Monday, and made cards read
            // "вчора" for a workout done three days earlier.
            //
            // The key is therefore the workout's own date carrying the clock time it was
            // finished: the date decides the position, the time only breaks ties inside a
            // day. It has to be computed in SQL because the cursor paginates on it.
            const timings = await this.workoutTimeline(user.id, mineOnly, before, take + 1);
            const workouts = timings.length
                ? await this.prisma.workout.findMany({
                    where: { id: { in: timings.map((item) => item.id) } },
                    include: {
                        exercises: { include: { sets: true, exercise: { select: { name: true } } } },
                        cardioSessions: { select: { durationMinutes: true } }
                    }
                })
                : [];
            const byId = new Map(workouts.map((item) => [item.id, item]));
            for (const timing of timings) {
                const workout = byId.get(timing.id);
                if (!workout) {
                    continue;
                }
                rows.push({
                    id: workout.id,
                    type: "workout",
                    userId: workout.userId,
                    createdAt: timing.feedAt,
                    payload: workoutFeedPayload(workout)
                });
            }
        }

        if (scope === "team" || scope === "records") {
            const records = await this.prisma.personalRecord.findMany({
                where: {
                    ...(mineOnly ? { userId: user.id } : {}),
                    ...(before ? keysetWhere("recordedAt", before, "record") : {})
                },
                orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
                take: take + 1,
                include: { exercise: { select: { name: true } } }
            });
            for (const record of records) {
                rows.push({
                    id: record.id,
                    type: "record",
                    userId: record.userId,
                    createdAt: record.recordedAt,
                    payload: {
                        exercise: record.exercise?.name || "Вправа",
                        weightKg: round(Number(record.weight ?? record.value)),
                        repetitions: record.repetitions,
                        estimatedOneRepMax: round(Number(record.estimatedOneRepMax ?? 0)),
                        recordType: record.type
                    }
                });
            }
        }

        if (scope === "team" || scope === "achievements") {
            const unlocked = await this.prisma.userAchievement.findMany({
                where: {
                    unlockedAt: { not: null },
                    ...(before ? keysetWhere("unlockedAt", before, "achievement") : {}),
                    ...(mineOnly ? { userId: user.id } : {})
                },
                orderBy: [{ unlockedAt: "desc" }, { id: "desc" }],
                take: take + 1,
                include: { achievement: { select: { title: true, description: true, category: true } } }
            });
            for (const item of unlocked) {
                if (!item.unlockedAt) {
                    continue;
                }
                rows.push({
                    id: item.id,
                    type: "achievement",
                    userId: item.userId,
                    createdAt: item.unlockedAt,
                    payload: {
                        title: item.achievement?.title || "Досягнення",
                        description: item.achievement?.description || "",
                        category: item.achievement?.category || ""
                    }
                });
            }
        }

        const { page, nextCursor } = mergeFeedRows(rows, take);

        const [authors, reactions, commentCounts] = await Promise.all([
            this.authorMap(page.map((row) => row.userId)),
            this.reactionState(user.id, page.map((row) => row.id)),
            this.commentCounts(page.map((row) => row.id))
        ]);

        return {
            items: page.map((row) => ({
                id: row.id,
                type: row.type,
                createdAt: row.createdAt,
                author: authors.get(row.userId) || null,
                ...row.payload,
                reactions: reactions.get(`${row.type}:${row.id}`) || { count: 0, mine: false },
                commentCount: commentCounts.get(`${row.type}:${row.id}`) || 0
            })),
            nextCursor
        };
    }

    // Ordered ids + timeline positions for the workout source. Raw SQL because the sort
    // key is derived (session date + finish time-of-day) and the keyset cursor compares
    // against that same expression — Prisma cannot express either.
    //
    // No `finishedAt IS NOT NULL` guard: a session saved as completed without a finish
    // timestamp is still a real session, and the old filter made it invisible forever.
    private async workoutTimeline(userId: string, mineOnly: boolean, before: FeedCursor | null, take: number) {
        const key = Prisma.sql`(w."date"::date + COALESCE(w."finishedAt", w."updatedAt")::time)`;
        const rows = await this.prisma.$queryRaw<Array<{ id: string; feedAt: Date }>>(Prisma.sql`
            SELECT w."id" AS "id", ${key} AS "feedAt"
              FROM "Workout" w
             WHERE w."status" = 'completed'
               ${mineOnly ? Prisma.sql`AND w."userId" = ${userId}` : Prisma.empty}
               ${before
                   ? (before.type === "workout"
                       ? Prisma.sql`AND (${key} < ${before.at} OR (${key} = ${before.at} AND w."id" < ${before.id}))`
                       : Prisma.sql`AND ${key} < ${before.at}`)
                   : Prisma.empty}
             ORDER BY ${key} DESC, w."id" DESC
             LIMIT ${take}
        `);
        return rows.map((row) => ({ id: row.id, feedAt: new Date(row.feedAt) }));
    }

    private async authorMap(userIds: string[]) {
        const unique = [...new Set(userIds.filter(Boolean))];
        if (!unique.length) {
            return new Map<string, unknown>();
        }
        const users = await this.prisma.user.findMany({
            where: { id: { in: unique } },
            select: { id: true, displayName: true, avatarUrl: true, role: true }
        });
        return new Map<string, unknown>(users.map((item) => [item.id, item]));
    }

    private async reactionState(userId: string, ids: string[]) {
        const map = new Map<string, { count: number; mine: boolean }>();
        if (!ids.length) {
            return map;
        }
        const rows = await this.prisma.feedReaction.findMany({
            where: { targetId: { in: ids } },
            select: { targetType: true, targetId: true, userId: true }
        });
        for (const row of rows) {
            const key = `${row.targetType}:${row.targetId}`;
            const entry = map.get(key) || { count: 0, mine: false };
            entry.count += 1;
            if (row.userId === userId) {
                entry.mine = true;
            }
            map.set(key, entry);
        }
        return map;
    }

    private async commentCounts(ids: string[]) {
        const map = new Map<string, number>();
        if (!ids.length) {
            return map;
        }
        const rows = await this.prisma.feedComment.groupBy({
            by: ["targetType", "targetId"],
            where: { targetId: { in: ids }, deletedAt: null, hidden: false },
            _count: { _all: true }
        });
        for (const row of rows) {
            map.set(`${row.targetType}:${row.targetId}`, row._count._all);
        }
        return map;
    }

    // Full detail for one feed item, used by the post screen.
    async item(user: RequestUser, targetType: string, targetId: string) {
        await this.ensureTables();
        if (targetType !== "workout") {
            const [reactions, comments] = await Promise.all([
                this.reactionState(user.id, [targetId]),
                this.comments(user, targetType, targetId)
            ]);
            return {
                type: targetType,
                id: targetId,
                reactions: reactions.get(`${targetType}:${targetId}`) || { count: 0, mine: false },
                comments: comments.items
            };
        }
        const workout = await this.prisma.workout.findUnique({
            where: { id: targetId },
            include: {
                user: { select: { id: true, displayName: true, avatarUrl: true } },
                exercises: { orderBy: { order: "asc" }, include: { sets: true, exercise: { select: { name: true, primaryMuscleGroup: true } } } },
                cardioSessions: true
            }
        });
        if (!workout || workout.status !== "completed") {
            throw new NotFoundException("Post not found");
        }
        const sets = workout.exercises.flatMap((item) => item.sets.filter((set) => set.isCompleted));
        const [reactions, comments] = await Promise.all([
            this.reactionState(user.id, [targetId]),
            this.comments(user, targetType, targetId)
        ]);
        return {
            type: "workout",
            id: workout.id,
            author: workout.user,
            title: workout.title,
            workoutType: workout.workoutType,
            date: workout.date,
            // Same timeline value the list uses, so the detail header cannot disagree
            // with the card the reader tapped.
            createdAt: timelineAt(workout.date, workout.finishedAt || workout.updatedAt),
            volumeKg: round(sets.reduce((sum, set) => sum + Number(set.weight) * set.repetitions, 0)),
            setCount: sets.length,
            exerciseCount: workout.exercises.length,
            cardioMinutes: workout.cardioSessions.reduce((sum, item) => sum + (item.durationMinutes || 0), 0),
            durationMinutes: workout.durationOverride
                ?? (workout.startedAt && workout.finishedAt
                    ? Math.round((workout.finishedAt.getTime() - workout.startedAt.getTime()) / 60000)
                    : null),
            exercises: workout.exercises.map((item) => ({
                name: item.exercise?.name || "Вправа",
                muscleGroup: item.exercise?.primaryMuscleGroup || "",
                sets: item.sets.filter((set) => set.isCompleted).length,
                topWeightKg: round(Math.max(0, ...item.sets.filter((set) => set.isCompleted).map((set) => Number(set.weight))))
            })),
            reactions: reactions.get(`workout:${targetId}`) || { count: 0, mine: false },
            comments: comments.items
        };
    }

    // ---- Reactions --------------------------------------------------------
    // Toggle: a second tap removes it. Returns the fresh count so an optimistic
    // client reconciles instead of guessing.
    async toggleReaction(user: RequestUser, targetType: string, targetId: string) {
        await this.ensureTables();
        if (!REACTABLE_TYPES.has(targetType)) {
            throw new BadRequestException("Unknown target type");
        }
        const existing = await this.prisma.feedReaction.findUnique({
            where: { userId_targetType_targetId: { userId: user.id, targetType, targetId } }
        });
        if (existing) {
            await this.prisma.feedReaction.delete({ where: { id: existing.id } });
        } else {
            await this.prisma.feedReaction.create({ data: { userId: user.id, targetType, targetId } });
            const ownerId = await this.ownerOf(targetType, targetId);
            if (ownerId && ownerId !== user.id) {
                await this.notify(ownerId, {
                    type: NOTIFICATION_TYPES.REACTION,
                    actorId: user.id,
                    targetType,
                    targetId,
                    preview: `${user.displayName} відреагував на твій пост`
                });
            }
        }
        const count = await this.prisma.feedReaction.count({ where: { targetType, targetId } });
        return { ok: true, count, mine: !existing };
    }

    // ---- Comments ---------------------------------------------------------
    async comments(user: RequestUser, targetType: string, targetId: string) {
        await this.ensureTables();
        const rows = await this.prisma.feedComment.findMany({
            where: { targetType, targetId, deletedAt: null },
            orderBy: { createdAt: "asc" },
            take: COMMENT_PAGE_SIZE * 4,
            include: { user: { select: { id: true, displayName: true, avatarUrl: true } } }
        });
        const admin = isAdminUser(user);
        // A hidden comment stays visible to moderators (they must see what they acted
        // on) and collapses to a placeholder for everyone else.
        return {
            items: rows.map((row) => ({
                id: row.id,
                parentId: row.parentId,
                body: row.hidden && !admin ? null : row.body,
                hidden: row.hidden,
                editedAt: row.editedAt,
                createdAt: row.createdAt,
                author: row.user,
                mine: row.userId === user.id,
                canModerate: admin
            }))
        };
    }

    async addComment(user: RequestUser, targetType: string, targetId: string, body: string, parentId?: string) {
        await this.ensureTables();
        const clean = String(body || "").trim();
        if (!clean) {
            throw new BadRequestException("Comment is empty");
        }
        if (clean.length > COMMENT_MAX_LENGTH) {
            throw new BadRequestException("Comment is too long");
        }
        // Replies attach to the ROOT comment, never to another reply: one level keeps
        // the thread readable and the data shape finite.
        let rootParentId: string | null = null;
        if (parentId) {
            const parent = await this.prisma.feedComment.findUnique({ where: { id: parentId } });
            if (!parent || parent.deletedAt) {
                throw new NotFoundException("Parent comment not found");
            }
            rootParentId = parent.parentId || parent.id;
        }

        const created = await this.prisma.feedComment.create({
            data: { userId: user.id, targetType, targetId, parentId: rootParentId, body: clean },
            include: { user: { select: { id: true, displayName: true, avatarUrl: true } } }
        });

        // Notify the post owner, and the parent author on a reply — never yourself,
        // and never the same person twice for one comment.
        const notified = new Set<string>([user.id]);
        if (rootParentId) {
            const parent = await this.prisma.feedComment.findUnique({ where: { id: rootParentId }, select: { userId: true } });
            if (parent && !notified.has(parent.userId)) {
                notified.add(parent.userId);
                await this.notify(parent.userId, {
                    type: NOTIFICATION_TYPES.REPLY,
                    actorId: user.id,
                    targetType,
                    targetId,
                    preview: `${user.displayName} відповів у треді: «${clean.slice(0, 90)}»`
                });
            }
        }
        const ownerId = await this.ownerOf(targetType, targetId);
        if (ownerId && !notified.has(ownerId)) {
            await this.notify(ownerId, {
                type: NOTIFICATION_TYPES.COMMENT,
                actorId: user.id,
                targetType,
                targetId,
                preview: `${user.displayName} прокоментував: «${clean.slice(0, 90)}»`
            });
        }

        return {
            id: created.id,
            parentId: created.parentId,
            body: created.body,
            hidden: false,
            editedAt: null,
            createdAt: created.createdAt,
            author: created.user,
            mine: true,
            canModerate: isAdminUser(user)
        };
    }

    async editComment(user: RequestUser, id: string, body: string) {
        await this.ensureTables();
        const comment = await this.prisma.feedComment.findUnique({ where: { id } });
        if (!comment || comment.deletedAt) {
            throw new NotFoundException("Comment not found");
        }
        if (comment.userId !== user.id) {
            throw new ForbiddenException("Not your comment");
        }
        const clean = String(body || "").trim();
        if (!clean || clean.length > COMMENT_MAX_LENGTH) {
            throw new BadRequestException("Invalid comment body");
        }
        const updated = await this.prisma.feedComment.update({ where: { id }, data: { body: clean, editedAt: new Date() } });
        return { ok: true, id: updated.id, body: updated.body, editedAt: updated.editedAt };
    }

    async deleteComment(user: RequestUser, id: string) {
        await this.ensureTables();
        const comment = await this.prisma.feedComment.findUnique({ where: { id } });
        if (!comment || comment.deletedAt) {
            throw new NotFoundException("Comment not found");
        }
        if (comment.userId !== user.id && !isAdminUser(user)) {
            throw new ForbiddenException("Not your comment");
        }
        // Soft delete: replies keep their anchor, and a report about this comment can
        // still be reviewed after the author removes it.
        await this.prisma.feedComment.update({ where: { id }, data: { deletedAt: new Date() } });
        return { ok: true };
    }

    // ---- Reports + moderation --------------------------------------------
    async report(user: RequestUser, targetType: string, targetId: string, reason: string, details?: string) {
        await this.ensureTables();
        const existing = await this.prisma.contentReport.findFirst({
            where: { reporterId: user.id, targetType, targetId, status: "open" }
        });
        if (existing) {
            return { ok: true, duplicate: true };
        }
        await this.prisma.contentReport.create({
            data: {
                reporterId: user.id,
                targetType,
                targetId,
                reason,
                details: details ? String(details).slice(0, REPORT_DETAILS_MAX_LENGTH) : null
            }
        });
        return { ok: true, duplicate: false };
    }

    async openReports() {
        await this.ensureTables();
        const reports = await this.prisma.contentReport.findMany({
            where: { status: "open" },
            orderBy: { createdAt: "desc" },
            take: 60
        });
        const commentIds = reports.filter((item) => item.targetType === "comment").map((item) => item.targetId);
        const comments = commentIds.length
            ? await this.prisma.feedComment.findMany({
                where: { id: { in: commentIds } },
                include: { user: { select: { id: true, displayName: true, avatarUrl: true } } }
            })
            : [];
        const byId = new Map(comments.map((item) => [item.id, item]));
        const reporters = await this.authorMap(reports.map((item) => item.reporterId));
        // Grouped by target: five reports about one comment are one decision, not five.
        const grouped = new Map<string, { report: (typeof reports)[number]; count: number; reporters: unknown[] }>();
        for (const report of reports) {
            const key = `${report.targetType}:${report.targetId}`;
            const entry = grouped.get(key) || { report, count: 0, reporters: [] };
            entry.count += 1;
            entry.reporters.push(reporters.get(report.reporterId) || null);
            grouped.set(key, entry);
        }
        return {
            items: [...grouped.values()].map(({ report, count, reporters: who }) => {
                const comment = byId.get(report.targetId);
                return {
                    id: report.id,
                    targetType: report.targetType,
                    targetId: report.targetId,
                    reason: report.reason,
                    details: report.details,
                    createdAt: report.createdAt,
                    reportCount: count,
                    reporters: who,
                    // Where the moderator has to look. A reported comment points at its
                    // post, not at itself, so "Відкрити" lands on readable context either way.
                    postType: comment ? comment.targetType : report.targetType,
                    postId: comment ? comment.targetId : report.targetId,
                    comment: comment
                        ? { id: comment.id, body: comment.body, hidden: comment.hidden, author: comment.user, createdAt: comment.createdAt }
                        : null
                };
            })
        };
    }

    async openReportCount() {
        await this.ensureTables();
        return { open: await this.prisma.contentReport.count({ where: { status: "open" } }) };
    }

    async resolveReport(user: RequestUser, id: string, action: string) {
        await this.ensureTables();
        const report = await this.prisma.contentReport.findUnique({ where: { id } });
        if (!report) {
            throw new NotFoundException("Report not found");
        }
        if (report.targetType === "comment" && action === "hide") {
            await this.prisma.feedComment.update({ where: { id: report.targetId }, data: { hidden: true } });
        }
        if (report.targetType === "comment" && action === "delete") {
            await this.prisma.feedComment.update({ where: { id: report.targetId }, data: { deletedAt: new Date(), hidden: true } });
        }
        // Every open report about the same target resolves together.
        await this.prisma.contentReport.updateMany({
            where: { targetType: report.targetType, targetId: report.targetId, status: "open" },
            data: { status: `resolved_${action}`, resolvedById: user.id, resolvedAt: new Date() }
        });
        if (action !== "keep" && report.targetType === "comment") {
            const comment = await this.prisma.feedComment.findUnique({ where: { id: report.targetId }, select: { userId: true } });
            if (comment) {
                await this.notify(comment.userId, {
                    type: NOTIFICATION_TYPES.MODERATION,
                    actorId: null,
                    targetType: report.targetType,
                    targetId: report.targetId,
                    preview: action === "delete" ? "Твій коментар видалено модератором" : "Твій коментар приховано модератором"
                });
            }
        }
        return { ok: true };
    }

    // ---- Notifications ----------------------------------------------------
    async notifications(user: RequestUser, cursor?: string) {
        await this.ensureTables();
        const before = decodeFeedCursor(cursor);
        const rows = await this.prisma.notification.findMany({
            where: { userId: user.id, ...(before ? { createdAt: { lt: before.at } } : {}) },
            orderBy: { createdAt: "desc" },
            take: NOTIFICATION_PAGE_SIZE + 1
        });
        const page = rows.slice(0, NOTIFICATION_PAGE_SIZE);
        const actors = await this.authorMap(page.map((row) => row.actorId).filter(Boolean) as string[]);
        const unread = await this.prisma.notification.count({ where: { userId: user.id, readAt: null } });
        return {
            items: page.map((row) => ({
                id: row.id,
                type: row.type,
                preview: row.preview,
                targetType: row.targetType,
                targetId: row.targetId,
                createdAt: row.createdAt,
                read: Boolean(row.readAt),
                actor: row.actorId ? actors.get(row.actorId) || null : null
            })),
            unread,
            nextCursor: rows.length > page.length && page.length
                ? encodeFeedCursor({ at: page[page.length - 1].createdAt, type: "notification", id: page[page.length - 1].id })
                : null
        };
    }

    async unreadCount(user: RequestUser) {
        await this.ensureTables();
        return { unread: await this.prisma.notification.count({ where: { userId: user.id, readAt: null } }) };
    }

    async markRead(user: RequestUser, ids?: string[]) {
        await this.ensureTables();
        await this.prisma.notification.updateMany({
            where: { userId: user.id, readAt: null, ...(ids && ids.length ? { id: { in: ids } } : {}) },
            data: { readAt: new Date() }
        });
        return { ok: true };
    }

    // ---- Achievement bridge ----------------------------------------------
    // Achievements are computed on the client (they need the user's full lifetime
    // history, which the windowed payload no longer ships to the server's reach in
    // one place). The client reports unlocks here so the feed can show them; the
    // upsert is keyed so replaying the same unlock is a no-op.
    async syncAchievements(user: RequestUser, items: { key: string; title: string; description?: string; unlockedAt?: string }[]) {
        await this.ensureTables();
        let created = 0;
        for (const item of (items || []).slice(0, 60)) {
            const key = String(item.key || "").trim().slice(0, 80);
            const title = String(item.title || "").trim().slice(0, 120);
            if (!key || !title) {
                continue;
            }
            const achievement = await this.prisma.achievement.upsert({
                where: { key },
                update: { title, description: String(item.description || "").slice(0, 300) },
                create: {
                    key,
                    title,
                    description: String(item.description || "").slice(0, 300),
                    category: "general",
                    target: 1,
                    metric: "client"
                }
            });
            const unlockedAt = item.unlockedAt ? new Date(item.unlockedAt) : new Date();
            const existing = await this.prisma.userAchievement.findUnique({
                where: { userId_achievementId: { userId: user.id, achievementId: achievement.id } }
            });
            if (existing?.unlockedAt) {
                continue;
            }
            await this.prisma.userAchievement.upsert({
                where: { userId_achievementId: { userId: user.id, achievementId: achievement.id } },
                update: { unlockedAt: Number.isFinite(unlockedAt.getTime()) ? unlockedAt : new Date(), progress: 1 },
                create: {
                    userId: user.id,
                    achievementId: achievement.id,
                    progress: 1,
                    unlockedAt: Number.isFinite(unlockedAt.getTime()) ? unlockedAt : new Date()
                }
            });
            created += 1;
        }
        return { ok: true, created };
    }

    // Writes the row and fires a push when the recipient allows that category. Never
    // throws into the caller: a failed notification must not fail the comment.
    private async notify(
        userId: string,
        input: { type: string; actorId: string | null; targetType?: string; targetId?: string; preview?: string }
    ) {
        try {
            await this.prisma.notification.create({
                data: {
                    userId,
                    actorId: input.actorId,
                    type: input.type,
                    targetType: input.targetType || null,
                    targetId: input.targetId || null,
                    preview: input.preview ? input.preview.slice(0, 240) : null
                }
            });
            await this.push.sendToUser(userId, input.type, {
                title: "GymOS",
                body: input.preview || "Нова активність",
                url: input.targetType && input.targetId ? `#/post/${input.targetType}/${input.targetId}` : "#/feed"
            });
        } catch (error) {
            this.logger.warn(`notify failed: ${(error as Error).message}`);
        }
    }

    // Who owns the thing being reacted to / commented on — the person to notify.
    private async ownerOf(targetType: string, targetId: string): Promise<string | null> {
        if (targetType === "workout") {
            const row = await this.prisma.workout.findUnique({ where: { id: targetId }, select: { userId: true } });
            return row?.userId || null;
        }
        if (targetType === "achievement") {
            const row = await this.prisma.userAchievement.findUnique({ where: { id: targetId }, select: { userId: true } });
            return row?.userId || null;
        }
        if (targetType === "record") {
            const row = await this.prisma.personalRecord.findUnique({ where: { id: targetId }, select: { userId: true } });
            return row?.userId || null;
        }
        if (targetType === "comment") {
            const row = await this.prisma.feedComment.findUnique({ where: { id: targetId }, select: { userId: true } });
            return row?.userId || null;
        }
        return null;
    }
}

function round(value: number): number {
    return Math.round((Number(value) || 0) * 10) / 10;
}

// Time cursors are opaque base64url — a position, never an identifier. Unparseable
// input restarts the list rather than erroring, because the client cannot recover
// from a 500 here but it can recover from an empty cursor.

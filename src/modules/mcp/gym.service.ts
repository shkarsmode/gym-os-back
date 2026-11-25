import { ConflictException, ForbiddenException, HttpException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { ValidationError, validate } from "class-validator";
import { PrismaService } from "../../prisma/prisma.service";
import { tierOf } from "../../shared/admin";
import { WORKOUT_PAGE_ORDER } from "../../shared/cursor";
import { dateInput } from "../../shared/serialize";
import { CatalogEntry, rankCandidates } from "../ai/exercise-match";
import { BodyweightService } from "../bodyweight/bodyweight.service";
import { CreateBodyweightDto } from "../bodyweight/dto/create-bodyweight.dto";
import { WorkoutTemplatesService } from "../workout-templates/workout-templates.service";
import { SaveWorkoutDto } from "../workouts/dto/workout.dto";
import { WorkoutsService } from "../workouts/workouts.service";
import { McpAuditService } from "./audit.service";
import { decodeVersion, encodeVersion, epley, fmtLoad, fmtNumber, headline, renderWorkout } from "./domain/format";
import { ExerciseRef, ResolvedExercise, SetInput, UpdateOp, applyOps, assertGroupsContiguous, assertNotDone, newSet } from "./domain/ops";
import { buildRepeatDraft, pickRepeatSource } from "./domain/repeat";
import { McpToolError, addDays, assertNotPast, effectiveStatus, requireDate, todayIn, weekdayName } from "./domain/rules";
import { DraftSet, DraftWorkout, WORKOUT_TREE_INCLUDE, newId, snapshot, statusInputOf, toDraft, toDraftSet, toSaveDto } from "./domain/workout";
import { MCP_CONFIG, McpConfig } from "./mcp.config";
import { McpAuthContext } from "./oauth/oauth.service";

export interface PlannedExerciseInput extends ExerciseRef {
    notes?: string;
    sets?: SetInput[];
}

type Journaled = { text: string; target?: string; summary?: string; before?: unknown; after?: unknown };

function clamp(value: number | undefined, fallback: number, max: number): number {
    const number = Number.isFinite(value) ? Math.round(value as number) : fallback;
    return Math.min(Math.max(number, 1), max);
}

function utc(date: string): Date {
    return new Date(`${date}T00:00:00.000Z`);
}

function plural(count: number, word: string): string {
    return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function describeValidation(errors: ValidationError[], prefix = ""): string[] {
    return errors.flatMap((error) => {
        const path = prefix ? `${prefix}.${error.property}` : error.property;
        const own = Object.values(error.constraints || {}).map((message) => `${path}: ${message}`);
        return [...own, ...describeValidation(error.children || [], path)];
    });
}

@Injectable()
export class McpGymService {
    private readonly logger = new Logger("McpGym");

    constructor(
        private readonly prisma: PrismaService,
        private readonly workouts: WorkoutsService,
        private readonly bodyweight: BodyweightService,
        private readonly templates: WorkoutTemplatesService,
        private readonly audit: McpAuditService,
        @Inject(MCP_CONFIG) private readonly config: McpConfig
    ) {}

    get timeZone() {
        return this.config.timeZone;
    }

    today() {
        return todayIn(this.config.timeZone);
    }

    async listWorkouts(ctx: McpAuthContext, input: { from?: string; to?: string; limit?: number }) {
        const from = input.from === undefined ? undefined : requireDate(input.from, "from");
        const to = input.to === undefined ? undefined : requireDate(input.to, "to");
        const limit = clamp(input.limit, 10, 50);
        const today = this.today();
        const ranged = Boolean(from || to);
        const rows = await this.prisma.workout.findMany({
            where: {
                userId: ctx.userId,
                ...(ranged ? { date: { ...(from ? { gte: utc(addDays(from, -1)) } : {}), ...(to ? { lt: utc(addDays(to, 2)) } : {}) } } : {})
            },
            orderBy: WORKOUT_PAGE_ORDER,
            take: ranged ? 200 : limit,
            include: WORKOUT_TREE_INCLUDE
        });
        const drafts = rows
            .map(toDraft)
            .filter((draft) => (!from || draft.date >= from) && (!to || draft.date <= to))
            .slice(0, limit);
        if (!drafts.length) {
            return `No workouts${ranged ? ` between ${from ?? "the start"} and ${to ?? "now"}` : ""}. Today is ${today}.`;
        }
        return [`Workouts, newest first (today is ${today}):`, ...drafts.map((draft) => headline(draft, today))].join("\n");
    }

    async getWorkout(ctx: McpAuthContext, input: { id?: string; date?: string }) {
        if (Boolean(input.id) === Boolean(input.date)) {
            throw new McpToolError("INVALID_INPUT", "Pass either id or date.");
        }
        const today = this.today();
        if (input.id) {
            return renderWorkout(toDraft(await this.loadOwn(ctx, input.id)), today);
        }
        const date = requireDate(input.date);
        const rows = await this.rowsOn(ctx, date);
        if (!rows.length) {
            return `No workout on ${date} ${weekdayName(date)}.`;
        }
        return rows.map((row) => renderWorkout(toDraft(row), today)).join("\n\n");
    }

    async getExerciseHistory(ctx: McpAuthContext, input: { exercise: string; limit?: number }) {
        const limit = clamp(input.limit, 5, 20);
        const catalog = await this.catalog(ctx);
        const exercise = catalog.find((item) => item.id === input.exercise) || this.resolveFrom(catalog, { exerciseName: input.exercise }, "exercise");
        const rows = await this.prisma.workoutExercise.findMany({
            where: { exerciseId: exercise.id, workout: { userId: ctx.userId, status: "completed" } },
            orderBy: [{ workout: { date: "desc" } }, { workout: { id: "desc" } }, { order: "asc" }],
            take: limit * 3,
            include: { sets: true, workout: { select: { id: true, date: true } } }
        });
        const sessions: Array<{ id: string; date: string; sets: DraftSet[] }> = [];
        for (const row of rows) {
            const done = row.sets.map(toDraftSet).filter((set) => set.isCompleted);
            const existing = sessions.find((session) => session.id === row.workout.id);
            if (existing) {
                existing.sets.push(...done);
            } else if (sessions.length < limit) {
                sessions.push({ id: row.workout.id, date: dateInput(row.workout.date), sets: done });
            }
        }
        if (!sessions.length) {
            return `${exercise.name} (exerciseId=${exercise.id}) has no completed sessions yet.`;
        }
        let best = { value: 0, date: "" };
        const lines = sessions.map((session) => {
            const top = Math.max(0, ...session.sets
                .filter((set) => set.type !== "warmup" && set.durationSeconds === null)
                .map((set) => epley(set.weight, set.repetitions)));
            if (top > best.value) {
                best = { value: top, date: session.date };
            }
            const sets = session.sets.map((set) => `${set.type === "warmup" ? "wu " : set.type === "working" ? "" : `${set.type} `}${fmtLoad(set)}`);
            return `${session.date} ${weekdayName(session.date)} · ${sets.join(", ") || "no completed sets"}${top ? ` · e1RM ${fmtNumber(Math.round(top * 10) / 10)}kg` : ""} · workout id=${session.id}`;
        });
        const header = `${exercise.name} (exerciseId=${exercise.id}), last ${plural(sessions.length, "session")}, e1RM by Epley:`;
        const footer = best.value ? `Best e1RM here: ${fmtNumber(Math.round(best.value * 10) / 10)}kg on ${best.date}.` : "";
        return [header, ...lines, footer].filter(Boolean).join("\n");
    }

    async searchExercises(ctx: McpAuthContext, input: { query: string; limit?: number }) {
        const limit = clamp(input.limit, 10, 25);
        const catalog = await this.catalog(ctx);
        const byId = new Map(catalog.map((item) => [item.id, item]));
        const ranked = rankCandidates(input.query, catalog.map((item) => item.entry)).filter((candidate) => candidate.score >= 0.35).slice(0, limit);
        if (!ranked.length) {
            return `No exercises match "${input.query}".`;
        }
        return ranked.map(({ entry }) => {
            const item = byId.get(entry.id);
            const secondary = item?.secondary.length ? ` (+${item.secondary.join(", ")})` : "";
            return `${entry.name} · ${entry.primaryMuscleGroup}${secondary} · ${entry.equipment}${item?.isTimed ? " · timed" : ""} · id=${entry.id}`;
        }).join("\n");
    }

    async getBodyweight(ctx: McpAuthContext, input: { from?: string; to?: string; limit?: number }) {
        const from = input.from === undefined ? undefined : requireDate(input.from, "from");
        const to = input.to === undefined ? undefined : requireDate(input.to, "to");
        const limit = clamp(input.limit, 30, 200);
        const entries = (await this.bodyweight.findMine(ctx.userId))
            .map((entry) => ({ id: entry.id, date: dateInput(entry.date), kg: Number(entry.bodyweight) }))
            .filter((entry) => (!from || entry.date >= from) && (!to || entry.date <= to))
            .slice(0, limit);
        if (!entries.length) {
            return "No bodyweight entries in this range.";
        }
        const newest = entries[0];
        const oldest = entries[entries.length - 1];
        const change = entries.length > 1 ? newest.kg - oldest.kg : 0;
        const summary = entries.length > 1
            ? `Latest ${fmtNumber(newest.kg)} kg on ${newest.date}; change since ${oldest.date}: ${change > 0 ? "+" : ""}${fmtNumber(Math.round(change * 10) / 10)} kg.`
            : `Latest ${fmtNumber(newest.kg)} kg on ${newest.date}.`;
        return [summary, ...entries.map((entry) => `${entry.date} · ${fmtNumber(entry.kg)} kg · id=${entry.id}`)].join("\n");
    }

    async listTemplates(ctx: McpAuthContext) {
        const [own, shared] = await Promise.all([this.templates.findMine(ctx.userId), this.templates.findAll()]);
        const seen = new Set(own.map((template) => template.id));
        const all = [
            ...own.map((template) => ({ template, scope: "own" })),
            ...shared.filter((template) => !seen.has(template.id)).map((template) => ({ template, scope: "public" }))
        ];
        if (!all.length) {
            return "No workout templates.";
        }
        return all.map(({ template, scope }) => {
            const exercises = template.exercises.map((item, index) => {
                const target = item.targetSets ? ` ${item.targetSets}×${item.targetReps ?? "?"}` : "";
                return `   ${index + 1}. ${item.exercise?.name || item.exerciseId}${target}${item.restSeconds ? ` · rest ${item.restSeconds}s` : ""} (exerciseId=${item.exerciseId})`;
            });
            return [`${template.title} · ${template.type} · ${scope} · id=${template.id}`, ...exercises].join("\n");
        }).join("\n");
    }

    async listChanges(ctx: McpAuthContext, input: { limit?: number }) {
        const rows = await this.audit.recent(ctx.userId, clamp(input.limit, 10, 50));
        if (!rows.length) {
            return "No changes were made through MCP yet.";
        }
        const format = new Intl.DateTimeFormat("en-CA", {
            timeZone: this.config.timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23"
        });
        return rows.map((row) => {
            const when = format.format(row.createdAt).replace(",", "");
            const detail = row.result === "ok" ? row.summary : row.error;
            return `${when} · ${row.tool} · ${row.result}${row.target ? ` · ${row.target}` : ""}${detail ? `: ${detail}` : ""}`;
        }).join("\n");
    }

    createPlanned(ctx: McpAuthContext, input: { date: string; workoutType: string; title?: string; notes?: string; exercises: PlannedExerciseInput[]; replace?: boolean }) {
        return this.journaled(ctx, "create_planned_workout", async () => {
            const today = this.today();
            const date = requireDate(input.date);
            assertNotPast(date, today, this.config.timeZone);
            const target = await this.replaceTarget(ctx, date, input.replace);
            const catalog = await this.catalog(ctx);
            const exercises = (input.exercises || []).map((item, index) => {
                const exercise = this.resolveFrom(catalog, item, `exercise ${index + 1}`);
                const sets: DraftSet[] = [];
                for (const set of item.sets || []) {
                    this.assertSetInput(set, `exercise ${index + 1}`);
                    sets.push(newSet(set, newId, sets[sets.length - 1]));
                }
                return {
                    id: newId("workout-exercise"),
                    exerciseId: exercise.id,
                    name: exercise.name,
                    isTimed: exercise.isTimed,
                    notes: item.notes?.trim() || null,
                    supersetGroupId: null,
                    sets
                };
            });
            if (!exercises.length) {
                throw new McpToolError("EMPTY", "Add at least one exercise.");
            }
            const draft: DraftWorkout = {
                ...(target || this.blankDraft(ctx.userId, newId("workout"), date)),
                date,
                status: "planned",
                workoutType: input.workoutType,
                title: input.title?.trim() || "Тренування",
                notes: input.notes?.trim() || null,
                supersetGroups: [],
                exercises,
                cardio: []
            };
            await this.save(ctx, draft);
            return {
                text: `${target ? "Replaced" : "Created"} planned workout:\n${renderWorkout(draft, today)}`,
                target: `workout:${draft.id}`,
                summary: `${target ? "replaced" : "created"} planned ${draft.date} ${draft.workoutType} (${plural(draft.exercises.length, "exercise")})`,
                before: snapshot(target),
                after: snapshot(draft)
            };
        });
    }

    copyWeekday(ctx: McpAuthContext, input: { date: string; replace?: boolean }) {
        return this.journaled(ctx, "copy_weekday_workout", async () => {
            const today = this.today();
            const date = requireDate(input.date);
            assertNotPast(date, today, this.config.timeZone);
            const target = await this.replaceTarget(ctx, date, input.replace);
            const candidates = await this.prisma.workout.findMany({
                where: { userId: ctx.userId, status: "completed" },
                orderBy: WORKOUT_PAGE_ORDER,
                take: 500,
                select: { id: true, date: true, _count: { select: { exercises: true } } }
            });
            const source = pickRepeatSource(
                candidates.map((row) => ({ id: row.id, date: dateInput(row.date), exerciseCount: row._count.exercises })),
                date,
                today
            );
            if (!source) {
                throw new McpToolError("NO_SOURCE", "There is no completed workout to copy yet.");
            }
            const sourceDraft = toDraft(await this.loadOwn(ctx, source.id));
            const latestDone = new Map<string, DraftSet[]>();
            for (const exerciseId of new Set(sourceDraft.exercises.map((item) => item.exerciseId))) {
                const last = await this.prisma.workoutExercise.findFirst({
                    where: { exerciseId, workout: { userId: ctx.userId, status: "completed" }, sets: { some: { isCompleted: true } } },
                    orderBy: [{ workout: { date: "desc" } }, { workout: { id: "desc" } }, { order: "asc" }],
                    include: { sets: true }
                });
                if (last) {
                    latestDone.set(exerciseId, last.sets.map(toDraftSet).filter((set) => set.isCompleted));
                }
            }
            const draft = buildRepeatDraft({ source: sourceDraft, latestDone, targetDate: date, id: target?.id || newId("workout"), makeId: newId });
            if (target) {
                draft.updatedAt = target.updatedAt;
                draft.durationOverride = target.durationOverride;
            }
            await this.save(ctx, draft);
            const sameWeekday = source.date < today && weekdayName(source.date) === weekdayName(date);
            return {
                text: `Planned from ${sameWeekday ? "last" : "the latest workout,"} ${weekdayName(source.date)} ${source.date} (${sourceDraft.title}, id=${source.id}); weights and reps from the last time each exercise was done:\n${renderWorkout(draft, today)}`,
                target: `workout:${draft.id}`,
                summary: `copied ${source.date} into planned ${draft.date} (${plural(draft.exercises.length, "exercise")})`,
                before: snapshot(target),
                after: snapshot(draft)
            };
        });
    }

    updatePlanned(ctx: McpAuthContext, input: { id: string; version: string; ops: UpdateOp[] }) {
        return this.journaled(ctx, "update_planned_workout", async () => {
            const today = this.today();
            const draft = toDraft(await this.loadOwn(ctx, input.id));
            const before = snapshot(draft);
            const status = effectiveStatus(statusInputOf(draft), today);
            if (draft.status !== "planned" || (status !== "planned" && status !== "missed")) {
                throw new McpToolError("NOT_PLANNED", `This workout is ${status}; only planned workouts can be edited.${status === "active" ? " Use log_set during an active workout." : ""}`);
            }
            this.assertVersion(draft, input.version, true);
            if (!input.ops?.length) {
                throw new McpToolError("INVALID_INPUT", "Pass at least one op.");
            }
            const needsCatalog = input.ops.some((op) => op.op === "add_exercise" || op.op === "replace_exercise");
            const catalog = needsCatalog ? await this.catalog(ctx) : [];
            const resolved = new Map<number, ResolvedExercise>();
            input.ops.forEach((op, index) => {
                if (op.op === "add_exercise" || op.op === "replace_exercise") {
                    resolved.set(index, this.resolveFrom(catalog, op, `op ${index + 1}`));
                }
                if (op.op === "add_set") {
                    this.assertSetInput(op, `op ${index + 1}`);
                }
                if (op.op === "add_exercise") {
                    (op.sets || []).forEach((set) => this.assertSetInput(set, `op ${index + 1}`));
                }
            });
            const originalDate = draft.date;
            const changes = applyOps(draft, input.ops, resolved, newId);
            if (draft.date < today) {
                throw new McpToolError(
                    "PAST_DATE",
                    draft.date === originalDate
                        ? `This plan is in the past (${draft.date}, missed). Include a set_date op to move it to ${today} or later.`
                        : `A planned workout cannot be moved to a past date (${draft.date}). Today is ${today}.`
                );
            }
            if (draft.date !== originalDate) {
                const others = (await this.rowsOn(ctx, draft.date)).filter((row) => row.id !== draft.id);
                if (others.length) {
                    throw new McpToolError("DATE_TAKEN", `${draft.date} already has a workout: ${others.map((row) => `${row.title} (${row.status}, id=${row.id})`).join("; ")}.`);
                }
            }
            if (!draft.exercises.length && !draft.cardio.length) {
                throw new McpToolError("EMPTY", "A workout cannot be left empty; use delete_planned_workout instead.");
            }
            assertGroupsContiguous(draft);
            await this.save(ctx, draft);
            return {
                text: `Updated: ${changes.join("; ")}\n${renderWorkout(draft, today)}`,
                target: `workout:${draft.id}`,
                summary: changes.join("; "),
                before,
                after: snapshot(draft)
            };
        });
    }

    logSet(ctx: McpAuthContext, input: { workoutId: string; version: string; exerciseIndex: number; setIndex?: number; weight: number; reps?: number; seconds?: number; done?: boolean }) {
        return this.journaled(ctx, "log_set", async () => {
            const today = this.today();
            const draft = toDraft(await this.loadOwn(ctx, input.workoutId));
            const before = snapshot(draft);
            const status = effectiveStatus(statusInputOf(draft), today);
            if (status !== "active") {
                throw new McpToolError("NOT_ACTIVE", `This workout is ${status}; log_set works only on an active workout. Start it in the GymOS app first.`);
            }
            this.assertVersion(draft, input.version, true);
            this.assertSetInput(input, "log_set");
            const others = await this.prisma.workout.count({ where: { userId: ctx.userId, status: "active", id: { not: draft.id } } });
            if (others) {
                throw new McpToolError("MULTIPLE_ACTIVE", "Another workout is also in progress; finish one of them in the app first.");
            }
            const item = draft.exercises[input.exerciseIndex - 1];
            if (!Number.isInteger(input.exerciseIndex) || !item) {
                throw new McpToolError("INVALID_INPUT", `Exercise ${input.exerciseIndex} does not exist (the workout has ${draft.exercises.length}).`);
            }
            const index = input.setIndex ?? item.sets.findIndex((set) => !set.isCompleted) + 1;
            if (index === 0) {
                throw new McpToolError("ALL_SETS_DONE", `All ${item.sets.length} sets of ${item.name} are done. Pass setIndex=${item.sets.length + 1} to add an extra set.`);
            }
            let set: DraftSet;
            if (index === item.sets.length + 1) {
                set = newSet({ type: "working", weight: input.weight, reps: input.reps, seconds: input.seconds }, newId, item.sets[item.sets.length - 1]);
                item.sets.push(set);
            } else {
                const existing = item.sets[index - 1];
                if (!Number.isInteger(index) || !existing) {
                    throw new McpToolError("INVALID_INPUT", `${item.name} has no set ${index} (it has ${item.sets.length}).`);
                }
                assertNotDone(existing, `${item.name} set ${index}`);
                set = existing;
                set.weight = input.weight;
                if (input.seconds !== undefined) {
                    set.durationSeconds = input.seconds;
                    set.repetitions = 0;
                } else {
                    set.repetitions = input.reps ?? 0;
                }
            }
            set.isCompleted = input.done !== false;
            if (set.isCompleted) {
                const now = new Date();
                draft.firstSetAt = draft.firstSetAt || now;
                draft.lastSetAt = now;
            }
            await this.save(ctx, draft);
            return {
                text: `${set.isCompleted ? "Logged" : "Updated"} ${item.name} set ${index}: ${fmtLoad(set)}${set.isCompleted ? " (done)" : ""}. ${this.nextHint(draft, input.exerciseIndex - 1)} v=${encodeVersion(draft.updatedAt)}`,
                target: `workout:${draft.id}`,
                summary: `${item.name} set ${index}: ${fmtLoad(set)}${set.isCompleted ? " done" : ""}`,
                before,
                after: snapshot(draft)
            };
        });
    }

    deletePlanned(ctx: McpAuthContext, input: { id: string; confirm: boolean; version?: string }) {
        return this.journaled(ctx, "delete_planned_workout", async () => {
            if (input.confirm !== true) {
                throw new McpToolError("CONFIRM_REQUIRED", "Set confirm=true to delete the workout.");
            }
            const today = this.today();
            const row = await this.loadOwn(ctx, input.id);
            const draft = toDraft(row);
            const status = effectiveStatus(statusInputOf(draft), today);
            if (draft.status !== "planned" || (status !== "planned" && status !== "missed")) {
                throw new McpToolError("NOT_PLANNED", `This workout is ${status}; only planned workouts can be deleted.`);
            }
            this.assertVersion(draft, input.version, false);
            await this.workouts.remove(ctx.userId, draft.id, false, { status: "planned", updatedAt: row.updatedAt });
            return {
                text: `Deleted the planned workout ${draft.date} ${weekdayName(draft.date)} "${draft.title}" (id=${draft.id}).`,
                target: `workout:${draft.id}`,
                summary: `deleted planned ${draft.date} ${draft.title}`,
                before: snapshot(draft),
                after: null
            };
        });
    }

    addBodyweight(ctx: McpAuthContext, input: { date: string; kg: number }) {
        return this.journaled(ctx, "add_bodyweight", async () => {
            const today = this.today();
            const date = requireDate(input.date);
            if (date > today) {
                throw new McpToolError("FUTURE_DATE", `Bodyweight cannot be logged for a future date. Today is ${today}.`);
            }
            const dto = plainToInstance(CreateBodyweightDto, { date, bodyweight: input.kg });
            const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
            if (errors.length) {
                throw new McpToolError("INVALID_INPUT", describeValidation(errors).slice(0, 3).join("; "));
            }
            const sameDay = (await this.bodyweight.findMine(ctx.userId)).filter((entry) => dateInput(entry.date) === date);
            const entry = await this.bodyweight.createMine(ctx.userId, dto);
            const note = sameDay.length ? ` That day already had ${sameDay.map((item) => `${fmtNumber(Number(item.bodyweight))} kg`).join(", ")}.` : "";
            return {
                text: `Saved ${fmtNumber(input.kg)} kg for ${date} · id=${entry.id}.${note}`,
                target: `bodyweight:${entry.id}`,
                summary: `bodyweight ${fmtNumber(input.kg)} kg on ${date}`,
                before: null,
                after: { id: entry.id, date, kg: input.kg }
            };
        });
    }

    private async journaled(ctx: McpAuthContext, tool: string, run: () => Promise<Journaled>): Promise<string> {
        try {
            const result = await run();
            await this.audit.record({
                userId: ctx.userId,
                clientId: ctx.clientId,
                tool,
                target: result.target,
                result: "ok",
                summary: result.summary,
                before: result.before,
                after: result.after
            });
            return result.text;
        } catch (error) {
            const mapped = this.toToolError(error);
            await this.audit.record({
                userId: ctx.userId,
                clientId: ctx.clientId,
                tool,
                result: "rejected",
                error: `${mapped.code}: ${mapped.message}`
            });
            throw mapped;
        }
    }

    private toToolError(error: unknown): McpToolError {
        if (error instanceof McpToolError) {
            return error;
        }
        if (error instanceof HttpException) {
            const body = error.getResponse() as { code?: string; message?: string | string[] } | string;
            const code = typeof body === "object" ? body.code : undefined;
            const message = typeof body === "object" ? [body.message].flat().filter(Boolean).join("; ") : String(body);
            if (error instanceof ConflictException && code === "STALE_WORKOUT") {
                return new McpToolError("CONFLICT", "The workout changed in the app since you read it. Call get_workout again and re-apply the change.");
            }
            if (error instanceof NotFoundException) {
                return new McpToolError("NOT_FOUND", message || "Not found.");
            }
            if (error instanceof ForbiddenException) {
                return new McpToolError(code || "FORBIDDEN", message || "Not allowed.");
            }
            return new McpToolError(code || "INVALID_INPUT", message || "The request was rejected.");
        }
        this.logger.error(`MCP tool failed: ${error instanceof Error ? error.message : "unknown error"}`);
        return new McpToolError("INTERNAL", "Something went wrong on the GymOS server.");
    }

    private assertVersion(draft: DraftWorkout, version: string | undefined, required: boolean) {
        if (version === undefined || version === "") {
            if (required) {
                throw new McpToolError("VERSION_REQUIRED", "Pass version (the v=... value from your latest get_workout or write).");
            }
            return;
        }
        if (!draft.updatedAt || decodeVersion(version) !== draft.updatedAt.getTime()) {
            throw new McpToolError("CONFLICT", `The workout changed since version ${version} (now v=${encodeVersion(draft.updatedAt)}). Call get_workout again and re-apply the change.`);
        }
    }

    private assertSetInput(set: { reps?: number; seconds?: number }, label: string) {
        if (set.reps === undefined && set.seconds === undefined) {
            throw new McpToolError("INVALID_INPUT", `${label}: each set needs reps (or seconds for a timed exercise).`);
        }
    }

    private async save(ctx: McpAuthContext, draft: DraftWorkout) {
        const dto = plainToInstance(SaveWorkoutDto, toSaveDto(draft));
        const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
        if (errors.length) {
            throw new McpToolError("INVALID_INPUT", describeValidation(errors).slice(0, 3).join("; "));
        }
        const tier = tierOf({ id: ctx.userId, email: ctx.email, role: ctx.role });
        const result = await this.workouts.saveFull(ctx.userId, draft.id, dto, false, tier, { strictBase: true });
        draft.updatedAt = result.updatedAt ? new Date(result.updatedAt) : draft.updatedAt;
        return result;
    }

    private async loadOwn(ctx: McpAuthContext, id: string) {
        const row = id ? await this.prisma.workout.findUnique({ where: { id }, include: WORKOUT_TREE_INCLUDE }) : null;
        if (!row || row.userId !== ctx.userId) {
            throw new McpToolError("NOT_FOUND", `Workout ${id} was not found.`);
        }
        return row;
    }

    private async rowsOn(ctx: McpAuthContext, date: string) {
        const rows = await this.prisma.workout.findMany({
            where: { userId: ctx.userId, date: { gte: utc(addDays(date, -1)), lt: utc(addDays(date, 2)) } },
            orderBy: WORKOUT_PAGE_ORDER,
            include: WORKOUT_TREE_INCLUDE
        });
        return rows.filter((row) => dateInput(row.date) === date);
    }

    private async replaceTarget(ctx: McpAuthContext, date: string, replace?: boolean): Promise<DraftWorkout | null> {
        const today = this.today();
        const sameDay = (await this.rowsOn(ctx, date)).map(toDraft);
        if (!sameDay.length) {
            return null;
        }
        const listed = sameDay.map((draft) => `${draft.title} (${effectiveStatus(statusInputOf(draft), today)}, id=${draft.id})`).join("; ");
        if (!replace) {
            throw new McpToolError("DATE_TAKEN", `${date} already has a workout: ${listed}. Pass replace=true to overwrite a planned one, or choose another date.`);
        }
        const only = sameDay.length === 1 ? sameDay[0] : null;
        if (!only || only.status !== "planned" || effectiveStatus(statusInputOf(only), today) !== "planned") {
            throw new McpToolError("REPLACE_NOT_ALLOWED", `replace=true only overwrites a single planned workout; ${date} has: ${listed}.`);
        }
        return only;
    }

    private blankDraft(userId: string, id: string, date: string): DraftWorkout {
        return {
            id,
            userId,
            date,
            title: "Тренування",
            status: "planned",
            workoutType: "custom",
            notes: null,
            durationOverride: null,
            startedAt: null,
            finishedAt: null,
            firstSetAt: null,
            lastSetAt: null,
            updatedAt: null,
            supersetGroups: [],
            exercises: [],
            cardio: []
        };
    }

    private nextHint(draft: DraftWorkout, fromIndex: number): string {
        for (let index = fromIndex; index < draft.exercises.length; index += 1) {
            const item = draft.exercises[index];
            const next = item.sets.findIndex((set) => !set.isCompleted);
            if (next >= 0) {
                const where = index === fromIndex ? `set ${next + 1}` : `exercise ${index + 1} ${item.name}, set ${next + 1}`;
                return `Next: ${where} ${fmtLoad(item.sets[next])}.`;
            }
        }
        return "All planned sets are done.";
    }

    private async catalog(ctx: McpAuthContext) {
        const rows = await this.prisma.exercise.findMany({
            where: { OR: [{ status: "approved" }, { createdByUserId: ctx.userId }] },
            select: { id: true, name: true, aliases: true, primaryMuscleGroup: true, secondaryMuscleGroups: true, equipment: true, isTimed: true }
        });
        return rows.map((row) => {
            const entry: CatalogEntry = {
                id: row.id,
                name: row.name,
                aliases: Array.isArray(row.aliases) ? row.aliases.map(String) : [],
                primaryMuscleGroup: row.primaryMuscleGroup,
                equipment: row.equipment,
                mediaUrl: ""
            };
            return {
                id: row.id,
                name: row.name,
                isTimed: row.isTimed,
                secondary: Array.isArray(row.secondaryMuscleGroups) ? row.secondaryMuscleGroups.map(String) : [],
                entry
            };
        });
    }

    private resolveFrom(catalog: Array<{ id: string; name: string; isTimed: boolean; entry: CatalogEntry }>, ref: ExerciseRef, label: string): ResolvedExercise {
        if (ref.exerciseId) {
            const hit = catalog.find((item) => item.id === ref.exerciseId);
            if (!hit) {
                throw new McpToolError("UNKNOWN_EXERCISE", `${label}: exerciseId ${ref.exerciseId} is not in the catalog. Use search_exercises.`);
            }
            return { id: hit.id, name: hit.name, isTimed: hit.isTimed };
        }
        const name = ref.exerciseName?.trim();
        if (!name) {
            throw new McpToolError("INVALID_INPUT", `${label}: pass exerciseId or exerciseName.`);
        }
        const ranked = rankCandidates(name, catalog.map((item) => item.entry));
        const [top, second] = ranked;
        const exact = top && top.score >= 0.999 && (!second || second.score < 0.999);
        const clear = top && top.score >= 0.9 && (!second || top.score - second.score >= 0.1);
        if (top && (exact || clear)) {
            const hit = catalog.find((item) => item.id === top.entry.id)!;
            return { id: hit.id, name: hit.name, isTimed: hit.isTimed };
        }
        const options = ranked.slice(0, 5).map((candidate) => `${candidate.entry.name} (id=${candidate.entry.id})`).join("; ");
        throw new McpToolError("AMBIGUOUS_EXERCISE", `${label}: "${name}" is ambiguous${options ? `; closest: ${options}` : ""}. Retry with exerciseId.`);
    }
}

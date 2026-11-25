import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { SET_TYPES, WORKOUT_TYPES } from "../domain/workout";
import { McpGymService } from "../gym.service";
import { McpAuthContext } from "../oauth/oauth.service";
import { textTool } from "./tool";

const date = z.string().describe("YYYY-MM-DD");
const version = z.string().describe("v= value from the latest get_workout, list_workouts or write");
const position = z.number().int().min(1);
const setType = z.enum(SET_TYPES);
const weight = z.number().min(0).max(2000).describe("kg, 0 for bodyweight");
const reps = z.number().int().min(0).max(1000);
const seconds = z.number().int().min(1).max(86400).describe("hold time for timed exercises, instead of reps");
const restSeconds = z.number().int().min(0).max(86400);

const setInput = z.object({
    type: setType.optional().describe("default working"),
    weight,
    reps: reps.optional(),
    seconds: seconds.optional(),
    restSeconds: restSeconds.optional().describe("default 90")
});

const exerciseRef = {
    exerciseId: z.string().optional().describe("preferred; from search_exercises"),
    exerciseName: z.string().optional().describe("used when exerciseId is not known; must match one exercise clearly")
};

const op = z.discriminatedUnion("op", [
    z.object({ op: z.literal("set_set"), exercise: position, set: position, type: setType.optional(), weight: weight.optional(), reps: reps.optional(), seconds: seconds.optional(), restSeconds: restSeconds.optional() }),
    z.object({ op: z.literal("add_set"), exercise: position, position: position.optional().describe("default: last"), type: setType.optional(), weight, reps: reps.optional(), seconds: seconds.optional(), restSeconds: restSeconds.optional() }),
    z.object({ op: z.literal("remove_set"), exercise: position, set: position }),
    z.object({ op: z.literal("add_exercise"), ...exerciseRef, position: position.optional().describe("default: last"), notes: z.string().optional(), sets: z.array(setInput).max(30).optional() }),
    z.object({ op: z.literal("replace_exercise"), exercise: position, ...exerciseRef }),
    z.object({ op: z.literal("remove_exercise"), exercise: position }),
    z.object({ op: z.literal("reorder"), order: z.array(position).describe("current exercise numbers in their new order") }),
    z.object({ op: z.literal("set_workout_notes"), notes: z.string() }),
    z.object({ op: z.literal("set_exercise_notes"), exercise: position, notes: z.string() }),
    z.object({ op: z.literal("set_date"), date })
]);

export function registerWriteTools(server: McpServer, ctx: McpAuthContext, gym: McpGymService) {
    server.registerTool("create_planned_workout", {
        title: "Plan a workout",
        description: "Create a planned workout for today or a future date. Exercises by exerciseId (preferred) or exerciseName, in order; sets with type (default working), weight kg, reps or seconds, restSeconds (default 90). Fails when the date already has a workout, unless replace=true and that workout is planned.",
        inputSchema: {
            date,
            workoutType: z.enum(WORKOUT_TYPES),
            title: z.string().max(120).optional(),
            notes: z.string().max(2000).optional(),
            exercises: z.array(z.object({ ...exerciseRef, notes: z.string().max(1000).optional(), sets: z.array(setInput).max(30) })).min(1).max(30),
            replace: z.boolean().optional()
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    }, textTool(ctx, "create_planned_workout", (args) => gym.createPlanned(ctx, args), { write: true }));

    server.registerTool("copy_weekday_workout", {
        title: "Repeat weekday workout",
        description: "Plan a workout for a date (today or later) like the app's Repeat button: the exercises of the last completed workout on the same weekday, with weights and reps from the last time each exercise was done. Same replace rule as create_planned_workout.",
        inputSchema: {
            date,
            replace: z.boolean().optional()
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    }, textTool(ctx, "copy_weekday_workout", (args) => gym.copyWeekday(ctx, args), { write: true }));

    server.registerTool("update_planned_workout", {
        title: "Edit planned workout",
        description: "Edit a planned workout with ops applied in order, all or nothing. Numbers are 1-based as in get_workout and refer to the state after the previous ops. Requires version. replace_exercise keeps the sets; completed sets cannot change.",
        inputSchema: {
            id: z.string(),
            version,
            ops: z.array(op).min(1).max(50)
        },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
    }, textTool(ctx, "update_planned_workout", (args) => gym.updatePlanned(ctx, args), { write: true }));

    server.registerTool("log_set", {
        title: "Log a set",
        description: "During an active workout, record a set: weight kg and reps (or seconds). Fills the next undone set of the exercise unless setIndex is given; setIndex = number of sets + 1 adds an extra set. done=false only updates the numbers. Requires version.",
        inputSchema: {
            workoutId: z.string(),
            version,
            exerciseIndex: position,
            setIndex: position.optional(),
            weight,
            reps: reps.optional(),
            seconds: seconds.optional(),
            done: z.boolean().optional().describe("default true")
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    }, textTool(ctx, "log_set", (args) => gym.logSet(ctx, args), { write: true }));

    server.registerTool("add_bodyweight", {
        title: "Log bodyweight",
        description: "Log bodyweight in kg for today or a past date.",
        inputSchema: {
            date,
            kg: z.number().min(20).max(300)
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    }, textTool(ctx, "add_bodyweight", (args) => gym.addBodyweight(ctx, args), { write: true }));

    server.registerTool("delete_planned_workout", {
        title: "Delete planned workout",
        description: "Delete a planned (or missed) workout. Requires confirm=true. Active and completed workouts cannot be deleted.",
        inputSchema: {
            id: z.string(),
            confirm: z.boolean(),
            version: version.optional()
        },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
    }, textTool(ctx, "delete_planned_workout", (args) => gym.deletePlanned(ctx, args), { write: true }));
}

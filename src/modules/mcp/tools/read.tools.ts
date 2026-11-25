import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { McpGymService } from "../gym.service";
import { McpAuthContext } from "../oauth/oauth.service";
import { textTool } from "./tool";

const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const date = z.string().describe("YYYY-MM-DD");

export function registerReadTools(server: McpServer, ctx: McpAuthContext, gym: McpGymService) {
    server.registerTool("list_workouts", {
        title: "List workouts",
        description: "List the user's workouts, newest first: date, status (planned, active, completed, missed), type, title, working sets, duration, id and version (v=). Optional inclusive from/to dates and limit (default 10, max 50).",
        inputSchema: {
            from: date.optional(),
            to: date.optional(),
            limit: z.number().int().min(1).max(50).optional()
        },
        annotations: READ
    }, textTool(ctx, "list_workouts", (args) => gym.listWorkouts(ctx, args)));

    server.registerTool("get_workout", {
        title: "Get workout",
        description: "One workout by id, or every workout on a date: numbered exercises and sets (type, kg×reps or seconds, rest, done), supersets, cardio and notes. Use these numbers as exerciseIndex/setIndex and v= as version in writes.",
        inputSchema: {
            id: z.string().optional().describe("workout id"),
            date: date.optional()
        },
        annotations: READ
    }, textTool(ctx, "get_workout", (args) => gym.getWorkout(ctx, args)));

    server.registerTool("get_exercise_history", {
        title: "Exercise history",
        description: "Last completed sessions of one exercise with their sets and the best e1RM by Epley.",
        inputSchema: {
            exercise: z.string().describe("exerciseId or exercise name"),
            limit: z.number().int().min(1).max(20).optional().describe("sessions, default 5")
        },
        annotations: READ
    }, textTool(ctx, "get_exercise_history", (args) => gym.getExerciseHistory(ctx, args)));

    server.registerTool("search_exercises", {
        title: "Search exercises",
        description: "Search the exercise catalog by name in any language (Ukrainian names, English aliases). Returns id, name, muscles and equipment.",
        inputSchema: {
            query: z.string().min(1),
            limit: z.number().int().min(1).max(25).optional()
        },
        annotations: READ
    }, textTool(ctx, "search_exercises", (args) => gym.searchExercises(ctx, args)));

    server.registerTool("get_bodyweight", {
        title: "Bodyweight",
        description: "Bodyweight entries in kg with ids, newest first, plus the change over the period. Optional inclusive from/to dates.",
        inputSchema: {
            from: date.optional(),
            to: date.optional(),
            limit: z.number().int().min(1).max(200).optional()
        },
        annotations: READ
    }, textTool(ctx, "get_bodyweight", (args) => gym.getBodyweight(ctx, args)));

    server.registerTool("list_templates", {
        title: "Workout templates",
        description: "The user's own and the public workout templates with their exercises (exerciseId, target sets×reps).",
        annotations: READ
    }, textTool(ctx, "list_templates", () => gym.listTemplates(ctx)));

    server.registerTool("list_changes", {
        title: "Recent changes",
        description: "Recent changes made through this connector: when, which tool, and what changed or why it was rejected.",
        inputSchema: {
            limit: z.number().int().min(1).max(50).optional()
        },
        annotations: READ
    }, textTool(ctx, "list_changes", (args) => gym.listChanges(ctx, args)));
}

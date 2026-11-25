import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpGymService } from "./gym.service";
import { McpAuthContext } from "./oauth/oauth.service";
import { registerReadTools } from "./tools/read.tools";
import { registerWriteTools } from "./tools/write.tools";

function instructions(today: string, timeZone: string, canWrite: boolean): string {
    return [
        `GymOS is the user's personal workout log. Weights are kg. Dates are YYYY-MM-DD; today is ${today} (${timeZone}).`,
        "Statuses: planned, active (in progress), completed, missed (a past plan with nothing logged). Completed workouts and done sets are read-only.",
        "Exercise and set numbers are 1-based, exactly as get_workout prints them. Use search_exercises to find an exerciseId.",
        canWrite
            ? "Edits of an existing workout need the latest version (v=...) from get_workout, list_workouts or the previous write. On CONFLICT the user changed it in the app: call get_workout again and re-apply. During an active workout use log_set; it fills the next undone set unless setIndex is given. Changes appear in the app after it refreshes."
            : "This connection is read-only.",
        "Replies are short plain text meant to be read aloud; always keep the ids for follow-up calls."
    ].join("\n");
}

export function buildMcpServer(ctx: McpAuthContext, gym: McpGymService): McpServer {
    const canWrite = ctx.scopes.includes("gymos.write");
    const server = new McpServer(
        { name: "gymos", version: "1.0.0" },
        { instructions: instructions(gym.today(), gym.timeZone, canWrite) }
    );
    registerReadTools(server, ctx, gym);
    if (canWrite) {
        registerWriteTools(server, ctx, gym);
    }
    return server;
}

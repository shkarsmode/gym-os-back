import { Logger } from "@nestjs/common";
import { McpToolError } from "../domain/rules";
import { McpAuthContext } from "../oauth/oauth.service";

const logger = new Logger("McpTool");

function short(value: string): string {
    return value.slice(0, 8);
}

export function textTool<A>(ctx: McpAuthContext, name: string, run: (args: A) => Promise<string>, options: { write?: boolean } = {}) {
    return async (args: A) => {
        const started = Date.now();
        try {
            if (options.write && !ctx.scopes.includes("gymos.write")) {
                throw new McpToolError("FORBIDDEN", "This connection is read-only.");
            }
            const text = await run(args);
            logger.log(`${name} ok ${Date.now() - started}ms user=${short(ctx.userId)} client=${short(ctx.clientId)}`);
            return { content: [{ type: "text" as const, text }] };
        } catch (error) {
            const failure = error instanceof McpToolError ? error : new McpToolError("INTERNAL", "Something went wrong on the GymOS server.");
            if (!(error instanceof McpToolError)) {
                logger.error(`${name} failed: ${error instanceof Error ? error.message : "unknown error"}`);
            }
            logger.log(`${name} ${failure.code} ${Date.now() - started}ms user=${short(ctx.userId)} client=${short(ctx.clientId)}`);
            return { content: [{ type: "text" as const, text: `${failure.code}: ${failure.message}` }], isError: true };
        }
    };
}

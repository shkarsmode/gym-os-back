import { ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Request, Response } from "express";
import passport from "passport";
import { MCP_CONFIG, McpConfig } from "../mcp.config";
import { BINDING_COOKIE, GoogleProfile, MCP_STATE_PREFIX, McpOAuthService } from "./oauth.service";
import { sendResult } from "./pages";

@Injectable()
export class GoogleRedirector {
    redirect(request: Request, response: Response, state: string) {
        const options = { session: false, prompt: "select_account", state };
        passport.authenticate("google", options)(request, response, () => {
            if (!response.headersSent) {
                response.status(500).type("text/plain").send("Google sign-in is unavailable");
            }
        });
    }
}

@Injectable()
export class GoogleCallbackGuard extends AuthGuard("google") {
    canActivate(context: ExecutionContext) {
        const query = context.switchToHttp().getRequest<Request>().query || {};
        const isMcp = typeof query.state === "string" && query.state.startsWith(MCP_STATE_PREFIX);
        if (isMcp && query.error) {
            return true;
        }
        return super.canActivate(context);
    }
}

@Injectable()
export class McpGoogleCallback {
    constructor(
        private readonly oauth: McpOAuthService,
        @Inject(MCP_CONFIG) private readonly config: McpConfig
    ) {}

    owns(state: unknown) {
        return this.oauth.isMcpState(state);
    }

    async handle(request: Request, response: Response) {
        if (!this.oauth.enabled) {
            sendResult(response, { kind: "page", status: 404, title: "Not found", message: "MCP is disabled." }, this.config.secureCookies);
            return;
        }
        const query = request.query || {};
        const result = await this.oauth.finishGoogleLogin(
            String(query.state),
            request.cookies?.[BINDING_COOKIE],
            request.user as GoogleProfile | undefined,
            typeof query.error === "string" ? query.error : undefined
        );
        sendResult(response, result, this.config.secureCookies);
    }
}

import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

// Forces Google to always show the account chooser, so users can sign in with a
// different account instead of being auto-logged into the last one.
@Injectable()
export class GoogleAuthGuard extends AuthGuard("google") {
    getAuthenticateOptions() {
        return { prompt: "select_account" };
    }
}

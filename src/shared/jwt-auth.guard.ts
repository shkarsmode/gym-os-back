import { ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
    handleRequest<TUser = any>(error: unknown, user: TUser): TUser {
        if (error || !user) {
            throw error || new UnauthorizedException("Authentication required");
        }
        return user;
    }

    canActivate(context: ExecutionContext) {
        return super.canActivate(context);
    }
}

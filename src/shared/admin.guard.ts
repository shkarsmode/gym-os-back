import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { isAdminUser } from "./admin";

// Must run AFTER JwtAuthGuard (which sets request.user with the fresh `role`). Admin =
// super-admin by email or role "admin". Used to lock down admin-only endpoints such as
// the AI-workout parser and AI statistics.
@Injectable()
export class AdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const user = context.switchToHttp().getRequest().user;
        if (!user) {
            throw new UnauthorizedException("Authentication required");
        }
        if (isAdminUser(user)) {
            return true;
        }
        throw new ForbiddenException("Admin access required");
    }
}

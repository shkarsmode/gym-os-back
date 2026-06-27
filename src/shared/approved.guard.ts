import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { isAdminUser } from "./admin";

// Must run AFTER JwtAuthGuard (which sets request.user incl. the fresh `approved`
// flag from JwtStrategy). New users are not approved until an admin approves them.
@Injectable()
export class ApprovedGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (!user) {
            throw new UnauthorizedException("Authentication required");
        }
        if (isAdminUser(user) || user.approved) {
            return true;
        }
        throw new ForbiddenException("Account pending admin approval");
    }
}

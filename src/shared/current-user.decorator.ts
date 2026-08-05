import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export type RequestUser = {
    id: string;
    email: string;
    displayName: string;
    approved?: boolean;
    role?: string;
    // Set only on an impersonation session: the super-admin id acting as this user.
    // Everything else about the request (quotas, ownership, role) is the TARGET's, so
    // an impersonated session can never do more than the user themselves could.
    impersonatedBy?: string | null;
    impersonatorEmail?: string | null;
};

export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext): RequestUser | null => {
    const request = context.switchToHttp().getRequest();
    return request.user || null;
});

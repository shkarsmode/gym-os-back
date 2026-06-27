import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export type RequestUser = {
    id: string;
    email: string;
    displayName: string;
    approved?: boolean;
};

export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext): RequestUser | null => {
    const request = context.switchToHttp().getRequest();
    return request.user || null;
});

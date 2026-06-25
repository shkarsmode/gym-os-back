import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard("jwt") {
    handleRequest<TUser = any>(_: unknown, user: TUser): TUser | null {
        return user || null;
    }
}

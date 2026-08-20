import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApprovedGuard } from "../../shared/approved.guard";
import { CurrentUser, RequestUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { AccessService } from "./access.service";
import { CreateAccessRequestDto, SetPrivacyDto } from "./dto/access.dto";

@Controller("access")
@UseGuards(JwtAuthGuard, ApprovedGuard)
export class AccessController {
    constructor(private readonly access: AccessService) {}

    // Literal routes first — Nest matches in declaration order. Every parameterised route
    // below carries a mandatory action suffix, so none of them can swallow these.
    @Get("state")
    state(@CurrentUser() user: RequestUser) {
        return this.access.state(user);
    }

    @Post("privacy")
    setPrivacy(@CurrentUser() user: RequestUser, @Body() dto: SetPrivacyDto) {
        return this.access.setPrivacy(user, dto.hideWorkoutDetails);
    }

    @Post("privacy/ack")
    acknowledge(@CurrentUser() user: RequestUser) {
        return this.access.acknowledgePrivacy(user);
    }

    @Post("requests")
    request(@CurrentUser() user: RequestUser, @Body() dto: CreateAccessRequestDto) {
        return this.access.request(user, dto.ownerId);
    }

    // Owner decisions. Each is scoped to the owner inside the service — a route keyed on
    // the grant id alone would let the person who asked accept their own request.
    @Post("requests/:id/accept")
    accept(@CurrentUser() user: RequestUser, @Param("id") id: string) {
        return this.access.accept(user, id);
    }

    @Post("requests/:id/reject")
    reject(@CurrentUser() user: RequestUser, @Param("id") id: string) {
        return this.access.reject(user, id, false);
    }

    @Post("requests/:id/block")
    block(@CurrentUser() user: RequestUser, @Param("id") id: string) {
        return this.access.reject(user, id, true);
    }

    @Post("requests/:id/revoke")
    revoke(@CurrentUser() user: RequestUser, @Param("id") id: string) {
        return this.access.revoke(user, id);
    }

    // Viewer side: cancelling a request they made, or giving up access they hold.
    @Post("requests/:id/withdraw")
    withdraw(@CurrentUser() user: RequestUser, @Param("id") id: string) {
        return this.access.withdraw(user, id);
    }
}

import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { ApprovedGuard } from "../../shared/approved.guard";
import { StatsService } from "./stats.service";

@Controller("stats")
@UseGuards(JwtAuthGuard, ApprovedGuard)
export class StatsController {
    constructor(private readonly statsService: StatsService) {}

    @Get("overview")
    overview(@CurrentUser() user: RequestUser) {
        return this.statsService.userOverview(user.id);
    }

    @Get("user/:userId")
    userStats(@Param("userId") userId: string) {
        return this.statsService.userOverview(userId);
    }
}

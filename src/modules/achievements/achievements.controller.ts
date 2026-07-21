import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { ApprovedGuard } from "../../shared/approved.guard";
import { AchievementsService } from "./achievements.service";

@Controller("achievements")
@UseGuards(JwtAuthGuard, ApprovedGuard)
export class AchievementsController {
    constructor(private readonly achievementsService: AchievementsService) {}

    @Get("me")
    findMine(@CurrentUser() user: RequestUser) {
        return this.achievementsService.findMine(user.id);
    }
}

import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { ApprovedGuard } from "../../shared/approved.guard";
import { TeamStatsService } from "./team-stats.service";

@Controller("stats/team")
@UseGuards(JwtAuthGuard, ApprovedGuard)
export class TeamStatsController {
    constructor(private readonly teamStatsService: TeamStatsService) {}

    @Get()
    findTeamStats() {
        return this.teamStatsService.overview();
    }
}

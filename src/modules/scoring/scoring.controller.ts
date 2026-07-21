import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { ApprovedGuard } from "../../shared/approved.guard";
import { ScoringService } from "./scoring.service";

/**
 * SHADOW MODE. Nothing calls this yet.
 *
 * It exists so the server-computed numbers can be compared against what the browser
 * renders, over real data, before anything is repointed at it. The client keeps
 * computing locally and keeps rendering its own values; this endpoint is read by hand.
 *
 * It returns the whole gym rather than one user because the leaderboard needs every
 * member's XP and level — a per-user version would unblock nothing.
 */
@Controller("scoring")
@UseGuards(JwtAuthGuard, ApprovedGuard)
export class ScoringController {
    constructor(private readonly scoringService: ScoringService) {}

    @Get()
    scoreEveryone() {
        return this.scoringService.scoreEveryone();
    }
}

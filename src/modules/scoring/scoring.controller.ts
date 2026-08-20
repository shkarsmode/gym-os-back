import { Controller, Get, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../../shared/admin.guard";
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
 *
 * ADMIN ONLY. The response is unfiltered: every member's complete personal-record list
 * (weights, reps, estimated 1RM, dates) and their whole XP ledger. /export deliberately
 * strips peer ledgers before sending the same data; this route did not, so any approved
 * account could read what that stripping exists to withhold. It has no client callers —
 * it is read by hand — so restricting it costs nothing.
 */
@Controller("scoring")
@UseGuards(JwtAuthGuard, ApprovedGuard, AdminGuard)
export class ScoringController {
    constructor(private readonly scoringService: ScoringService) {}

    @Get()
    scoreEveryone() {
        return this.scoringService.scoreEveryone();
    }
}

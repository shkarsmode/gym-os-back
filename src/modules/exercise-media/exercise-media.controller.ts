import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApprovedGuard } from "../../shared/approved.guard";
import { CurrentUser, RequestUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { MediaSuggestDto } from "./dto/media-suggest.dto";
import { ExerciseMediaService, normalizeRequest } from "./exercise-media.service";
import { MediaSuggestRateLimitGuard } from "./media-suggest-rate-limit.guard";

// Mounted on /exercises rather than /ai on purpose: /ai is guarded by AiRateLimitGuard,
// whose 4 s per-user cooldown is shared across every AI route, so creating an exercise
// would lock the user out of the AI coach. See MediaSuggestRateLimitGuard.
//
// "media-suggest" is a two-segment path and cannot collide with ExercisesController's
// ":id/..." three-segment routes or with its bare POST /exercises.
@Controller("exercises")
@UseGuards(JwtAuthGuard, ApprovedGuard)
export class ExerciseMediaController {
    constructor(private readonly media: ExerciseMediaService) {}

    // Always 200 with a usable body. Every failure inside is a `degraded` value, not an
    // error status, because the frontend renders this into a sheet, not into a toast.
    @Post("media-suggest")
    @UseGuards(MediaSuggestRateLimitGuard)
    suggest(@CurrentUser() user: RequestUser, @Body() dto: MediaSuggestDto) {
        return this.media.suggest(user?.id || null, normalizeRequest(dto));
    }
}

import { Body, Controller, Get, HttpException, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { ApprovedGuard } from "../../shared/approved.guard";
import { AdminGuard } from "../../shared/admin.guard";
import { tierOf } from "../../shared/admin";
import { AiRateLimitGuard } from "./ai-rate-limit.guard";
import { AiWorkoutService } from "./ai-workout.service";
import { AiUsageService } from "./ai-usage.service";
import { ParseWorkoutDto } from "./dto/parse-workout.dto";
import { StatisticsQueryDto } from "./dto/statistics-query.dto";
import { AiExerciseDuplicateService } from "./ai-exercise-duplicate.service";
import { ExerciseDuplicateCheckDto } from "./dto/exercise-duplicate.dto";
import { AiError } from "./ai.types";

// JwtAuthGuard authenticates and ApprovedGuard requires an approved account for every
// route. Parsing is tiered (free blocked, PRO limited, admin unlimited — enforced in the
// service by tier); the statistics routes are admin-only via AdminGuard.
@Controller("ai")
@UseGuards(JwtAuthGuard, ApprovedGuard)
export class AiController {
    constructor(
        private readonly aiWorkout: AiWorkoutService,
        private readonly usage: AiUsageService,
        private readonly duplicates: AiExerciseDuplicateService
    ) {}

    @Post("workouts/parse")
    @UseGuards(AiRateLimitGuard)
    async parse(@CurrentUser() user: RequestUser, @Body() dto: ParseWorkoutDto) {
        try {
            return await this.aiWorkout.parse(user, dto.text, tierOf(user));
        } catch (error) {
            if (error instanceof AiError) {
                throw new HttpException({ code: error.code, message: error.message }, error.httpStatus);
            }
            throw error;
        }
    }

    // Advisory duplicate check for the custom-exercise form. Open to EVERY approved
    // user - free users can create custom exercises, so they must be warned too; only
    // the Gemini judging step is tiered, and its absence degrades to fuzzy candidates.
    // Deliberately NOT behind AiRateLimitGuard: its 4 s cross-route cooldown would 429
    // a legitimate re-check and poison the user's parse budget. No AiError wrapper
    // either - the service never throws one.
    @Post("exercises/duplicate-check")
    async exerciseDuplicateCheck(@CurrentUser() user: RequestUser, @Body() dto: ExerciseDuplicateCheckDto) {
        return this.duplicates.check(user, tierOf(user), dto);
    }

    @Get("statistics/summary")
    @UseGuards(AdminGuard)
    summary(@Query() query: StatisticsQueryDto) {
        return this.usage.summary(query);
    }

    @Get("statistics/usage")
    @UseGuards(AdminGuard)
    usageStats(@Query() query: StatisticsQueryDto) {
        return this.usage.usage(query);
    }

    @Get("statistics/requests")
    @UseGuards(AdminGuard)
    requests(@Query() query: StatisticsQueryDto) {
        return this.usage.requests(query);
    }

    @Get("statistics/limits")
    @UseGuards(AdminGuard)
    limits() {
        return this.usage.limits();
    }
}

import { Body, Controller, Get, HttpException, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { ApprovedGuard } from "../../shared/approved.guard";
import { AdminGuard } from "../../shared/admin.guard";
import { AiRateLimitGuard } from "./ai-rate-limit.guard";
import { AiWorkoutService } from "./ai-workout.service";
import { AiUsageService } from "./ai-usage.service";
import { ParseWorkoutDto } from "./dto/parse-workout.dto";
import { StatisticsQueryDto } from "./dto/statistics-query.dto";
import { AiError } from "./ai.types";

// Admin-only. JwtAuthGuard authenticates, ApprovedGuard requires an approved account,
// AdminGuard requires admin. All three run for every route so a regular user gets 403
// even when calling the endpoints directly.
@Controller("ai")
@UseGuards(JwtAuthGuard, ApprovedGuard, AdminGuard)
export class AiController {
    constructor(
        private readonly aiWorkout: AiWorkoutService,
        private readonly usage: AiUsageService
    ) {}

    @Post("workouts/parse")
    @UseGuards(AiRateLimitGuard)
    async parse(@CurrentUser() user: RequestUser, @Body() dto: ParseWorkoutDto) {
        try {
            return await this.aiWorkout.parse(user, dto.text);
        } catch (error) {
            if (error instanceof AiError) {
                throw new HttpException({ code: error.code, message: error.message }, error.httpStatus);
            }
            throw error;
        }
    }

    @Get("statistics/summary")
    summary(@Query() query: StatisticsQueryDto) {
        return this.usage.summary(query);
    }

    @Get("statistics/usage")
    usageStats(@Query() query: StatisticsQueryDto) {
        return this.usage.usage(query);
    }

    @Get("statistics/requests")
    requests(@Query() query: StatisticsQueryDto) {
        return this.usage.requests(query);
    }

    @Get("statistics/limits")
    limits() {
        return this.usage.limits();
    }
}

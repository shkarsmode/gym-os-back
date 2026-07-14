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
import { AiError } from "./ai.types";

// JwtAuthGuard authenticates and ApprovedGuard requires an approved account for every
// route. Parsing is tiered (free blocked, PRO limited, admin unlimited — enforced in the
// service by tier); the statistics routes are admin-only via AdminGuard.
@Controller("ai")
@UseGuards(JwtAuthGuard, ApprovedGuard)
export class AiController {
    constructor(
        private readonly aiWorkout: AiWorkoutService,
        private readonly usage: AiUsageService
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

import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { ApprovedGuard } from "../../shared/approved.guard";
import { CreateFeedbackDto, UpdateFeedbackStatusDto } from "./dto/feedback.dto";
import { FeedbackService } from "./feedback.service";

@Controller("feedback")
export class FeedbackController {
    constructor(private readonly feedbackService: FeedbackService) {}

    @Get()
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    list() {
        return this.feedbackService.list();
    }

    @Post()
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    create(@CurrentUser() user: RequestUser, @Body() dto: CreateFeedbackDto) {
        return this.feedbackService.create(user, dto);
    }

    @Post(":id/status")
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    updateStatus(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateFeedbackStatusDto) {
        return this.feedbackService.updateStatus(user, id, dto.status);
    }

    @Post(":id/delete")
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    remove(@CurrentUser() user: RequestUser, @Param("id") id: string) {
        return this.feedbackService.remove(user, id);
    }
}

import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { hasUnlimitedQuota } from "../../shared/admin";
import { WorkoutTemplatesService } from "./workout-templates.service";

@Controller("workout-templates")
export class WorkoutTemplatesController {
    constructor(private readonly templatesService: WorkoutTemplatesService) {}

    @Get()
    findAll() {
        return this.templatesService.findAll();
    }

    @Post(":id/create-workout")
    @UseGuards(JwtAuthGuard)
    createWorkout(@CurrentUser() user: RequestUser, @Param("id") id: string) {
        return this.templatesService.createWorkout(user.id, id, hasUnlimitedQuota(user));
    }
}

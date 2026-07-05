import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { ApprovedGuard } from "../../shared/approved.guard";
import { tierOf } from "../../shared/admin";
import { CreateWorkoutTemplateDto } from "./dto/create-template.dto";
import { WorkoutTemplatesService } from "./workout-templates.service";

@Controller("workout-templates")
export class WorkoutTemplatesController {
    constructor(private readonly templatesService: WorkoutTemplatesService) {}

    @Get()
    findAll() {
        return this.templatesService.findAll();
    }

    @Get("mine")
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    findMine(@CurrentUser() user: RequestUser) {
        return this.templatesService.findMine(user.id);
    }

    @Post()
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    createOwn(@CurrentUser() user: RequestUser, @Body() dto: CreateWorkoutTemplateDto) {
        return this.templatesService.createOwn(user.id, dto);
    }

    @Post(":id/delete")
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    deleteOwn(@CurrentUser() user: RequestUser, @Param("id") id: string) {
        return this.templatesService.deleteOwn(user.id, id);
    }

    @Post(":id/create-workout")
    @UseGuards(JwtAuthGuard)
    createWorkout(@CurrentUser() user: RequestUser, @Param("id") id: string) {
        return this.templatesService.createWorkout(user.id, id, tierOf(user));
    }
}

import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { ApprovedGuard } from "../../shared/approved.guard";
import { CreateExerciseDto, UpdateExerciseDto } from "./dto/exercise.dto";
import { ExercisesService } from "./exercises.service";

@Controller("exercises")
export class ExercisesController {
    constructor(private readonly exercisesService: ExercisesService) {}

    @Get()
    findAll() {
        return this.exercisesService.findAll();
    }

    @Get(":id")
    findOne(@Param("id") id: string) {
        return this.exercisesService.findOne(id);
    }

    @Post()
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    create(@CurrentUser() user: RequestUser, @Body() dto: CreateExerciseDto) {
        return this.exercisesService.create(user.id, dto);
    }

    @Post("reset-curated")
    @UseGuards(JwtAuthGuard)
    resetCurated(@CurrentUser() user: RequestUser) {
        return this.exercisesService.resetCuratedCatalog(user);
    }

    @Post(":id/update")
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    update(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateExerciseDto) {
        return this.exercisesService.update(user.id, id, dto);
    }

    @Post(":id/delete")
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    remove(@CurrentUser() user: RequestUser, @Param("id") id: string) {
        return this.exercisesService.remove(user.id, id);
    }
}

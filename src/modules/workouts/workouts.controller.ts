import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { AddWorkoutExerciseDto, CreateCardioSessionDto, CreateWorkoutDto, CreateWorkoutSetDto, SaveWorkoutDto, UpdateCardioSessionDto, UpdateWorkoutDto, UpdateWorkoutExerciseDto, UpdateWorkoutSetDto } from "./dto/workout.dto";
import { WorkoutsService } from "./workouts.service";

@Controller("workouts")
@UseGuards(JwtAuthGuard)
export class WorkoutsController {
    constructor(private readonly workoutsService: WorkoutsService) {}

    @Get()
    findAll(@Query() query: Record<string, string>) {
        return this.workoutsService.findAll(query);
    }

    @Get(":id")
    findOne(@Param("id") id: string) {
        return this.workoutsService.findOne(id);
    }

    @Post()
    create(@CurrentUser() user: RequestUser, @Body() dto: CreateWorkoutDto) {
        return this.workoutsService.create(user.id, dto);
    }

    @Put(":id")
    save(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: SaveWorkoutDto) {
        return this.workoutsService.saveFull(user.id, id, dto);
    }

    @Post(":id/save")
    saveViaPost(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: SaveWorkoutDto) {
        return this.workoutsService.saveFull(user.id, id, dto);
    }

    @Patch(":id")
    update(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateWorkoutDto) {
        return this.workoutsService.update(user.id, id, dto);
    }

    @Delete(":id")
    remove(@CurrentUser() user: RequestUser, @Param("id") id: string) {
        return this.workoutsService.remove(user.id, id);
    }

    @Post(":id/start")
    start(@CurrentUser() user: RequestUser, @Param("id") id: string) {
        return this.workoutsService.start(user.id, id);
    }

    @Post(":id/finish")
    finish(@CurrentUser() user: RequestUser, @Param("id") id: string) {
        return this.workoutsService.finish(user.id, id);
    }

    @Post(":id/exercises")
    addExercise(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: AddWorkoutExerciseDto) {
        return this.workoutsService.addExercise(user.id, id, dto);
    }

    @Patch(":id/exercises/:workoutExerciseId")
    updateExercise(@CurrentUser() user: RequestUser, @Param("id") id: string, @Param("workoutExerciseId") workoutExerciseId: string, @Body() dto: UpdateWorkoutExerciseDto) {
        return this.workoutsService.updateExercise(user.id, id, workoutExerciseId, dto);
    }

    @Delete(":id/exercises/:workoutExerciseId")
    deleteExercise(@CurrentUser() user: RequestUser, @Param("id") id: string, @Param("workoutExerciseId") workoutExerciseId: string) {
        return this.workoutsService.deleteExercise(user.id, id, workoutExerciseId);
    }

    @Post(":id/exercises/:workoutExerciseId/sets")
    addSet(@CurrentUser() user: RequestUser, @Param("id") id: string, @Param("workoutExerciseId") workoutExerciseId: string, @Body() dto: CreateWorkoutSetDto) {
        return this.workoutsService.addSet(user.id, id, workoutExerciseId, dto);
    }

    @Patch(":id/exercises/:workoutExerciseId/sets/:setId")
    updateSet(@CurrentUser() user: RequestUser, @Param("id") id: string, @Param("workoutExerciseId") workoutExerciseId: string, @Param("setId") setId: string, @Body() dto: UpdateWorkoutSetDto) {
        return this.workoutsService.updateSet(user.id, id, workoutExerciseId, setId, dto);
    }

    @Delete(":id/exercises/:workoutExerciseId/sets/:setId")
    deleteSet(@CurrentUser() user: RequestUser, @Param("id") id: string, @Param("workoutExerciseId") workoutExerciseId: string, @Param("setId") setId: string) {
        return this.workoutsService.deleteSet(user.id, id, workoutExerciseId, setId);
    }

    @Post(":id/cardio")
    addCardio(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: CreateCardioSessionDto) {
        return this.workoutsService.addCardio(user.id, id, dto);
    }

    @Patch(":id/cardio/:cardioId")
    updateCardio(@CurrentUser() user: RequestUser, @Param("id") id: string, @Param("cardioId") cardioId: string, @Body() dto: UpdateCardioSessionDto) {
        return this.workoutsService.updateCardio(user.id, id, cardioId, dto);
    }

    @Delete(":id/cardio/:cardioId")
    deleteCardio(@CurrentUser() user: RequestUser, @Param("id") id: string, @Param("cardioId") cardioId: string) {
        return this.workoutsService.deleteCardio(user.id, id, cardioId);
    }
}

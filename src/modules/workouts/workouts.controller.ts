import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { ApprovedGuard } from "../../shared/approved.guard";
import { isAdminUser } from "../../shared/admin";
import { AddWorkoutExerciseDto, CreateCardioSessionDto, CreateWorkoutDto, CreateWorkoutSetDto, SaveWorkoutDto, UpdateCardioSessionDto, UpdateWorkoutDto, UpdateWorkoutExerciseDto, UpdateWorkoutSetDto } from "./dto/workout.dto";
import { WorkoutsService } from "./workouts.service";

// API uses GET + POST only (no PUT/PATCH/DELETE): some networks/proxies and the
// browser preflight behaved badly on the other verbs, so every mutation is a POST.
@Controller("workouts")
@UseGuards(JwtAuthGuard, ApprovedGuard)
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
        return this.workoutsService.create(user.id, dto, isAdminUser(user));
    }

    @Post(":id/save")
    save(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: SaveWorkoutDto) {
        return this.workoutsService.saveFull(user.id, id, dto, isAdminUser(user));
    }

    @Post(":id/update")
    update(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateWorkoutDto) {
        return this.workoutsService.update(user.id, id, dto);
    }

    @Post(":id/delete")
    remove(@CurrentUser() user: RequestUser, @Param("id") id: string) {
        return this.workoutsService.remove(user.id, id, isAdminUser(user));
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

    @Post(":id/exercises/:workoutExerciseId/update")
    updateExercise(@CurrentUser() user: RequestUser, @Param("id") id: string, @Param("workoutExerciseId") workoutExerciseId: string, @Body() dto: UpdateWorkoutExerciseDto) {
        return this.workoutsService.updateExercise(user.id, id, workoutExerciseId, dto);
    }

    @Post(":id/exercises/:workoutExerciseId/delete")
    deleteExercise(@CurrentUser() user: RequestUser, @Param("id") id: string, @Param("workoutExerciseId") workoutExerciseId: string) {
        return this.workoutsService.deleteExercise(user.id, id, workoutExerciseId);
    }

    @Post(":id/exercises/:workoutExerciseId/sets")
    addSet(@CurrentUser() user: RequestUser, @Param("id") id: string, @Param("workoutExerciseId") workoutExerciseId: string, @Body() dto: CreateWorkoutSetDto) {
        return this.workoutsService.addSet(user.id, id, workoutExerciseId, dto);
    }

    @Post(":id/exercises/:workoutExerciseId/sets/:setId/update")
    updateSet(@CurrentUser() user: RequestUser, @Param("id") id: string, @Param("workoutExerciseId") workoutExerciseId: string, @Param("setId") setId: string, @Body() dto: UpdateWorkoutSetDto) {
        return this.workoutsService.updateSet(user.id, id, workoutExerciseId, setId, dto);
    }

    @Post(":id/exercises/:workoutExerciseId/sets/:setId/delete")
    deleteSet(@CurrentUser() user: RequestUser, @Param("id") id: string, @Param("workoutExerciseId") workoutExerciseId: string, @Param("setId") setId: string) {
        return this.workoutsService.deleteSet(user.id, id, workoutExerciseId, setId);
    }

    @Post(":id/cardio")
    addCardio(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: CreateCardioSessionDto) {
        return this.workoutsService.addCardio(user.id, id, dto);
    }

    @Post(":id/cardio/:cardioId/update")
    updateCardio(@CurrentUser() user: RequestUser, @Param("id") id: string, @Param("cardioId") cardioId: string, @Body() dto: UpdateCardioSessionDto) {
        return this.workoutsService.updateCardio(user.id, id, cardioId, dto);
    }

    @Post(":id/cardio/:cardioId/delete")
    deleteCardio(@CurrentUser() user: RequestUser, @Param("id") id: string, @Param("cardioId") cardioId: string) {
        return this.workoutsService.deleteCardio(user.id, id, cardioId);
    }
}

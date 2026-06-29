import { Body, Controller, Get, Header, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { ApprovedGuard } from "../../shared/approved.guard";
import { CreateExerciseDto, ReactExerciseDto, UpdateExerciseDto } from "./dto/exercise.dto";
import { ExercisesService } from "./exercises.service";

@Controller("exercises")
export class ExercisesController {
    constructor(private readonly exercisesService: ExercisesService) {}

    // The catalog is shared (not per-user) and changes rarely, so let browsers reuse
    // it for a few minutes instead of refetching the full list on every navigation.
    @Get()
    @Header("Cache-Control", "public, max-age=300")
    findAll() {
        return this.exercisesService.findAll();
    }

    // Declared before ":id" so "pending" is not swallowed by the param route.
    @Get("pending")
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    pending(@CurrentUser() user: RequestUser) {
        return this.exercisesService.findPending(user);
    }

    // The current user's reactions map { exerciseId: "like" | "dislike" }.
    // Before ":id" so the literal path isn't swallowed by the param route.
    @Get("my-reactions")
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    myReactions(@CurrentUser() user: RequestUser) {
        return this.exercisesService.getMyReactions(user);
    }

    @Get(":id")
    findOne(@Param("id") id: string) {
        return this.exercisesService.findOne(id);
    }

    @Post()
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    create(@CurrentUser() user: RequestUser, @Body() dto: CreateExerciseDto) {
        return this.exercisesService.create(user, dto);
    }

    @Post(":id/approve")
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    approve(@CurrentUser() user: RequestUser, @Param("id") id: string) {
        return this.exercisesService.approve(user, id);
    }

    @Post(":id/reject")
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    reject(@CurrentUser() user: RequestUser, @Param("id") id: string) {
        return this.exercisesService.reject(user, id);
    }

    @Post("reset-curated")
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    resetCurated(@CurrentUser() user: RequestUser) {
        return this.exercisesService.resetCuratedCatalog(user);
    }

    @Post(":id/update")
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    update(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateExerciseDto) {
        return this.exercisesService.update(user, id, dto);
    }

    @Post(":id/delete")
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    remove(@CurrentUser() user: RequestUser, @Param("id") id: string) {
        return this.exercisesService.remove(user, id);
    }

    @Post(":id/react")
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    react(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: ReactExerciseDto) {
        return this.exercisesService.react(user, id, dto.type);
    }
}

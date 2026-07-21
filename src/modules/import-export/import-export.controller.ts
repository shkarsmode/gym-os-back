import { Body, Controller, Get, Headers, Post, Query, UseGuards, UseInterceptors } from "@nestjs/common";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { ApprovedGuard } from "../../shared/approved.guard";
import { CurrentUser, RequestUser } from "../../shared/current-user.decorator";
import { PayloadMetricsInterceptor } from "../../shared/payload-metrics.interceptor";
import { ImportExportService } from "./import-export.service";

@Controller()
@UseGuards(JwtAuthGuard, ApprovedGuard)
export class ImportExportController {
    constructor(private readonly importExportService: ImportExportService) {}

    // `shape` is read as a primitive @Query, never through a DTO. ValidationPipe runs
    // with forbidNonWhitelisted, so a DTO here would 400 on any query key it did not
    // declare — and the whole point of the parameter is that an old client omits it and
    // a new client sending it to an old server is harmlessly ignored. That is what makes
    // the two sides deployable in either order.
    @Get("export")
    @UseInterceptors(PayloadMetricsInterceptor)
    export(
        @CurrentUser() user: RequestUser,
        @Query("shape") shape?: string,
        @Query("ownLimit") ownLimit?: string,
        // Not a real HTTP 304: the catalog is one section of a larger body, so the
        // response still carries workouts and scoring. The header only tells us whether
        // the caller already has this exact catalog, in which case that section is
        // omitted and the client keeps what it cached.
        @Headers("if-none-match") ifNoneMatch?: string
    ) {
        return this.importExportService.export(user, {
            windowed: shape === "windowed",
            ownLimit: Number(ownLimit) || undefined,
            ifNoneMatch
        });
    }

    // NOTE: the monolithic `POST /import` was removed. express.json caps bodies at
    // 750kb (shared/configure-app.ts) while the smallest possible export exceeds 1MB,
    // so it could only ever 413 — after its prelude had already deleted the caller's
    // data. The live restore flow is start/chunk/finish below.

    @Post("import/start")
    startImport(@CurrentUser() user: RequestUser, @Body() payload: unknown) {
        return this.importExportService.startImport(user, payload);
    }

    @Post("import/chunk")
    importChunk(@CurrentUser() user: RequestUser, @Body() payload: unknown) {
        return this.importExportService.importChunk(user, payload);
    }

    @Post("import/finish")
    finishImport(@CurrentUser() user: RequestUser, @Body() payload: unknown) {
        return this.importExportService.finishImport(user, payload);
    }

    @Post("import/exercises")
    importExercises(@CurrentUser() user: RequestUser, @Body() payload: unknown) {
        return this.importExportService.importExercises(user, payload);
    }
}

import { Body, Controller, Get, Post, UseGuards, UseInterceptors } from "@nestjs/common";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { ApprovedGuard } from "../../shared/approved.guard";
import { CurrentUser, RequestUser } from "../../shared/current-user.decorator";
import { PayloadMetricsInterceptor } from "../../shared/payload-metrics.interceptor";
import { ImportExportService } from "./import-export.service";

@Controller()
@UseGuards(JwtAuthGuard, ApprovedGuard)
export class ImportExportController {
    constructor(private readonly importExportService: ImportExportService) {}

    @Get("export")
    @UseInterceptors(PayloadMetricsInterceptor)
    export(@CurrentUser() user: RequestUser) {
        return this.importExportService.export(user);
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

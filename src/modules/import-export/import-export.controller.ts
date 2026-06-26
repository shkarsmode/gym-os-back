import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { CurrentUser, RequestUser } from "../../shared/current-user.decorator";
import { ImportExportService } from "./import-export.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class ImportExportController {
    constructor(private readonly importExportService: ImportExportService) {}

    @Get("export")
    export(@CurrentUser() user: RequestUser) {
        return this.importExportService.export(user);
    }

    @Post("import")
    import(@CurrentUser() user: RequestUser, @Body() payload: unknown) {
        return this.importExportService.import(user, payload);
    }

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

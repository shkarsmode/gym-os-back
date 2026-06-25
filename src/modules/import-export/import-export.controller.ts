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

    @Post("import/exercises")
    importExercises(@CurrentUser() user: RequestUser, @Body() payload: unknown) {
        return this.importExportService.importExercises(user, payload);
    }
}

import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { ImportExportService } from "./import-export.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class ImportExportController {
    constructor(private readonly importExportService: ImportExportService) {}

    @Get("export")
    export() {
        return this.importExportService.export();
    }

    @Post("import")
    import(@Body() payload: unknown) {
        return this.importExportService.import(payload);
    }
}

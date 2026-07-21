import { Module } from "@nestjs/common";
import { ScoringModule } from "../scoring/scoring.module";
import { ImportExportController } from "./import-export.controller";
import { ImportExportService } from "./import-export.service";

@Module({
    // The windowed payload ships server-computed progression, because the client cannot
    // compute it once its history is truncated.
    imports: [ScoringModule],
    controllers: [ImportExportController],
    providers: [ImportExportService]
})
export class ImportExportModule {}

import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ScoringController } from "./scoring.controller";
import { ScoringService } from "./scoring.service";

@Module({
    imports: [PrismaModule],
    controllers: [ScoringController],
    providers: [ScoringService],
    exports: [ScoringService]
})
export class ScoringModule {}

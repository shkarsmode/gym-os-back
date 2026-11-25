import { Module } from "@nestjs/common";
import { BodyweightController } from "./bodyweight.controller";
import { BodyweightService } from "./bodyweight.service";

@Module({
    controllers: [BodyweightController],
    providers: [BodyweightService],
    exports: [BodyweightService]
})
export class BodyweightModule {}

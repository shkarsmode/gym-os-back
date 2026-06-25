import { Module } from "@nestjs/common";
import { BodyweightController } from "./bodyweight.controller";
import { BodyweightService } from "./bodyweight.service";

@Module({
    controllers: [BodyweightController],
    providers: [BodyweightService]
})
export class BodyweightModule {}

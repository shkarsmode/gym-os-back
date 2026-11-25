import { Module } from "@nestjs/common";
import { WorkoutTemplatesController } from "./workout-templates.controller";
import { WorkoutTemplatesService } from "./workout-templates.service";

@Module({
    controllers: [WorkoutTemplatesController],
    providers: [WorkoutTemplatesService],
    exports: [WorkoutTemplatesService]
})
export class WorkoutTemplatesModule {}

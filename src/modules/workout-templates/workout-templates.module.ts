import { Module } from "@nestjs/common";
import { WorkoutTemplatesController } from "./workout-templates.controller";
import { WorkoutTemplatesService } from "./workout-templates.service";

@Module({
    controllers: [WorkoutTemplatesController],
    providers: [WorkoutTemplatesService]
})
export class WorkoutTemplatesModule {}

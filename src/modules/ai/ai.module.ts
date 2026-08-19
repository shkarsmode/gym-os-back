import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiWorkoutService } from "./ai-workout.service";
import { AiExerciseDuplicateService } from "./ai-exercise-duplicate.service";
import { GeminiService } from "./gemini.service";
import { AiUsageService } from "./ai-usage.service";

// PrismaModule is @Global(), so PrismaService is injected without importing it here.
//
// GeminiService and AiUsageService are exported for ExerciseMediaModule, which imports
// this module to reach them. They are the only two providers any other module needs.
@Module({
    controllers: [AiController],
    providers: [AiWorkoutService, AiExerciseDuplicateService, GeminiService, AiUsageService],
    exports: [GeminiService, AiUsageService]
})
export class AiModule {}

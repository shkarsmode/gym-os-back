import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiWorkoutService } from "./ai-workout.service";
import { GeminiService } from "./gemini.service";
import { AiUsageService } from "./ai-usage.service";

// PrismaModule is @Global(), so PrismaService is injected without importing it here.
@Module({
    controllers: [AiController],
    providers: [AiWorkoutService, GeminiService, AiUsageService]
})
export class AiModule {}

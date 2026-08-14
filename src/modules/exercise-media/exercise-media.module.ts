import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { ExerciseMediaController } from "./exercise-media.controller";
import { ExerciseMediaService } from "./exercise-media.service";
import { MediaIndexService } from "./media-index.service";
import { MediaNameService } from "./media-name.service";
import { MediaVerifierService } from "./media-verifier.service";

// PrismaModule is @Global(), so PrismaService needs no import here.
//
// AiModule must export GeminiService and AiUsageService for the naming step to reach
// them. Both are injected with @Optional() in MediaNameService, so if that export is
// ever dropped the module still boots and the feature degrades to the deterministic
// Ukrainian lexicon instead of crashing the app at startup.
@Module({
    imports: [AiModule],
    controllers: [ExerciseMediaController],
    providers: [ExerciseMediaService, MediaIndexService, MediaNameService, MediaVerifierService],
    exports: [ExerciseMediaService, MediaIndexService, MediaVerifierService]
})
export class ExerciseMediaModule {}

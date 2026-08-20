import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health.controller";
import { ThrottleGuard } from "./shared/throttle.guard";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { ProfilesModule } from "./modules/profiles/profiles.module";
import { ExercisesModule } from "./modules/exercises/exercises.module";
import { ExerciseMediaModule } from "./modules/exercise-media/exercise-media.module";
import { WorkoutsModule } from "./modules/workouts/workouts.module";
import { WorkoutTemplatesModule } from "./modules/workout-templates/workout-templates.module";
import { BodyweightModule } from "./modules/bodyweight/bodyweight.module";
import { AchievementsModule } from "./modules/achievements/achievements.module";
import { ScoringModule } from "./modules/scoring/scoring.module";
import { ImportExportModule } from "./modules/import-export/import-export.module";
import { FeedbackModule } from "./modules/feedback/feedback.module";
import { FeedModule } from "./modules/feed/feed.module";
import { LiveModule } from "./modules/live/live.module";
import { AccessModule } from "./modules/access/access.module";
import { AiModule } from "./modules/ai/ai.module";

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        LiveModule,
        AuthModule,
        UsersModule,
        ProfilesModule,
        ExercisesModule,
        ExerciseMediaModule,
        WorkoutsModule,
        WorkoutTemplatesModule,
        BodyweightModule,
        AchievementsModule,
        ScoringModule,
        ImportExportModule,
        FeedbackModule,
        AiModule,
        FeedModule,
        AccessModule
    ],
    controllers: [HealthController],
    providers: [{ provide: APP_GUARD, useClass: ThrottleGuard }]
})
export class AppModule {}

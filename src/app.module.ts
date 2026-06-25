import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { ProfilesModule } from "./modules/profiles/profiles.module";
import { ExercisesModule } from "./modules/exercises/exercises.module";
import { WorkoutsModule } from "./modules/workouts/workouts.module";
import { WorkoutTemplatesModule } from "./modules/workout-templates/workout-templates.module";
import { BodyweightModule } from "./modules/bodyweight/bodyweight.module";
import { PersonalRecordsModule } from "./modules/personal-records/personal-records.module";
import { AchievementsModule } from "./modules/achievements/achievements.module";
import { RankingsModule } from "./modules/rankings/rankings.module";
import { TeamStatsModule } from "./modules/team-stats/team-stats.module";
import { StatsModule } from "./modules/stats/stats.module";
import { ImportExportModule } from "./modules/import-export/import-export.module";

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
        UsersModule,
        ProfilesModule,
        ExercisesModule,
        WorkoutsModule,
        WorkoutTemplatesModule,
        BodyweightModule,
        PersonalRecordsModule,
        AchievementsModule,
        RankingsModule,
        TeamStatsModule,
        StatsModule,
        ImportExportModule
    ],
    controllers: [HealthController]
})
export class AppModule {}

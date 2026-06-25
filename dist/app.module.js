"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const health_controller_1 = require("./health.controller");
const prisma_module_1 = require("./prisma/prisma.module");
const auth_module_1 = require("./modules/auth/auth.module");
const users_module_1 = require("./modules/users/users.module");
const profiles_module_1 = require("./modules/profiles/profiles.module");
const exercises_module_1 = require("./modules/exercises/exercises.module");
const workouts_module_1 = require("./modules/workouts/workouts.module");
const workout_templates_module_1 = require("./modules/workout-templates/workout-templates.module");
const bodyweight_module_1 = require("./modules/bodyweight/bodyweight.module");
const personal_records_module_1 = require("./modules/personal-records/personal-records.module");
const achievements_module_1 = require("./modules/achievements/achievements.module");
const rankings_module_1 = require("./modules/rankings/rankings.module");
const team_stats_module_1 = require("./modules/team-stats/team-stats.module");
const stats_module_1 = require("./modules/stats/stats.module");
const import_export_module_1 = require("./modules/import-export/import-export.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            profiles_module_1.ProfilesModule,
            exercises_module_1.ExercisesModule,
            workouts_module_1.WorkoutsModule,
            workout_templates_module_1.WorkoutTemplatesModule,
            bodyweight_module_1.BodyweightModule,
            personal_records_module_1.PersonalRecordsModule,
            achievements_module_1.AchievementsModule,
            rankings_module_1.RankingsModule,
            team_stats_module_1.TeamStatsModule,
            stats_module_1.StatsModule,
            import_export_module_1.ImportExportModule
        ],
        controllers: [health_controller_1.HealthController]
    })
], AppModule);
//# sourceMappingURL=app.module.js.map
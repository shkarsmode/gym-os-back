import { Module } from "@nestjs/common";
import { BodyweightModule } from "../bodyweight/bodyweight.module";
import { WorkoutTemplatesModule } from "../workout-templates/workout-templates.module";
import { WorkoutsModule } from "../workouts/workouts.module";
import { McpAuditService } from "./audit.service";
import { McpGymService } from "./gym.service";
import { McpController } from "./mcp.controller";
import { McpOAuthModule } from "./oauth/mcp-oauth.module";

@Module({
    imports: [McpOAuthModule, WorkoutsModule, BodyweightModule, WorkoutTemplatesModule],
    controllers: [McpController],
    providers: [McpGymService, McpAuditService]
})
export class McpModule {}

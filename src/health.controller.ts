import { Controller, Get } from "@nestjs/common";
import { LiveBus } from "./modules/live/live.bus";

@Controller("health")
export class HealthController {
    constructor(private readonly live: LiveBus) {}

    @Get()
    health() {
        return {
            ok: true,
            service: "GymOS API",
            databaseConfigured: Boolean(process.env.DATABASE_URL),
            googleOAuthConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
            // Open live streams. Without this there is no way to answer "is the live
            // layer actually up" short of opening a browser — a stream that silently
            // stopped accepting connections looks identical to a quiet gym.
            live: this.live.stats(),
            timestamp: new Date().toISOString()
        };
    }
}

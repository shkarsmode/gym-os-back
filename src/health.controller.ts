import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
    @Get()
    health() {
        return {
            ok: true,
            service: "GymOS API",
            databaseConfigured: Boolean(process.env.DATABASE_URL),
            googleOAuthConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
            timestamp: new Date().toISOString()
        };
    }
}

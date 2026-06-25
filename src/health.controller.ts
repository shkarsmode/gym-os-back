import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
    @Get()
    health() {
        return {
            ok: true,
            service: "GymOS API",
            timestamp: new Date().toISOString()
        };
    }
}

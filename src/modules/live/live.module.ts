import { Global, Module } from "@nestjs/common";
import { LiveBus } from "./live.bus";
import { LiveController } from "./live.controller";

// Global so any service that writes can publish a hint without every feature module
// having to import this one. There is exactly one bus per process.
@Global()
@Module({
    controllers: [LiveController],
    providers: [LiveBus],
    exports: [LiveBus]
})
export class LiveModule {}

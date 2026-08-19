import { Module } from "@nestjs/common";
import { FeedController } from "./feed.controller";
import { FeedService } from "./feed.service";
import { PushService } from "./push.service";

// PrismaModule is @Global(), so PrismaService is injected without importing it here.
@Module({
    controllers: [FeedController],
    providers: [FeedService, PushService]
})
export class FeedModule {}

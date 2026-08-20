import { Module } from "@nestjs/common";
import { AccessController } from "./access.controller";
import { AccessService } from "./access.service";
import { PushService } from "../feed/push.service";

// PrismaModule and LiveModule are both @Global, so neither is imported here.
// PushService is provided directly rather than importing FeedModule, which would pull in
// the whole feed service for one method.
@Module({
    controllers: [AccessController],
    providers: [AccessService, PushService]
})
export class AccessModule {}

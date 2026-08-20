import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./shared/configure-app";

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bodyParser: false });
    configureApp(app);
    // Live streams are long-lived HTTP responses, so an open one keeps the server from
    // closing. Without shutdown hooks a redeploy waits out the grace period and is then
    // killed, which turns every release into a hard drop for whoever was connected.
    // LiveBus ends its streams on this signal so the process can exit promptly.
    app.enableShutdownHooks();
    await app.listen(process.env.PORT || 3000);
}

bootstrap();

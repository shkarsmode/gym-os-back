import express from "express";
import { ExpressAdapter } from "@nestjs/platform-express";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./shared/configure-app";

let cachedServer: express.Express | null = null;

async function bootstrapServer() {
    if (cachedServer) {
        return cachedServer;
    }

    const server = express();
    const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
        bodyParser: false,
        logger: ["error", "warn", "log"]
    });
    configureApp(app);
    await app.init();
    cachedServer = server;
    return server;
}

export default async function handler(request: express.Request, response: express.Response) {
    const server = await bootstrapServer();
    return server(request, response);
}

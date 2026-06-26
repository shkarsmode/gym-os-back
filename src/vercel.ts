import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import express from "express";
import { AppModule } from "./app.module";
import { configureApp } from "./shared/configure-app";

let cachedServer: express.Express | null = null;

function normalizeOrigin(origin: string) {
    return origin.trim().replace(/\/+$/, "");
}

function buildAllowedOrigins() {
    return String(process.env.FRONTEND_URL || "http://localhost:8080")
        .split(",")
        .map(normalizeOrigin)
        .filter(Boolean)
        .concat([
            "http://localhost:8080",
            "http://127.0.0.1:8080",
            "http://localhost:5500",
            "http://127.0.0.1:5500",
            "https://gym-os-beryl.vercel.app"
        ])
        .map(normalizeOrigin)
        .filter((origin, index, origins) => origins.indexOf(origin) === index);
}

function applyCorsHeaders(request: express.Request, response: express.Response) {
    const origin = request.headers.origin;
    const allowedOrigins = buildAllowedOrigins();
    const normalizedOrigin = typeof origin === "string" ? normalizeOrigin(origin) : "";
    const isAllowedOrigin = Boolean(origin && allowedOrigins.includes(normalizedOrigin));

    if (!isAllowedOrigin) {
        return false;
    }

    const requestedHeaders = request.headers["access-control-request-headers"];

    response.setHeader("Access-Control-Allow-Origin", origin as any);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");
    response.setHeader(
        "Access-Control-Allow-Headers",
        Array.isArray(requestedHeaders)
            ? requestedHeaders.join(", ")
            : requestedHeaders || "Content-Type, Authorization"
    );
    response.setHeader("Vary", "Origin");

    return true;
}

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
    const isAllowedOrigin = applyCorsHeaders(request, response);

    console.log(`${request.method} ${request.url}`);

    if (request.method === "OPTIONS") {
        response.status(isAllowedOrigin ? 204 : 403).send();
        return;
    }

    const server = await bootstrapServer();

    return server(request, response);
}
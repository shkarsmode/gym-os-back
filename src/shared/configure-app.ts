import { INestApplication, ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import express, { NextFunction, Request, Response } from "express";

function buildAllowedOrigins() {
    const allowedOrigins = String(process.env.FRONTEND_URL || "http://localhost:8080")
        .split(",")
        .map((origin) => origin.trim().replace(/\/$/, ""))
        .filter(Boolean);

    [
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "https://gym-os-beryl.vercel.app/"
    ].forEach((origin) => {
        if (!allowedOrigins.includes(origin)) {
            allowedOrigins.push(origin);
        }
    });

    if (process.env.ALLOW_FILE_ORIGIN === "true") {
        allowedOrigins.push("null");
    }

    return allowedOrigins;
}

export function configureApp(app: INestApplication) {
    const allowedOrigins = buildAllowedOrigins();

    app.use((request: Request, response: Response, next: NextFunction) => {
        const origin = request.headers.origin;
        const normalizedOrigin = typeof origin === "string" ? origin.replace(/\/$/, "") : "";

        if (!origin || allowedOrigins.includes(normalizedOrigin)) {
            if (origin) {
                response.setHeader("Access-Control-Allow-Origin", origin);
                response.setHeader("Vary", "Origin");
            }

            const requestedHeaders = request.headers["access-control-request-headers"];

            response.setHeader("Access-Control-Allow-Credentials", "true");
            response.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");
            response.setHeader(
                "Access-Control-Allow-Headers",
                Array.isArray(requestedHeaders)
                    ? requestedHeaders.join(", ")
                    : requestedHeaders || "Content-Type, Authorization"
            );
        }

        if (request.method === "OPTIONS") {
            response.status(204).send();
            return;
        }

        next();
    });

    app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "750kb" }));
    app.use(express.urlencoded({ extended: true, limit: process.env.JSON_BODY_LIMIT || "750kb" }));
    app.use(cookieParser());

    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true
    }));
}
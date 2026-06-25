import { INestApplication, ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";

export function configureApp(app: INestApplication) {
    const allowedOrigins = String(process.env.FRONTEND_URL || "http://localhost:8080")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
    if (process.env.ALLOW_FILE_ORIGIN === "true") {
        allowedOrigins.push("null");
    }

    app.enableCors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error("Origin is not allowed by GymOS CORS"));
        },
        credentials: true
    });
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true
    }));
}

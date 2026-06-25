import { INestApplication, ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";

export function configureApp(app: INestApplication) {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:8080";

    app.enableCors({
        origin: frontendUrl,
        credentials: true
    });
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true
    }));
}

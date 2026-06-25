"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureApp = configureApp;
const common_1 = require("@nestjs/common");
const cookie_parser_1 = require("cookie-parser");
function configureApp(app) {
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
    app.use((0, cookie_parser_1.default)());
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true
    }));
}
//# sourceMappingURL=configure-app.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureApp = configureApp;
const common_1 = require("@nestjs/common");
const cookie_parser_1 = require("cookie-parser");
function configureApp(app) {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:8080";
    app.enableCors({
        origin: frontendUrl,
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
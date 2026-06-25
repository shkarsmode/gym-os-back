"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const express_1 = require("express");
const platform_express_1 = require("@nestjs/platform-express");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const configure_app_1 = require("./shared/configure-app");
let cachedServer = null;
async function bootstrapServer() {
    if (cachedServer) {
        return cachedServer;
    }
    const server = (0, express_1.default)();
    const app = await core_1.NestFactory.create(app_module_1.AppModule, new platform_express_1.ExpressAdapter(server), {
        logger: ["error", "warn", "log"]
    });
    (0, configure_app_1.configureApp)(app);
    await app.init();
    cachedServer = server;
    return server;
}
async function handler(request, response) {
    const server = await bootstrapServer();
    return server(request, response);
}
//# sourceMappingURL=vercel.js.map
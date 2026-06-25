"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BodyweightModule = void 0;
const common_1 = require("@nestjs/common");
const bodyweight_controller_1 = require("./bodyweight.controller");
const bodyweight_service_1 = require("./bodyweight.service");
let BodyweightModule = class BodyweightModule {
};
exports.BodyweightModule = BodyweightModule;
exports.BodyweightModule = BodyweightModule = __decorate([
    (0, common_1.Module)({
        controllers: [bodyweight_controller_1.BodyweightController],
        providers: [bodyweight_service_1.BodyweightService]
    })
], BodyweightModule);
//# sourceMappingURL=bodyweight.module.js.map
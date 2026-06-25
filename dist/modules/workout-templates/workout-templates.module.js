"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkoutTemplatesModule = void 0;
const common_1 = require("@nestjs/common");
const workout_templates_controller_1 = require("./workout-templates.controller");
const workout_templates_service_1 = require("./workout-templates.service");
let WorkoutTemplatesModule = class WorkoutTemplatesModule {
};
exports.WorkoutTemplatesModule = WorkoutTemplatesModule;
exports.WorkoutTemplatesModule = WorkoutTemplatesModule = __decorate([
    (0, common_1.Module)({
        controllers: [workout_templates_controller_1.WorkoutTemplatesController],
        providers: [workout_templates_service_1.WorkoutTemplatesService]
    })
], WorkoutTemplatesModule);
//# sourceMappingURL=workout-templates.module.js.map
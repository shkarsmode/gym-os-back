"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkoutTemplatesController = void 0;
const common_1 = require("@nestjs/common");
const current_user_decorator_1 = require("../../shared/current-user.decorator");
const jwt_auth_guard_1 = require("../../shared/jwt-auth.guard");
const workout_templates_service_1 = require("./workout-templates.service");
let WorkoutTemplatesController = class WorkoutTemplatesController {
    constructor(templatesService) {
        this.templatesService = templatesService;
    }
    findAll() {
        return this.templatesService.findAll();
    }
    createWorkout(user, id) {
        return this.templatesService.createWorkout(user.id, id);
    }
};
exports.WorkoutTemplatesController = WorkoutTemplatesController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], WorkoutTemplatesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)(":id/create-workout"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], WorkoutTemplatesController.prototype, "createWorkout", null);
exports.WorkoutTemplatesController = WorkoutTemplatesController = __decorate([
    (0, common_1.Controller)("workout-templates"),
    __metadata("design:paramtypes", [workout_templates_service_1.WorkoutTemplatesService])
], WorkoutTemplatesController);
//# sourceMappingURL=workout-templates.controller.js.map
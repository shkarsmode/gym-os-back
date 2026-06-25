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
exports.BodyweightController = void 0;
const common_1 = require("@nestjs/common");
const current_user_decorator_1 = require("../../shared/current-user.decorator");
const jwt_auth_guard_1 = require("../../shared/jwt-auth.guard");
const create_bodyweight_dto_1 = require("./dto/create-bodyweight.dto");
const bodyweight_service_1 = require("./bodyweight.service");
let BodyweightController = class BodyweightController {
    constructor(bodyweightService) {
        this.bodyweightService = bodyweightService;
    }
    findMine(user) {
        return this.bodyweightService.findMine(user.id);
    }
    createMine(user, dto) {
        return this.bodyweightService.createMine(user.id, dto);
    }
    deleteMine(user, entryId) {
        return this.bodyweightService.deleteMine(user.id, entryId);
    }
};
exports.BodyweightController = BodyweightController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BodyweightController.prototype, "findMine", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_bodyweight_dto_1.CreateBodyweightDto]),
    __metadata("design:returntype", void 0)
], BodyweightController.prototype, "createMine", null);
__decorate([
    (0, common_1.Delete)(":entryId"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)("entryId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], BodyweightController.prototype, "deleteMine", null);
exports.BodyweightController = BodyweightController = __decorate([
    (0, common_1.Controller)("users/me/bodyweight"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [bodyweight_service_1.BodyweightService])
], BodyweightController);
//# sourceMappingURL=bodyweight.controller.js.map
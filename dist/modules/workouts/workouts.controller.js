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
exports.WorkoutsController = void 0;
const common_1 = require("@nestjs/common");
const current_user_decorator_1 = require("../../shared/current-user.decorator");
const jwt_auth_guard_1 = require("../../shared/jwt-auth.guard");
const workout_dto_1 = require("./dto/workout.dto");
const workouts_service_1 = require("./workouts.service");
let WorkoutsController = class WorkoutsController {
    constructor(workoutsService) {
        this.workoutsService = workoutsService;
    }
    findAll(query) {
        return this.workoutsService.findAll(query);
    }
    findOne(id) {
        return this.workoutsService.findOne(id);
    }
    create(user, dto) {
        return this.workoutsService.create(user.id, dto);
    }
    update(user, id, dto) {
        return this.workoutsService.update(user.id, id, dto);
    }
    remove(user, id) {
        return this.workoutsService.remove(user.id, id);
    }
    start(user, id) {
        return this.workoutsService.start(user.id, id);
    }
    finish(user, id) {
        return this.workoutsService.finish(user.id, id);
    }
    addExercise(user, id, dto) {
        return this.workoutsService.addExercise(user.id, id, dto);
    }
    updateExercise(user, id, workoutExerciseId, dto) {
        return this.workoutsService.updateExercise(user.id, id, workoutExerciseId, dto);
    }
    deleteExercise(user, id, workoutExerciseId) {
        return this.workoutsService.deleteExercise(user.id, id, workoutExerciseId);
    }
    addSet(user, id, workoutExerciseId, dto) {
        return this.workoutsService.addSet(user.id, id, workoutExerciseId, dto);
    }
    updateSet(user, id, workoutExerciseId, setId, dto) {
        return this.workoutsService.updateSet(user.id, id, workoutExerciseId, setId, dto);
    }
    deleteSet(user, id, workoutExerciseId, setId) {
        return this.workoutsService.deleteSet(user.id, id, workoutExerciseId, setId);
    }
    addCardio(user, id, dto) {
        return this.workoutsService.addCardio(user.id, id, dto);
    }
    updateCardio(user, id, cardioId, dto) {
        return this.workoutsService.updateCardio(user.id, id, cardioId, dto);
    }
    deleteCardio(user, id, cardioId) {
        return this.workoutsService.deleteCardio(user.id, id, cardioId);
    }
};
exports.WorkoutsController = WorkoutsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], WorkoutsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(":id"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WorkoutsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, workout_dto_1.CreateWorkoutDto]),
    __metadata("design:returntype", void 0)
], WorkoutsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(":id"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, workout_dto_1.UpdateWorkoutDto]),
    __metadata("design:returntype", void 0)
], WorkoutsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(":id"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], WorkoutsController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(":id/start"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], WorkoutsController.prototype, "start", null);
__decorate([
    (0, common_1.Post)(":id/finish"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], WorkoutsController.prototype, "finish", null);
__decorate([
    (0, common_1.Post)(":id/exercises"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, workout_dto_1.AddWorkoutExerciseDto]),
    __metadata("design:returntype", void 0)
], WorkoutsController.prototype, "addExercise", null);
__decorate([
    (0, common_1.Patch)(":id/exercises/:workoutExerciseId"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Param)("workoutExerciseId")),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, workout_dto_1.UpdateWorkoutExerciseDto]),
    __metadata("design:returntype", void 0)
], WorkoutsController.prototype, "updateExercise", null);
__decorate([
    (0, common_1.Delete)(":id/exercises/:workoutExerciseId"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Param)("workoutExerciseId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], WorkoutsController.prototype, "deleteExercise", null);
__decorate([
    (0, common_1.Post)(":id/exercises/:workoutExerciseId/sets"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Param)("workoutExerciseId")),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, workout_dto_1.CreateWorkoutSetDto]),
    __metadata("design:returntype", void 0)
], WorkoutsController.prototype, "addSet", null);
__decorate([
    (0, common_1.Patch)(":id/exercises/:workoutExerciseId/sets/:setId"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Param)("workoutExerciseId")),
    __param(3, (0, common_1.Param)("setId")),
    __param(4, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, workout_dto_1.UpdateWorkoutSetDto]),
    __metadata("design:returntype", void 0)
], WorkoutsController.prototype, "updateSet", null);
__decorate([
    (0, common_1.Delete)(":id/exercises/:workoutExerciseId/sets/:setId"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Param)("workoutExerciseId")),
    __param(3, (0, common_1.Param)("setId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], WorkoutsController.prototype, "deleteSet", null);
__decorate([
    (0, common_1.Post)(":id/cardio"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, workout_dto_1.CreateCardioSessionDto]),
    __metadata("design:returntype", void 0)
], WorkoutsController.prototype, "addCardio", null);
__decorate([
    (0, common_1.Patch)(":id/cardio/:cardioId"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Param)("cardioId")),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, workout_dto_1.UpdateCardioSessionDto]),
    __metadata("design:returntype", void 0)
], WorkoutsController.prototype, "updateCardio", null);
__decorate([
    (0, common_1.Delete)(":id/cardio/:cardioId"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Param)("cardioId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], WorkoutsController.prototype, "deleteCardio", null);
exports.WorkoutsController = WorkoutsController = __decorate([
    (0, common_1.Controller)("workouts"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [workouts_service_1.WorkoutsService])
], WorkoutsController);
//# sourceMappingURL=workouts.controller.js.map
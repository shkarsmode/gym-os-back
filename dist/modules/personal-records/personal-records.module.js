"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonalRecordsModule = void 0;
const common_1 = require("@nestjs/common");
const personal_records_service_1 = require("./personal-records.service");
let PersonalRecordsModule = class PersonalRecordsModule {
};
exports.PersonalRecordsModule = PersonalRecordsModule;
exports.PersonalRecordsModule = PersonalRecordsModule = __decorate([
    (0, common_1.Module)({
        providers: [personal_records_service_1.PersonalRecordsService],
        exports: [personal_records_service_1.PersonalRecordsService]
    })
], PersonalRecordsModule);
//# sourceMappingURL=personal-records.module.js.map
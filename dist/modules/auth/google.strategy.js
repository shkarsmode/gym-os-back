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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleStrategy = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const passport_1 = require("@nestjs/passport");
const passport_google_oauth20_1 = require("passport-google-oauth20");
let GoogleStrategy = class GoogleStrategy extends (0, passport_1.PassportStrategy)(passport_google_oauth20_1.Strategy, "google") {
    constructor(configService) {
        super({
            clientID: configService.get("GOOGLE_CLIENT_ID") || "missing-google-client-id",
            clientSecret: configService.get("GOOGLE_CLIENT_SECRET") || "missing-google-client-secret",
            callbackURL: configService.get("GOOGLE_CALLBACK_URL") || "http://localhost:3000/auth/google/callback",
            scope: ["email", "profile"]
        });
    }
    validate(accessToken, refreshToken, profile, done) {
        const email = profile.emails?.[0]?.value;
        if (!email) {
            return done(new Error("Google account has no email"), false);
        }
        done(null, {
            googleId: profile.id,
            email,
            displayName: profile.displayName || email,
            avatarUrl: profile.photos?.[0]?.value || null,
            accessToken,
            refreshToken
        });
    }
};
exports.GoogleStrategy = GoogleStrategy;
exports.GoogleStrategy = GoogleStrategy = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], GoogleStrategy);
//# sourceMappingURL=google.strategy.js.map
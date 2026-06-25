import { ConfigService } from "@nestjs/config";
import { Profile, Strategy, VerifyCallback } from "passport-google-oauth20";
declare const GoogleStrategy_base: new (...args: any[]) => Strategy;
export declare class GoogleStrategy extends GoogleStrategy_base {
    constructor(configService: ConfigService);
    validate(accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback): void;
}
export {};

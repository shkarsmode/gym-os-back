import { jwtSecret } from "./jwt-secret";
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { GoogleStrategy } from "./google.strategy";
import { JwtStrategy } from "./jwt.strategy";
import { SESSION_TTL } from "./session";

@Module({
    imports: [
        PassportModule,
        JwtModule.register({
            secret: jwtSecret(),
            signOptions: { expiresIn: SESSION_TTL }
        })
    ],
    controllers: [AuthController],
    providers: [AuthService, GoogleStrategy, JwtStrategy],
    exports: [AuthService]
})
export class AuthModule {}

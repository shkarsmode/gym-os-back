import { IsIn, IsString } from "class-validator";
import { CHEER_EMOJI } from "../live.rules";

export class CheerDto {
    @IsString()
    workoutId!: string;

    // Whitelisted at the edge as well as in the service. ValidationPipe runs with
    // forbidNonWhitelisted, so anything not declared here is a 400 rather than something
    // that reaches another person's screen.
    @IsIn(CHEER_EMOJI)
    emoji!: string;
}

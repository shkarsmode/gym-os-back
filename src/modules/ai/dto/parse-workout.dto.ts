import { IsString, MaxLength, MinLength } from "class-validator";

export class ParseWorkoutDto {
    // Hard upper bound as an abuse backstop; the service further enforces
    // GEMINI_MAX_INPUT_LENGTH before calling Gemini.
    @IsString()
    @MinLength(3)
    @MaxLength(8000)
    text!: string;
}

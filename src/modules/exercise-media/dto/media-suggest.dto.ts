import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

// The exact fields the custom-exercise form already holds. Muscle group, equipment and
// movement pattern are optional but materially improve match quality, which is why the
// button lives at the bottom of the form rather than next to the name input.
export class MediaSuggestDto {
    @IsString()
    @MinLength(2)
    @MaxLength(120)
    name!: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(8)
    aliases?: string[];

    @IsOptional()
    @IsString()
    @MaxLength(60)
    primaryMuscleGroup?: string;

    @IsOptional()
    @IsString()
    @MaxLength(60)
    equipment?: string;

    @IsOptional()
    @IsString()
    @MaxLength(60)
    movementPattern?: string;

    // Hard-capped at 8 in the service as well: every extra tile is another outbound
    // request against a third-party origin we do not control.
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(8)
    limit?: number;
}

import { IsArray, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class ExerciseDuplicateCheckDto {
    // The proposed exercise name. Hard upper bound as an abuse backstop.
    // @MinLength(1), not (2): a too-short name is answered with an empty 200 payload by
    // the service, not a 400. Nothing about this endpoint may block a creation.
    @IsString()
    @MinLength(1)
    @MaxLength(160)
    name!: string;

    // Muscle and equipment are what separate a leg extension from a leg curl, so
    // they matter far more to the judge than they cost in tokens.
    @IsOptional()
    @IsString()
    @MaxLength(80)
    primaryMuscleGroup?: string;

    @IsOptional()
    @IsString()
    @MaxLength(80)
    equipment?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    description?: string;

    // each: true so the element type is actually enforced. The prompt builder coerces with
    // String() anyway, but the other four fields are strict and this one should match.
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @MaxLength(80, { each: true })
    aliases?: string[];
}

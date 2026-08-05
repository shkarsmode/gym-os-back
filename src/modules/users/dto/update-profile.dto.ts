import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class UpdateProfileDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    displayName?: string;

    @IsOptional()
    @IsNumber()
    @Min(80)
    @Max(240)
    height?: number;

    @IsOptional()
    @IsNumber()
    @Min(20)
    @Max(300)
    bodyweight?: number;

    // Year only — enough for training age/recovery context, and far less personal
    // data than a full date of birth.
    @IsOptional()
    @IsNumber()
    @Min(1920)
    @Max(2030)
    birthYear?: number;

    @IsOptional()
    @IsIn(["male", "female"])
    gender?: string;

    @IsOptional()
    @IsString()
    trainingGoal?: string;

    @IsOptional()
    @IsString()
    trainingExperience?: string;

    @IsOptional()
    @IsString()
    favoriteMuscleGroup?: string;
}

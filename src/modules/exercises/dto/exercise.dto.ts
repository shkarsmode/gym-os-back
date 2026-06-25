import { IsArray, IsBoolean, IsOptional, IsString } from "class-validator";

export class CreateExerciseDto {
    @IsString()
    name!: string;

    @IsOptional()
    @IsArray()
    aliases?: string[];

    @IsString()
    primaryMuscleGroup!: string;

    @IsOptional()
    @IsArray()
    secondaryMuscleGroups?: string[];

    @IsString()
    movementPattern!: string;

    @IsString()
    equipment!: string;

    @IsString()
    category!: string;

    @IsString()
    difficulty!: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsArray()
    techniqueSteps?: string[];

    @IsOptional()
    @IsArray()
    commonMistakes?: string[];

    @IsOptional()
    @IsArray()
    safetyTips?: string[];

    @IsOptional()
    @IsString()
    mediaUrl?: string;

    @IsOptional()
    @IsString()
    mediaType?: string;

    @IsOptional()
    @IsBoolean()
    isCustom?: boolean;
}

export class UpdateExerciseDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsArray()
    aliases?: string[];

    @IsOptional()
    @IsString()
    primaryMuscleGroup?: string;

    @IsOptional()
    @IsArray()
    secondaryMuscleGroups?: string[];

    @IsOptional()
    @IsString()
    movementPattern?: string;

    @IsOptional()
    @IsString()
    equipment?: string;

    @IsOptional()
    @IsString()
    category?: string;

    @IsOptional()
    @IsString()
    difficulty?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsArray()
    techniqueSteps?: string[];

    @IsOptional()
    @IsArray()
    commonMistakes?: string[];

    @IsOptional()
    @IsArray()
    safetyTips?: string[];

    @IsOptional()
    @IsString()
    mediaUrl?: string;

    @IsOptional()
    @IsString()
    mediaType?: string;

    @IsOptional()
    @IsBoolean()
    isCustom?: boolean;
}

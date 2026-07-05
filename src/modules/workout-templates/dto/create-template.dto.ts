import { Type } from "class-transformer";
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from "class-validator";

export class TemplateExerciseDto {
    @IsString()
    exerciseId!: string;

    @IsInt()
    @Min(1)
    @Max(200)
    order!: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(50)
    targetSets?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(1000)
    targetReps?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(86400)
    restSeconds?: number;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    notes?: string;
}

export class CreateWorkoutTemplateDto {
    @IsString()
    @MaxLength(120)
    title!: string;

    @IsString()
    @MaxLength(40)
    type!: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => TemplateExerciseDto)
    exercises!: TemplateExerciseDto[];
}

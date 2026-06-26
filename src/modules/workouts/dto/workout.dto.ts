import { IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class CreateWorkoutDto {
    @IsDateString()
    date!: string;

    @IsString()
    title!: string;

    @IsOptional()
    @IsIn(["planned", "active", "completed"])
    status?: "planned" | "active" | "completed";

    @IsString()
    workoutType!: string;

    @IsOptional()
    @IsString()
    notes?: string;
}

export class UpdateWorkoutDto {
    @IsOptional()
    @IsDateString()
    date?: string;

    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    workoutType?: string;

    @IsOptional()
    @IsString()
    notes?: string;
}

export class AddWorkoutExerciseDto {
    @IsString()
    exerciseId!: string;

    @IsOptional()
    @IsNumber()
    order?: number;

    @IsOptional()
    @IsString()
    notes?: string;
}

export class UpdateWorkoutExerciseDto {
    @IsOptional()
    @IsNumber()
    order?: number;

    @IsOptional()
    @IsString()
    notes?: string;
}

export class CreateWorkoutSetDto {
    @IsIn(["warmup", "working", "drop", "failure", "backoff"])
    type!: "warmup" | "working" | "drop" | "failure" | "backoff";

    @IsNumber()
    @Min(0)
    weight!: number;

    @IsNumber()
    @Min(0)
    repetitions!: number;

    @IsOptional()
    @IsNumber()
    rpe?: number;

    @IsOptional()
    @IsNumber()
    restSeconds?: number;

    @IsOptional()
    @IsBoolean()
    isCompleted?: boolean;

    @IsOptional()
    @IsString()
    notes?: string;
}

export class UpdateWorkoutSetDto {
    @IsOptional()
    @IsIn(["warmup", "working", "drop", "failure", "backoff"])
    type?: "warmup" | "working" | "drop" | "failure" | "backoff";

    @IsOptional()
    @IsNumber()
    @Min(0)
    weight?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    repetitions?: number;

    @IsOptional()
    @IsNumber()
    rpe?: number;

    @IsOptional()
    @IsNumber()
    restSeconds?: number;

    @IsOptional()
    @IsBoolean()
    isCompleted?: boolean;

    @IsOptional()
    @IsString()
    notes?: string;
}

export class CreateCardioSessionDto {
    @IsString()
    type!: string;

    @IsNumber()
    @Min(0)
    durationMinutes!: number;

    @IsOptional()
    @IsNumber()
    distance?: number;

    @IsOptional()
    @IsNumber()
    calories?: number;

    @IsOptional()
    @IsNumber()
    averageHeartRate?: number;

    @IsOptional()
    @IsString()
    intensity?: string;

    @IsOptional()
    @IsString()
    notes?: string;
}

export class UpdateCardioSessionDto {
    @IsOptional()
    @IsString()
    type?: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    durationMinutes?: number;

    @IsOptional()
    @IsNumber()
    distance?: number;

    @IsOptional()
    @IsNumber()
    calories?: number;

    @IsOptional()
    @IsNumber()
    averageHeartRate?: number;

    @IsOptional()
    @IsString()
    intensity?: string;

    @IsOptional()
    @IsString()
    notes?: string;
}

export class ImportWorkoutExerciseDto extends AddWorkoutExerciseDto {
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateWorkoutSetDto)
    sets?: CreateWorkoutSetDto[];
}

export class SaveWorkoutDto {
    @IsDateString()
    date!: string;

    @IsString()
    title!: string;

    @IsIn(["planned", "active", "completed"])
    status!: "planned" | "active" | "completed";

    @IsString()
    workoutType!: string;

    @IsOptional()
    @IsString()
    notes?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ImportWorkoutExerciseDto)
    exercises?: ImportWorkoutExerciseDto[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateCardioSessionDto)
    cardioSessions?: CreateCardioSessionDto[];
}

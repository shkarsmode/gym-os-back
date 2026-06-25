export declare class CreateWorkoutDto {
    date: string;
    title: string;
    status?: "planned" | "active" | "completed";
    workoutType: string;
    notes?: string;
}
export declare class UpdateWorkoutDto {
    date?: string;
    title?: string;
    workoutType?: string;
    notes?: string;
}
export declare class AddWorkoutExerciseDto {
    exerciseId: string;
    order?: number;
    notes?: string;
}
export declare class UpdateWorkoutExerciseDto {
    order?: number;
    notes?: string;
}
export declare class CreateWorkoutSetDto {
    type: "warmup" | "working" | "drop" | "failure" | "backoff";
    weight: number;
    repetitions: number;
    rpe?: number;
    restSeconds?: number;
    isCompleted?: boolean;
    notes?: string;
}
export declare class UpdateWorkoutSetDto {
    type?: "warmup" | "working" | "drop" | "failure" | "backoff";
    weight?: number;
    repetitions?: number;
    rpe?: number;
    restSeconds?: number;
    isCompleted?: boolean;
    notes?: string;
}
export declare class CreateCardioSessionDto {
    type: string;
    durationMinutes: number;
    distance?: number;
    calories?: number;
    averageHeartRate?: number;
    intensity?: string;
    notes?: string;
}
export declare class UpdateCardioSessionDto {
    type?: string;
    durationMinutes?: number;
    distance?: number;
    calories?: number;
    averageHeartRate?: number;
    intensity?: string;
    notes?: string;
}
export declare class ImportWorkoutExerciseDto extends AddWorkoutExerciseDto {
    sets?: CreateWorkoutSetDto[];
}

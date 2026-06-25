export declare class CreateExerciseDto {
    name: string;
    aliases?: string[];
    primaryMuscleGroup: string;
    secondaryMuscleGroups?: string[];
    movementPattern: string;
    equipment: string;
    category: string;
    difficulty: string;
    description?: string;
    techniqueSteps?: string[];
    commonMistakes?: string[];
    safetyTips?: string[];
    mediaUrl?: string;
    mediaType?: string;
    isCustom?: boolean;
}
export declare class UpdateExerciseDto {
    name?: string;
    aliases?: string[];
    primaryMuscleGroup?: string;
    secondaryMuscleGroups?: string[];
    movementPattern?: string;
    equipment?: string;
    category?: string;
    difficulty?: string;
    description?: string;
    techniqueSteps?: string[];
    commonMistakes?: string[];
    safetyTips?: string[];
    mediaUrl?: string;
    mediaType?: string;
    isCustom?: boolean;
}

import { IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

// Sane upper bounds — block garbage/abuse without rejecting real data. Weight is
// capped generously (leg press / calf raise legitimately exceed 500kg) so no
// regressions; reps/rpe/rest/cardio get realistic ceilings.
const MAX_WEIGHT = 2000;
const MAX_REPS = 1000;
const MAX_RPE = 10;
const MAX_REST = 86400;
// A single timed set caps at 24h of hold time — same ceiling logic as rest.
const MAX_SET_DURATION = 86400;

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
    /** The client's own id for this exercise block. See CreateWorkoutSetDto.id. */
    @IsOptional()
    @IsString()
    id?: string;

    @IsString()
    exerciseId!: string;

    @IsOptional()
    @IsNumber()
    order?: number;

    @IsOptional()
    @IsString()
    notes?: string;

    /**
     * Membership of a superset declared in `supersetGroups`, or null for a plain block.
     *
     * Position inside the group (A1/A2/A3) is `order` — members are contiguous, so one
     * ordering field serves both the workout and the group and the two cannot disagree.
     */
    @IsOptional()
    @IsString()
    supersetGroupId?: string | null;
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
    /**
     * The client's own id for this set.
     *
     * Optional, and preserved verbatim when present. Until this existed the server
     * generated a fresh cuid for every set on EVERY save — saveFull deletes the tree and
     * recreates it — so no set had an identity that outlived a keystroke. That made a
     * per-set realtime event unaddressable and any merge impossible, because "this set"
     * could not be named. The client has always minted these ids locally; it simply never
     * sent them.
     */
    @IsOptional()
    @IsString()
    id?: string;

    @IsIn(["warmup", "working", "drop", "failure", "backoff"])
    type!: "warmup" | "working" | "drop" | "failure" | "backoff";

    @IsNumber()
    @Min(0)
    @Max(MAX_WEIGHT)
    weight!: number;

    @IsNumber()
    @Min(0)
    @Max(MAX_REPS)
    repetitions!: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(MAX_SET_DURATION)
    durationSeconds?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(MAX_RPE)
    rpe?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(MAX_REST)
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
    @Max(MAX_WEIGHT)
    weight?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(MAX_REPS)
    repetitions?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(MAX_SET_DURATION)
    durationSeconds?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(MAX_RPE)
    rpe?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(MAX_REST)
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

/**
 * Two or three exercises performed back to back with one rest after the whole round.
 *
 * Carries only the rest, because a ROUND IS THE Nth SET OF EACH MEMBER — rounds already
 * exist as sets, so nothing here duplicates weight, reps or completion.
 */
export class SupersetGroupDto {
    /** The client's own id, referenced by each member's `supersetGroupId`. */
    @IsString()
    id!: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(3600)
    restSeconds?: number;
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
    @IsNumber()
    @Min(0)
    @Max(1440)
    durationOverride?: number;

    // Gym-clock marks. Owned by the client — only it knows the instant a set was ticked.
    @IsOptional()
    @IsDateString()
    firstSetAt?: string;

    @IsOptional()
    @IsDateString()
    lastSetAt?: string;

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

    // Optimistic concurrency token: the `updatedAt` this client last saw for the row.
    //
    // saveFull is a destructive full replace — it deletes every set, exercise and cardio
    // session and recreates them from this payload. With two devices on one account that
    // makes the last writer win SILENTLY: the phone holding a copy from before the sets
    // ticked on the desktop re-creates the tree without them, and the work is gone with
    // no error anywhere. Sending the base version lets the server refuse instead.
    //
    // Optional on purpose. Older bundles omit it and keep the old last-writer-wins
    // behaviour rather than being hard-failed by forbidNonWhitelisted, and a genuinely
    // new workout has no base version to send.
    @IsOptional()
    @IsDateString()
    baseUpdatedAt?: string;

    // Acknowledges that replacing a non-empty workout with zero exercises is intended.
    // Without it saveFull answers 409 rather than erasing the sets. Must be declared
    // here: ValidationPipe runs with forbidNonWhitelisted, so an undeclared property
    // is a 400 rather than being ignored.
    @IsOptional()
    @IsBoolean()
    confirmEmpty?: boolean;

    // Declared groups. A member whose supersetGroupId names nothing here is saved as an
    // ordinary exercise rather than rejected — a payload that lost a group should cost
    // the grouping, not the training.
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SupersetGroupDto)
    supersetGroups?: SupersetGroupDto[];
}

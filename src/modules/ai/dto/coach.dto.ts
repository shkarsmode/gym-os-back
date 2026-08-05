import { IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { COACH_MAX_MESSAGE_LENGTH, COACH_MODES } from "../ai.constants";

export class CoachAnalyzeDto {
    // full = the flagship review, workout = "how was that session", weekly = digest.
    @IsOptional()
    @IsIn(COACH_MODES as unknown as string[])
    mode?: string;
}

export class CoachHistoryItemDto {
    @IsIn(["user", "coach"])
    role!: "user" | "coach";

    @IsString()
    @MaxLength(COACH_MAX_MESSAGE_LENGTH)
    text!: string;
}

export class CoachChatDto {
    @IsString()
    @MaxLength(COACH_MAX_MESSAGE_LENGTH)
    message!: string;

    // The thread lives on the client; only the tail is sent back for context, so
    // there is no server-side chat storage to leak or grow unbounded.
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CoachHistoryItemDto)
    history?: CoachHistoryItemDto[];
}

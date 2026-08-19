import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { COMMENT_MAX_LENGTH, FEED_MAX_PAGE_SIZE, FEED_SCOPES, FEED_TARGET_TYPES, REPORT_DETAILS_MAX_LENGTH, REPORT_REASONS } from "../feed.constants";

export class FeedQueryDto {
    @IsOptional()
    @IsIn(FEED_SCOPES as unknown as string[])
    scope?: string;

    @IsOptional()
    @IsString()
    cursor?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(FEED_MAX_PAGE_SIZE)
    limit?: number;
}

export class CommentDto {
    @IsString()
    @MaxLength(COMMENT_MAX_LENGTH)
    body!: string;

    // Present on a reply. The service collapses replies-to-replies onto the root, so
    // threads stay one level deep.
    @IsOptional()
    @IsString()
    parentId?: string;
}

export class EditCommentDto {
    @IsString()
    @MaxLength(COMMENT_MAX_LENGTH)
    body!: string;
}

export class ReportDto {
    @IsIn(FEED_TARGET_TYPES as unknown as string[])
    targetType!: string;

    @IsString()
    targetId!: string;

    @IsIn(REPORT_REASONS as unknown as string[])
    reason!: string;

    @IsOptional()
    @IsString()
    @MaxLength(REPORT_DETAILS_MAX_LENGTH)
    details?: string;
}

export class ResolveReportDto {
    @IsIn(["keep", "hide", "delete"])
    action!: string;
}

export class MarkReadDto {
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    ids?: string[];
}

export class PushSubscribeDto {
    @IsString()
    endpoint!: string;

    @IsString()
    p256dh!: string;

    @IsString()
    auth!: string;
}

export class PushUnsubscribeDto {
    @IsOptional()
    @IsString()
    endpoint?: string;
}

export class AchievementSyncItemDto {
    @IsString()
    @MaxLength(80)
    key!: string;

    @IsString()
    @MaxLength(120)
    title!: string;

    @IsOptional()
    @IsString()
    @MaxLength(300)
    description?: string;

    @IsOptional()
    @IsString()
    unlockedAt?: string;
}

export class AchievementSyncDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AchievementSyncItemDto)
    items!: AchievementSyncItemDto[];
}

export class RecordSyncItemDto {
    @IsString()
    @MaxLength(60)
    exerciseId!: string;

    @IsNumber()
    weightKg!: number;

    @IsOptional()
    @IsNumber()
    repetitions?: number;

    @IsOptional()
    @IsNumber()
    estimatedOneRepMax?: number;

    @IsOptional()
    @IsString()
    @MaxLength(60)
    workoutId?: string;

    @IsOptional()
    @IsBoolean()
    isEstimated?: boolean;

    // The session's timeline instant, so a record sits next to the workout that set it
    // rather than at midnight where it would tie with every achievement of that day.
    @IsOptional()
    @IsString()
    recordedAt?: string;
}

export class RecordSyncDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RecordSyncItemDto)
    items!: RecordSyncItemDto[];
}

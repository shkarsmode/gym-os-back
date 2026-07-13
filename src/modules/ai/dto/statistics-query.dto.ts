import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class StatisticsQueryDto {
    @IsOptional()
    @IsIn(["today", "7d", "30d", "all"])
    period?: "today" | "7d" | "30d" | "all";

    @IsOptional()
    @IsIn(["success", "error", "all"])
    status?: "success" | "error" | "all";

    @IsOptional()
    @IsString()
    @MaxLength(80)
    model?: string;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    userId?: string;
}

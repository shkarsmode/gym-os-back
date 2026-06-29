import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateFeedbackDto {
    @IsString()
    @IsIn(["feature", "fix", "improvement"])
    type!: "feature" | "fix" | "improvement";

    @IsString()
    @MinLength(2)
    @MaxLength(140)
    title!: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string;
}

export class UpdateFeedbackStatusDto {
    @IsString()
    @IsIn(["new", "planned", "in_progress", "done", "declined"])
    status!: "new" | "planned" | "in_progress" | "done" | "declined";
}

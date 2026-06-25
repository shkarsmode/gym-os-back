import { IsDateString, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class CreateBodyweightDto {
    @IsDateString()
    date!: string;

    @IsNumber()
    @Min(20)
    @Max(300)
    bodyweight!: number;

    @IsOptional()
    @IsString()
    notes?: string;
}

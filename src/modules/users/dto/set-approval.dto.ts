import { IsBoolean } from "class-validator";

export class SetApprovalDto {
    @IsBoolean()
    approved!: boolean;
}

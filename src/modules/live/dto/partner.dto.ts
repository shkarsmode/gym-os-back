import { IsString } from "class-validator";

export class InvitePartnerDto {
    @IsString()
    userId!: string;
}

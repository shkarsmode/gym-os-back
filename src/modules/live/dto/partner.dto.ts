import { IsBoolean, IsString } from "class-validator";

export class InvitePartnerDto {
    @IsString()
    userId!: string;
}

/**
 * One boolean, and the SERVER decides which column it lands in.
 *
 * A DTO carrying both flags would let either side of a session grant themselves access to
 * the other's workout with no consent from the person who owns it — and the global
 * ValidationPipe would not object, because both fields would be whitelisted by
 * definition. The caller says only "open mine" or "close mine".
 */
export class EditRightDto {
    @IsBoolean()
    allow!: boolean;
}

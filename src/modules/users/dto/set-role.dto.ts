import { IsString } from "class-validator";

export class SetRoleDto {
    @IsString()
    role!: string;
}

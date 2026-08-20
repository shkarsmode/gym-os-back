import { IsBoolean, IsString } from "class-validator";

export class SetPrivacyDto {
    @IsBoolean()
    hideWorkoutDetails!: boolean;
}

/**
 * No free-text field on purpose.
 *
 * A message attached to a request is an unsolicited note from someone you may not know,
 * delivered to your phone as a push — an abuse channel with no pre-emptive block. In a
 * gym where everybody knows each other a name is enough, and removing the field removes
 * the whole class of problem rather than policing it.
 */
export class CreateAccessRequestDto {
    @IsString()
    ownerId!: string;
}

import { IsObject, IsOptional } from "class-validator";

// Appearance / settings preferences are a free-form key→string map owned by the
// client (theme, accent, compactCards, defaultRest, defaultWorkoutType,
// defaultDuration, defaultSetType, autoStartRest …). We store the whole blob so
// adding a new client-side pref never needs a backend change. `whitelist` strips
// unknown TOP-LEVEL fields; the nested object is persisted verbatim.
export class UpdatePreferencesDto {
    @IsOptional()
    @IsObject()
    preferences?: Record<string, unknown>;
}

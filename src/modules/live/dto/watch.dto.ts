import { IsString } from "class-validator";

export class WatchDto {
    /** The connection to register, echoed from the stream's hello frame. */
    @IsString()
    token!: string;

    @IsString()
    workoutId!: string;
}

export class StopWatchDto {
    @IsString()
    token!: string;
}

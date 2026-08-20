import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Visibility } from "./visibility";

/**
 * May this caller read the detail behind one workout?
 *
 * ONE implementation, called by every path that needs the answer — the read route and
 * the live-watch registration. Two copies of this check would drift, and the drift would
 * be silent: the copy that is wrong simply lets somebody in.
 *
 * Deliberately resolves from a SCALAR read. Loading the exercise tree first and then
 * deciding not to send it would mean a private member's every repetition had already left
 * the database; the requirement is that it never does.
 *
 * Throws exactly what the read route throws, so a caller cannot tell the two apart — and
 * so registering to watch reveals nothing that fetching would not.
 */
export async function assertWorkoutReadable(
    prisma: PrismaService,
    workoutId: string,
    callerId: string,
    options: { isAdmin?: boolean; visibility?: Visibility; activePartnerId?: string | null } = {}
): Promise<{ userId: string; status: string }> {
    const workout = await prisma.workout.findUnique({
        where: { id: workoutId },
        select: { userId: true, status: true }
    });
    if (!workout) {
        throw new NotFoundException("Workout not found");
    }
    if (workout.userId === callerId || options.isAdmin) {
        return workout;
    }
    // Training together is consent to be watched — but only for the session you are both
    // in, and only while you are in it. Not a standing grant, and it does not reach their
    // history.
    const partnerViewing = workout.status === "active" && options.activePartnerId === workout.userId;
    if (!partnerViewing && options.visibility && !options.visibility.canSeeDetail(workout.userId)) {
        // 403 with a code rather than the 404 above: the caller is meant to see that this
        // session exists and be offered the chance to ask for access. Hiding its existence
        // would make the request button impossible to explain.
        throw new ForbiddenException({
            code: "WORKOUT_PRIVATE",
            ownerId: workout.userId,
            message: "This member keeps their workout details private."
        });
    }
    return workout;
}

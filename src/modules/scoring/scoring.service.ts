import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { loadScoringKernel } from "../../shared/scoring-kernel";
import { serializeWorkout } from "../../shared/serialize";

/**
 * Computes the whole gym's progression — XP, levels, personal records, achievements,
 * per-user and team stats — using the same kernel the browser runs.
 *
 * Compute-on-read rather than materialise-on-write, deliberately:
 *
 *   - Five achievements unlock on wall-clock alone, with no write to trigger on.
 *   - `exercise-liked` fires on someone ELSE's reaction; `idea-done` on an admin action.
 *   - likedExerciseUnlockDate is non-monotonic: un-liking an exercise legitimately
 *     revokes it, so a stored unlockedAt could need to move backwards.
 *
 * Stored values drift permanently; derived values cannot. With a gym this size the full
 * recompute is milliseconds, so there is nothing to buy by storing them. Revisit if the
 * timing logged below stops being trivial — not before.
 */
@Injectable()
export class ScoringService {
    private readonly logger = new Logger(ScoringService.name);

    constructor(private readonly prisma: PrismaService) {}

    async scoreEveryone() {
        const startedAt = Date.now();

        const [users, exercises, workouts, featureRequests] = await Promise.all([
            // createdAt ASC is load-bearing: teamStats.mostUsedExerciseId takes the first
            // non-null in user order, so a different order silently changes it.
            this.prisma.user.findMany({
                select: { id: true, displayName: true, createdAt: true },
                orderBy: { createdAt: "asc" }
            }),
            this.prisma.exercise.findMany({
                select: { id: true, name: true, primaryMuscleGroup: true, isCustom: true, createdByUserId: true, createdAt: true },
                orderBy: { name: "asc" }
            }),
            // date DESC is load-bearing: the kernel resolves tied 1RM records by visit
            // order, so ascending input moves PR dates. See serialize.ts.
            this.prisma.workout.findMany({
                include: {
                    exercises: { include: { sets: true }, orderBy: { order: "asc" } },
                    cardioSessions: true
                },
                orderBy: { date: "desc" }
            }),
            this.prisma.featureRequest.findMany({ orderBy: { createdAt: "desc" } }).catch(() => [])
        ]);

        // Like counts drive the exercise-liked badge. Degrades to zero rather than
        // failing the whole request if the table is not present.
        const likeCounts = new Map<string, number>();
        try {
            const grouped = await this.prisma.exerciseReaction.groupBy({
                by: ["exerciseId"],
                where: { type: "like" },
                _count: { _all: true }
            });
            for (const row of grouped) {
                likeCounts.set(row.exerciseId, row._count._all);
            }
        } catch (error) {
            this.logger.warn("exercise reactions unavailable; exercise-liked will not unlock");
        }

        const kernel = await loadScoringKernel();
        const result = kernel.scoreAll({
            users: users.map((user) => ({ id: user.id, createdAt: user.createdAt.toISOString() })),
            exercises: exercises.map((exercise) => ({
                id: exercise.id,
                name: exercise.name,
                primaryMuscleGroup: exercise.primaryMuscleGroup,
                isCustom: exercise.isCustom,
                createdByUserId: exercise.createdByUserId,
                createdAt: exercise.createdAt.toISOString(),
                likeCount: likeCounts.get(exercise.id) || 0
            })),
            workouts: workouts.map(serializeWorkout),
            featureRequests: (featureRequests as Array<{ id: string; userId: string; status: string; title: string; createdAt: Date; updatedAt: Date }>).map((item) => ({
                id: item.id,
                userId: item.userId,
                status: item.status,
                title: item.title,
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })),
            now: new Date()
        });

        const durationMs = Date.now() - startedAt;
        this.logger.log(JSON.stringify({
            metric: "scoring",
            users: users.length,
            workouts: workouts.length,
            ms: durationMs
        }));

        return { ...result, computedAt: new Date().toISOString(), durationMs };
    }
}

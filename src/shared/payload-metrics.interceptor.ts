import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { Request, Response } from "express";

/**
 * Measures the /export payload so the growth curve is observed rather than projected.
 *
 * Deliberately does NOT re-serialize the payload to size it: /export already builds a
 * multi-megabyte object graph inside a function with a 10s wall and a ~1GB heap, and a
 * second JSON.stringify purely for a metric is exactly the wrong thing to add there.
 * Byte size is read from Content-Length once the response is actually written.
 *
 * Counts are cheap array reads on the object already in memory — no allocation, one
 * O(workouts) pass to split own from peer.
 */
@Injectable()
export class PayloadMetricsInterceptor implements NestInterceptor {
    private readonly logger = new Logger("PayloadMetrics");

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const http = context.switchToHttp();
        const request = http.getRequest<Request & { user?: { id?: string } }>();
        const response = http.getResponse<Response>();
        const startedAt = Date.now();

        return next.handle().pipe(
            tap((payload) => {
                const durationMs = Date.now() - startedAt;
                const counts = countPayload(payload, request.user?.id);

                // Set before the body is written; Content-Length is not known yet, so
                // byte size is logged on "finish" below rather than returned as a header.
                if (!response.headersSent) {
                    response.setHeader("X-GymOS-Export-Ms", String(durationMs));
                    response.setHeader("X-GymOS-Own-Workouts", String(counts.ownWorkouts));
                    response.setHeader("X-GymOS-Peer-Workouts", String(counts.peerWorkouts));
                }

                response.on("finish", () => {
                    const headerValue = response.getHeader("content-length");
                    const bytes = Number(headerValue) || 0;

                    this.logger.log(JSON.stringify({
                        metric: "export",
                        userId: request.user?.id ?? null,
                        bytes,
                        ms: durationMs,
                        totalMs: Date.now() - startedAt,
                        ...counts
                    }));
                });
            })
        );
    }
}

function countPayload(payload: unknown, userId: string | undefined) {
    const empty = { users: 0, exercises: 0, bodyweightEntries: 0, ownWorkouts: 0, peerWorkouts: 0, ownSets: 0, peerSets: 0 };
    if (!payload || typeof payload !== "object") {
        return empty;
    }

    const body = payload as {
        users?: unknown[];
        exercises?: unknown[];
        bodyweightEntries?: unknown[];
        workouts?: Array<{ userId?: string; exercises?: Array<{ sets?: unknown[] }> }>;
    };

    const counts = {
        ...empty,
        users: body.users?.length ?? 0,
        exercises: body.exercises?.length ?? 0,
        bodyweightEntries: body.bodyweightEntries?.length ?? 0
    };

    for (const workout of body.workouts ?? []) {
        let sets = 0;
        for (const exercise of workout.exercises ?? []) {
            sets += exercise.sets?.length ?? 0;
        }

        if (userId && workout.userId === userId) {
            counts.ownWorkouts += 1;
            counts.ownSets += sets;
        } else {
            counts.peerWorkouts += 1;
            counts.peerSets += sets;
        }
    }

    return counts;
}

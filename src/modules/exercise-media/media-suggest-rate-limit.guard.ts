import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import {
    MEDIA_RATE_COOLDOWN_MS,
    MEDIA_RATE_DAILY_MAX,
    MEDIA_RATE_MAX_PER_WINDOW,
    MEDIA_RATE_WINDOW_MS
} from "./media.constants";

// Deliberately does NOT share state with AiRateLimitGuard, and this endpoint must never
// be moved under /ai or re-guarded with it. AiRateLimitGuard enforces a 4 s global
// cooldown across every /ai route for the same user, so reusing it would mean that
// asking for a GIF while creating an exercise silently locks the user out of the AI
// coach for four seconds. That coupling is invisible in the UI and impossible to debug
// from the frontend.
@Injectable()
export class MediaSuggestRateLimitGuard implements CanActivate {
    private readonly hits = new Map<string, number[]>();
    private readonly last = new Map<string, number>();
    private readonly daily = new Map<string, { day: number; count: number }>();

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const key = request.user?.id || request.ip || "anon";
        const now = Date.now();

        const sinceLast = now - (this.last.get(key) || 0);
        if (sinceLast < MEDIA_RATE_COOLDOWN_MS) {
            this.reject("Зачекай секунду перед наступним пошуком.", MEDIA_RATE_COOLDOWN_MS - sinceLast);
        }

        const stamps = (this.hits.get(key) || []).filter((stamp) => now - stamp < MEDIA_RATE_WINDOW_MS);
        if (stamps.length >= MEDIA_RATE_MAX_PER_WINDOW) {
            this.reject("Забагато запитів. Спробуй за хвилину.", MEDIA_RATE_WINDOW_MS - (now - stamps[0]));
        }

        const today = startOfDay(now);
        const day = this.daily.get(key);
        const count = day && day.day === today ? day.count : 0;
        if (count >= MEDIA_RATE_DAILY_MAX) {
            this.reject("Денний ліміт пошуку зображень вичерпано.", today + 86400000 - now);
        }

        stamps.push(now);
        this.hits.set(key, stamps);
        this.last.set(key, now);
        this.daily.set(key, { day: today, count: count + 1 });

        // Bound memory the same way AiRateLimitGuard does: a hard reset is acceptable
        // for a soft abuse guard, an unbounded map on a warm lambda is not.
        if (this.hits.size > 1000) {
            this.hits.clear();
            this.last.clear();
            this.daily.clear();
        }
        return true;
    }

    private reject(message: string, retryAfterMs: number): never {
        throw new HttpException(
            { code: "RATE_LIMIT", error: "RATE_LIMIT", message, retryAfterMs: Math.max(0, Math.round(retryAfterMs)) },
            HttpStatus.TOO_MANY_REQUESTS
        );
    }
}

function startOfDay(now: number): number {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}

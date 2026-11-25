export class RateLimiter {
    private readonly hits = new Map<string, number[]>();
    private lastPrune = 0;

    constructor(private readonly limit: number, private readonly windowMs: number) {}

    take(key: string, now = Date.now()): boolean {
        if (now - this.lastPrune > this.windowMs) {
            this.lastPrune = now;
            for (const [bucket, stamps] of this.hits) {
                const recent = stamps.filter((stamp) => now - stamp < this.windowMs);
                if (recent.length) {
                    this.hits.set(bucket, recent);
                } else {
                    this.hits.delete(bucket);
                }
            }
        }
        const recent = (this.hits.get(key) || []).filter((stamp) => now - stamp < this.windowMs);
        if (recent.length >= this.limit) {
            this.hits.set(key, recent);
            return false;
        }
        recent.push(now);
        this.hits.set(key, recent);
        return true;
    }

    retryAfterSeconds(key: string, now = Date.now()): number {
        const oldest = (this.hits.get(key) || [])[0];
        return oldest ? Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000)) : 1;
    }
}

export function clientIp(request: any): string {
    const forwarded = String(request?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
    return forwarded || request?.ip || request?.socket?.remoteAddress || "unknown";
}

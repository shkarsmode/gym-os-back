import { Injectable, Logger } from "@nestjs/common";
import {
    MEDIA_SENTINEL_URLS,
    MEDIA_VERIFY_BUDGET_MS,
    MEDIA_VERIFY_CACHE_MAX,
    MEDIA_VERIFY_CONCURRENCY,
    MEDIA_VERIFY_FAIL_TTL_MS,
    MEDIA_VERIFY_MIN_BYTES,
    MEDIA_VERIFY_OK_TTL_MS,
    MEDIA_VERIFY_TIMEOUT_MS
} from "./media.constants";
import { VerifiedMedia, VerifyBatchResult } from "./media.types";

interface CachedProbe {
    ok: boolean;
    value: VerifiedMedia | null;
    checkedAt: number;
}

const SENTINEL_URLS = new Set(MEDIA_SENTINEL_URLS);

// Gate B of the hallucination guard: 200 (or 206) plus an image/* content type plus a
// plausible size. A soft-404 page is text/html, so the content-type test alone kills the
// entire class of "the URL resolves but is not an image".
//
// Scope, precisely: no TIER 1 url (external, from the sitemap) ever reaches the client
// without passing through probe(). Tier 0 has one deliberate carve-out - when a whole
// batch fails to verify, meaning the network is down rather than the urls being bad,
// ExerciseMediaService may emit catalog urls that are already rendering in production,
// tagged verified: false / verifiedBy: "in_use". Those were still never invented or
// constructed, and Gate A (isAllowedMediaHost) still applies to them.
@Injectable()
export class MediaVerifierService {
    private readonly logger = new Logger(MediaVerifierService.name);
    private readonly cache = new Map<string, CachedProbe>();

    async probe(url: string): Promise<VerifiedMedia | null> {
        const cached = this.cache.get(url);
        if (cached && Date.now() - cached.checkedAt < (cached.ok ? MEDIA_VERIFY_OK_TTL_MS : MEDIA_VERIFY_FAIL_TTL_MS)) {
            return cached.ok ? cached.value : null;
        }

        // The site answers 200 with a generic placeholder image for any unknown slug, so
        // a plain status check would happily bless a URL for an exercise that does not
        // exist. Treat that exact file as a 404.
        if (SENTINEL_URLS.has(url)) {
            return this.remember(url, null);
        }

        let response = await this.fetchWithTimeout(url, "HEAD");
        if (response && (response.status === 405 || response.status === 501)) {
            // Some CDNs refuse HEAD outright; ask for the first KB instead.
            response = await this.fetchWithTimeout(url, "GET", { range: "bytes=0-1023" });
        }
        if (!response) {
            return this.remember(url, null);
        }
        if (response.status !== 200 && response.status !== 206) {
            return this.remember(url, null);
        }

        const contentType = (response.headers.get("content-type") || "").toLowerCase();
        if (!contentType.startsWith("image/")) {
            return this.remember(url, null);
        }

        const bytes = Number(response.headers.get("content-length") || 0);
        if (bytes > 0 && bytes < MEDIA_VERIFY_MIN_BYTES) {
            return this.remember(url, null);
        }

        // The content type is authoritative for gif-vs-photo, not the file extension: a
        // ".gif" URL that actually serves image/jpeg must be demoted to a photo.
        return this.remember(url, {
            url,
            contentType,
            bytes: Number.isFinite(bytes) && bytes > 0 ? bytes : 0,
            mediaType: contentType.startsWith("image/gif") ? "gif" : "image"
        });
    }

    // Semaphore-limited pool raced against the total budget. Slow is treated as failed:
    // a probe still in flight when the budget expires is simply absent from the result,
    // never included optimistically.
    async verifyAll(urls: string[]): Promise<VerifyBatchResult> {
        const verified = new Map<string, VerifiedMedia>();
        const unique = [...new Set(urls)];
        if (!unique.length) {
            return { verified, attempted: 0, completed: 0, timedOut: false };
        }

        let cursor = 0;
        let completed = 0;
        const worker = async () => {
            while (cursor < unique.length) {
                const url = unique[cursor];
                cursor += 1;
                const result = await this.probe(url);
                completed += 1;
                if (result) {
                    verified.set(result.url, result);
                }
            }
        };

        const workers = Array.from({ length: Math.min(MEDIA_VERIFY_CONCURRENCY, unique.length) }, () => worker());
        const budget = new Promise<"timeout">((resolve) => {
            setTimeout(() => resolve("timeout"), MEDIA_VERIFY_BUDGET_MS).unref?.();
        });

        const outcome = await Promise.race([Promise.allSettled(workers).then(() => "done" as const), budget]);
        if (outcome === "timeout") {
            this.logger.warn(`verification budget exhausted after ${completed}/${unique.length} probes`);
        }

        return { verified, attempted: unique.length, completed, timedOut: outcome === "timeout" };
    }

    private async fetchWithTimeout(
        url: string,
        method: "HEAD" | "GET",
        headers: Record<string, string> = {}
    ): Promise<Response | null> {
        try {
            return await fetch(url, {
                method,
                redirect: "follow",
                headers: { "user-agent": "GymOS-media-verify/1.0", accept: "image/*", ...headers },
                signal: AbortSignal.timeout(MEDIA_VERIFY_TIMEOUT_MS)
            });
        } catch {
            // Network error, DNS failure and timeout are all the same answer here: we
            // cannot prove this URL resolves, so it does not ship.
            return null;
        }
    }

    private remember(url: string, value: VerifiedMedia | null): VerifiedMedia | null {
        if (this.cache.has(url)) {
            this.cache.delete(url);
        }
        this.cache.set(url, { ok: Boolean(value), value, checkedAt: Date.now() });
        while (this.cache.size > MEDIA_VERIFY_CACHE_MAX) {
            const oldest = this.cache.keys().next();
            if (oldest.done) {
                break;
            }
            this.cache.delete(oldest.value);
        }
        return value;
    }
}

// Minimal TTL + LRU map. Module-scope caches live for the lifetime of a warm lambda
// instance, so they must be bounded: an unbounded Map keyed by user input is a slow
// memory leak that only shows up under real traffic.

interface CacheRecord<T> {
    value: T;
    storedAt: number;
}

export class TtlLruCache<T> {
    private readonly entries = new Map<string, CacheRecord<T>>();

    constructor(
        private readonly maxEntries: number,
        private readonly ttlMs: number
    ) {}

    get(key: string): T | null {
        const record = this.entries.get(key);
        if (!record) {
            return null;
        }
        if (Date.now() - record.storedAt > this.ttlMs) {
            this.entries.delete(key);
            return null;
        }
        // Re-insert so Map iteration order stays least-recently-used first.
        this.entries.delete(key);
        this.entries.set(key, record);
        return record.value;
    }

    set(key: string, value: T): void {
        if (this.entries.has(key)) {
            this.entries.delete(key);
        }
        this.entries.set(key, { value, storedAt: Date.now() });
        while (this.entries.size > this.maxEntries) {
            const oldest = this.entries.keys().next();
            if (oldest.done) {
                break;
            }
            this.entries.delete(oldest.value);
        }
    }

    get size(): number {
        return this.entries.size;
    }

    clear(): void {
        this.entries.clear();
    }
}

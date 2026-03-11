/**
 * Generic in-memory TTL cache with LRU-style eviction.
 *
 * When the cache reaches maxSize, the oldest entries (by insertion order)
 * are evicted one-at-a-time rather than clearing the entire cache,
 * avoiding thundering-herd database load spikes.
 *
 * A periodic sweep runs to remove expired entries.
 */
export class TTLCache<T> {
  private cache = new Map<string, {data: T; expiresAt: number}>();
  private readonly ttlMs: number;
  private readonly maxSize: number;

  constructor(opts: {ttlMs: number; maxSize: number; sweepIntervalMs?: number}) {
    this.ttlMs = opts.ttlMs;
    this.maxSize = opts.maxSize;

    setInterval(
      () => {
        const now = Date.now();
        for (const [key, entry] of this.cache) {
          if (entry.expiresAt <= now) this.cache.delete(key);
        }
      },
      opts.sweepIntervalMs ?? 5 * 60 * 1000
    ).unref();
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: T): void {
    // Evict oldest entries if at capacity (Map iterates in insertion order)
    while (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next();
      if (oldest.done) break;
      this.cache.delete(oldest.value);
    }
    // Delete first so re-insertion moves key to end (most recent)
    this.cache.delete(key);
    this.cache.set(key, {data, expiresAt: Date.now() + this.ttlMs});
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  /** Delete all entries whose key matches the predicate. */
  deleteWhere(predicate: (key: string) => boolean): void {
    for (const key of this.cache.keys()) {
      if (predicate(key)) this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

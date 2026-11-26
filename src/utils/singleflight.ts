/**
 * Deduplicates concurrent async operations sharing the same key.
 * Prevents thundering-herd requests to upstream servers on cache misses.
 */
export class Singleflight {
  private readonly inflight = new Map<string, Promise<unknown>>();

  /**
   * Executes `fn` for `key`, or returns the existing in-flight Promise
   * if another caller is already executing the same `key`.
   */
  async do<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) {
      return existing;
    }

    const promise = fn().finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, promise);
    return promise;
  }

  /** Number of currently active deduplicated operations. */
  get activeCount(): number {
    return this.inflight.size;
  }
}

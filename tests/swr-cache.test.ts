import { describe, expect, it, vi } from 'vitest';
import { SwrCache } from '../src/cache/sqlite-swr.js';
import { Singleflight } from '../src/utils/singleflight.js';

describe('Singleflight', () => {
  it('deduplicates concurrent calls for the same key', async () => {
    const sf = new Singleflight();
    let calls = 0;

    const fetcher = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 30));
      return { id: 1, title: 'Cowboy Bebop' };
    };

    const results = await Promise.all(Array.from({ length: 10 }, () => sf.do('anime:1', fetcher)));

    expect(calls).toBe(1);
    expect(results).toHaveLength(10);
    expect(results[0].title).toBe('Cowboy Bebop');
    expect(sf.activeCount).toBe(0);
  });
});

describe('SwrCache', () => {
  it('returns MISS -> HIT -> STALE and triggers background revalidation', async () => {
    const cache = new SwrCache({
      dbPath: ':memory:',
      freshTtlMs: 120,
      staleTtlMs: 2000,
    });

    let version = 1;
    const fetcher = vi.fn(async () => ({ version: version++ }));

    const first = await cache.getOrFetch('key:1', fetcher);
    expect(first.cacheStatus).toBe('MISS');
    expect(first.data.version).toBe(1);

    const second = await cache.getOrFetch('key:1', fetcher);
    expect(second.cacheStatus).toBe('HIT');
    expect(second.data.version).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Wait past freshTtlMs so entry becomes stale
    await new Promise((r) => setTimeout(r, 150));

    const third = await cache.getOrFetch('key:1', fetcher);
    expect(third.cacheStatus).toBe('STALE');
    expect(third.data.version).toBe(1);

    // Wait for background revalidation to finish (within freshTtlMs)
    await new Promise((r) => setTimeout(r, 25));

    const fourth = await cache.getOrFetch('key:1', fetcher);
    expect(fourth.cacheStatus).toBe('HIT');
    expect(fourth.data.version).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);

    cache.close();
  });
});

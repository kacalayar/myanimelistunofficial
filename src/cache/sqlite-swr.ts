import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { Singleflight } from '../utils/singleflight.js';

const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');

export type CacheStatus = 'HIT' | 'STALE' | 'MISS';

export interface SwrResult<T> {
  data: T;
  cacheStatus: CacheStatus;
  ageMs: number;
}

export interface CacheStats {
  totalEntries: number;
  hits: number;
  staleHits: number;
  misses: number;
  hitRate: number;
  revalidations: number;
  revalidationErrors: number;
}

export interface SwrCacheOptions {
  dbPath: string;
  freshTtlMs: number;
  staleTtlMs: number;
}

/**
 * Persistent SQLite-backed Stale-While-Revalidate (SWR) cache with Singleflight deduplication.
 * Serves stale entries immediately while refreshing in the background so user requests never block.
 */
export class SwrCache {
  private readonly db: DatabaseSyncType;
  private readonly singleflight = new Singleflight();
  private readonly freshTtlMs: number;
  private readonly staleTtlMs: number;

  private hits = 0;
  private staleHits = 0;
  private misses = 0;
  private revalidations = 0;
  private revalidationErrors = 0;

  constructor(options: SwrCacheOptions) {
    this.freshTtlMs = options.freshTtlMs;
    this.staleTtlMs = options.staleTtlMs;

    if (options.dbPath !== ':memory:') {
      mkdirSync(dirname(options.dbPath), { recursive: true });
    }

    this.db = new DatabaseSync(options.dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS cache_entries (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    overrides?: { freshTtlMs?: number; staleTtlMs?: number },
  ): Promise<SwrResult<T>> {
    const freshTtl = overrides?.freshTtlMs ?? this.freshTtlMs;
    const staleTtl = overrides?.staleTtlMs ?? this.staleTtlMs;
    const now = Date.now();

    const row = this.db
      .prepare('SELECT value, updated_at FROM cache_entries WHERE key = ?')
      .get(key) as { value: string; updated_at: number } | undefined;

    if (row) {
      const ageMs = now - row.updated_at;
      const parsed = JSON.parse(row.value) as T;

      if (ageMs <= freshTtl) {
        this.hits += 1;
        return { data: parsed, cacheStatus: 'HIT', ageMs };
      }

      if (ageMs <= staleTtl) {
        this.staleHits += 1;
        this.triggerBackgroundRevalidation(key, fetcher);
        return { data: parsed, cacheStatus: 'STALE', ageMs };
      }
    }

    this.misses += 1;
    const data = await this.singleflight.do(key, async () => {
      const fresh = await fetcher();
      this.set(key, fresh);
      return fresh;
    });

    return { data, cacheStatus: 'MISS', ageMs: 0 };
  }

  private triggerBackgroundRevalidation<T>(key: string, fetcher: () => Promise<T>): void {
    this.revalidations += 1;
    void this.singleflight
      .do(key, async () => {
        const fresh = await fetcher();
        this.set(key, fresh);
        return fresh;
      })
      .catch(() => {
        this.revalidationErrors += 1;
      });
  }

  set<T>(key: string, value: T): void {
    const now = Date.now();
    const serialized = JSON.stringify(value);
    this.db
      .prepare(
        `INSERT INTO cache_entries (key, value, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`,
      )
      .run(key, serialized, now, now);
  }

  getStats(): CacheStats {
    const countRow = this.db
      .prepare('SELECT COUNT(*) as total FROM cache_entries')
      .get() as { total: number };
    const totalRequests = this.hits + this.staleHits + this.misses;
    const hitRate = totalRequests > 0 ? Number((((this.hits + this.staleHits) / totalRequests) * 100).toFixed(2)) : 0;

    return {
      totalEntries: countRow.total,
      hits: this.hits,
      staleHits: this.staleHits,
      misses: this.misses,
      hitRate,
      revalidations: this.revalidations,
      revalidationErrors: this.revalidationErrors,
    };
  }

  clear(): void {
    this.db.exec('DELETE FROM cache_entries');
  }

  close(): void {
    this.db.close();
  }
}

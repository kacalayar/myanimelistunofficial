import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads key=value pairs from a local .env file into process.env
 * if they are not already set in the environment.
 */
function loadDotEnv(filePath = '.env'): void {
  const fullPath = resolve(process.cwd(), filePath);
  if (!existsSync(fullPath)) return;

  const content = readFileSync(fullPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface AppConfig {
  port: number;
  host: string;
  malClientId: string | null;
  cacheDbPath: string;
  cacheFreshTtlMs: number;
  cacheStaleTtlMs: number;
  upstreamConcurrency: number;
  upstreamMinIntervalMs: number;
  upstreamTimeoutMs: number;
}

export function loadConfig(): AppConfig {
  const rawClientId = process.env.MAL_CLIENT_ID?.trim() ?? '';
  return {
    port: parsePositiveInt(process.env.PORT, 3000),
    host: process.env.HOST?.trim() || '0.0.0.0',
    malClientId: rawClientId.length > 0 ? rawClientId : null,
    cacheDbPath: process.env.CACHE_DB_PATH?.trim() || './data/cache.db',
    cacheFreshTtlMs: parsePositiveInt(process.env.CACHE_FRESH_TTL_MS, 6 * 60 * 60 * 1000),
    cacheStaleTtlMs: parsePositiveInt(process.env.CACHE_STALE_TTL_MS, 7 * 24 * 60 * 60 * 1000),
    upstreamConcurrency: parsePositiveInt(process.env.UPSTREAM_CONCURRENCY, 2),
    upstreamMinIntervalMs: parsePositiveInt(process.env.UPSTREAM_MIN_INTERVAL_MS, 350),
    upstreamTimeoutMs: parsePositiveInt(process.env.UPSTREAM_TIMEOUT_MS, 10_000),
  };
}

export const config: AppConfig = loadConfig();

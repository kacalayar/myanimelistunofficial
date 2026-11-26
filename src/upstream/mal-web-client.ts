import { RateLimitedQueue, UpstreamError, withTimeoutAndRetry } from './rate-queue.js';

export const MAL_WEB_BASE = 'https://myanimelist.net';

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export function parseNumeric(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function extractIdFromUrl(href: string | undefined, segment: string): number | null {
  if (!href) return null;
  const match = href.match(new RegExp(`/${segment}/(\\d+)`));
  return match ? Number.parseInt(match[1], 10) : null;
}

export function toAbsoluteMalUrl(href: string | undefined): string {
  if (!href) return MAL_WEB_BASE;
  return href.startsWith('http') ? href : `${MAL_WEB_BASE}${href.startsWith('/') ? '' : '/'}${href}`;
}

/**
 * Shared rate-limited HTTP client for fetching MyAnimeList web pages & JSON endpoints.
 */
export class MalWebClient {
  constructor(
    private readonly queue: RateLimitedQueue,
    private readonly timeoutMs: number,
  ) {}

  async fetchHtml(path: string): Promise<string> {
    const url = path.startsWith('http') ? path : `${MAL_WEB_BASE}${path}`;
    return this.queue.enqueue(() =>
      withTimeoutAndRetry(
        async (signal) => {
          const response = await fetch(url, { signal, headers: DEFAULT_HEADERS });
          if (!response.ok) {
            const retryable = response.status === 429 || response.status >= 500;
            throw new UpstreamError(
              `MAL web page returned ${response.status} for ${path}`,
              response.status,
              retryable,
            );
          }
          return response.text();
        },
        { timeoutMs: this.timeoutMs },
      ),
    );
  }

  /** Fetches HTML and returns the final redirected URL alongside the body (used for /random/*). */
  async fetchWithFinalUrl(path: string): Promise<{ url: string; html: string }> {
    const url = path.startsWith('http') ? path : `${MAL_WEB_BASE}${path}`;
    return this.queue.enqueue(() =>
      withTimeoutAndRetry(
        async (signal) => {
          const response = await fetch(url, {
            signal,
            headers: DEFAULT_HEADERS,
            redirect: 'follow',
          });
          if (!response.ok) {
            const retryable = response.status === 429 || response.status >= 500;
            throw new UpstreamError(
              `MAL web page returned ${response.status} for ${path}`,
              response.status,
              retryable,
            );
          }
          return { url: response.url, html: await response.text() };
        },
        { timeoutMs: this.timeoutMs },
      ),
    );
  }
}

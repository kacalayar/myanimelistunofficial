export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

interface QueueItem<T> {
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

/**
 * Concurrency- and interval-limited queue for upstream MyAnimeList requests.
 * Protects against IP bans and rate-limit bursts.
 */
export class RateLimitedQueue {
  private readonly queue: QueueItem<unknown>[] = [];
  private activeCount = 0;
  private lastStartMs = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly concurrency: number = 2,
    private readonly minIntervalMs: number = 350,
  ) {}

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        task: task as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.drain();
    });
  }

  private drain(): void {
    if (this.activeCount >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const now = Date.now();
    const waitMs = Math.max(0, this.lastStartMs + this.minIntervalMs - now);

    if (waitMs > 0) {
      if (!this.timer) {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.drain();
        }, waitMs);
      }
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.activeCount += 1;
    this.lastStartMs = Date.now();

    item
      .task()
      .then(item.resolve)
      .catch(item.reject)
      .finally(() => {
        this.activeCount -= 1;
        this.drain();
      });

    if (this.activeCount < this.concurrency && this.queue.length > 0) {
      this.drain();
    }
  }

  get pendingCount(): number {
    return this.queue.length;
  }
}

/**
 * Runs an async fetch function with an AbortSignal timeout and exponential backoff retries
 * for transient errors (429, 5xx, network/timeout errors).
 */
export async function withTimeoutAndRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: { timeoutMs: number; retries?: number; baseDelayMs?: number },
): Promise<T> {
  const maxRetries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 500;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      return await fn(controller.signal);
    } catch (error) {
      lastError = error;
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const isRetryableUpstream = error instanceof UpstreamError && error.retryable;
      const isNetworkError = !(error instanceof UpstreamError);

      if (attempt === maxRetries || (!isAbort && !isRetryableUpstream && !isNetworkError)) {
        throw error;
      }

      const delay = baseDelayMs * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError;
}

import { DriveError } from "./driveClient";

export interface RetryOptions {
  /** Total tries, including the first. */
  attempts?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** Google's "slow down" answers: rate limits (403/429) and transient server errors. */
export function isRetryable(error: unknown): boolean {
  return error instanceof DriveError && [403, 429, 500, 502, 503, 504].includes(error.status);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/** Runs `fn`, retrying retryable errors with exponential backoff (1×, 2×, 4× … the base delay). */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { attempts = 4, baseDelayMs = 1000, signal, sleep: wait = sleep } = opts;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts || !isRetryable(error) || signal?.aborted) throw error;
      await wait(baseDelayMs * 2 ** (attempt - 1), signal);
    }
  }
}

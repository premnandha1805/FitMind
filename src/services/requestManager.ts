import { CacheCategory, getCached, setCached, setCachedWithTtl } from './cacheEngine';
import { checkRateLimit, cleanupRequestLog, logRequest, resetDailyCounter } from './rateLimit';

type ManagedOptions<T> = {
  skipCache?: boolean;
  skipRateLimit?: boolean;
  fallbackFn?: () => T | Promise<T>;
  ttlMs?: number;
  ttlDays?: number;
  category?: CacheCategory;
  retries?: number;
};

const IN_FLIGHT = new Map<string, Promise<unknown>>();
let queueTail: Promise<unknown> = Promise.resolve();

export const requestLog: Array<{ key: string; time: number; cacheHit: boolean }> = [];

export async function initializeRequestManager(): Promise<void> {
  await cleanupRequestLog();
}

export { resetDailyCounter };

export function getCacheHitRate(): number {
  if (!requestLog.length) return 0;
  return (requestLog.filter((r) => r.cacheHit).length / requestLog.length) * 100;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();
  return lower.includes('429')
    || lower.includes('rate')
    || lower.includes('quota')
    || lower.includes('timeout')
    || lower.includes('network')
    || lower.includes('temporarily')
    || lower.includes('503')
    || lower.includes('502');
}

async function runQueued<T>(fn: () => Promise<T>): Promise<T> {
  const previous = queueTail.catch(() => undefined);
  let release: () => void = () => undefined;
  queueTail = new Promise((resolve) => { release = () => resolve(undefined); });

  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

async function runWithRetry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isRetriableError(error)) break;
      const backoffMs = Math.min(12000, 800 * (2 ** attempt)) + Math.floor(Math.random() * 250);
      await sleep(backoffMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'Request failed'));
}

function normalizeOptions<T>(
  categoryOrTtlMs: CacheCategory | number,
  optionsOrTtlDays: ManagedOptions<T> | number
): { category: CacheCategory; options: ManagedOptions<T>; ttlMsOverride?: number; ttlDaysOverride?: number } {
  const ttlMsOverride = typeof categoryOrTtlMs === 'number' ? categoryOrTtlMs : undefined;
  const ttlDaysOverride = typeof optionsOrTtlDays === 'number' ? optionsOrTtlDays : undefined;
  const options = typeof optionsOrTtlDays === 'number' ? {} : optionsOrTtlDays;
  const category = options.category ?? (typeof categoryOrTtlMs === 'number' ? CacheCategory.OUTFIT_VAL : categoryOrTtlMs);
  return { category, options, ttlMsOverride, ttlDaysOverride };
}

export async function managedRequest<T>(
  cacheKey: string,
  requestFn: () => Promise<T>,
  categoryOrTtlMs: CacheCategory | number,
  optionsOrTtlDays: ManagedOptions<T> | number = {}
): Promise<T> {
  const { category, options, ttlMsOverride, ttlDaysOverride } = normalizeOptions<T>(categoryOrTtlMs, optionsOrTtlDays);
  const start = Date.now();

  if (!options.skipCache) {
    const cached = await getCached(cacheKey);
    if (cached !== null) {
      requestLog.push({ key: cacheKey, time: Date.now(), cacheHit: true });
      return cached as T;
    }
  }

  const active = IN_FLIGHT.get(cacheKey);
  if (active) {
    return active as Promise<T>;
  }

  const promise = runQueued(async () => {
    if (!options.skipRateLimit) {
      const status = await checkRateLimit('gemini');
      if (!status.allowed) {
        await logRequest('gemini', 'fallback', 0, false, 'RATE_LIMIT');
        if (options.fallbackFn) return options.fallbackFn();
        throw new Error(`RATE_LIMIT:${status.waitMs}`);
      }
      if (status.waitMs > 0) {
        await sleep(status.waitMs);
      }
    }

    try {
      const result = await runWithRetry(requestFn, options.retries ?? 2);
      requestLog.push({ key: cacheKey, time: Date.now(), cacheHit: false });

      const ttlMs = options.ttlMs ?? ttlMsOverride;
      const ttlDays = options.ttlDays ?? ttlDaysOverride ?? 0;
      if (typeof ttlMs === 'number' || typeof ttlDays === 'number') {
        await setCachedWithTtl(cacheKey, result, ttlMs ?? 0, ttlDays ?? 0, category);
      } else {
        await setCached(cacheKey, result, category);
      }

      await logRequest('gemini', 'api', Date.now() - start, true);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? 'UNKNOWN');
      await logRequest('gemini', 'api', Date.now() - start, false, message.substring(0, 50));
      if (options.fallbackFn) {
        const fallback = await options.fallbackFn();
        await logRequest('gemini', 'fallback', 0, true);
        return fallback;
      }
      throw error;
    }
  }).finally(() => {
    IN_FLIGHT.delete(cacheKey);
  });

  IN_FLIGHT.set(cacheKey, promise);
  return promise as Promise<T>;
}

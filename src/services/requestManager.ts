import { getCached, setDB, setMemory } from './cacheEngine';

// Rate limiting: stay within Gemini free tier (15 req/min)
const MIN_MS = 4500; // minimum ms between requests (1 / 4.5s ≈ 13/min, safe under 15)
const MAX_PER_MIN = 12; // hard cap per rolling 60-second window
let lastRequestAt = 0;
const callTimestamps: number[] = [];

const inFlightRequests = new Map<string, Promise<any>>();

export interface RequestLogEntry {
  key: string;
  time: number;
  cacheHit: boolean;
}

export const requestLog: RequestLogEntry[] = [];

function logRequest(entry: RequestLogEntry): void {
  requestLog.push(entry);
  if (requestLog.length > 500) {
    requestLog.splice(0, requestLog.length - 500);
  }
}

export function getCacheHitRate(): number {
  if (!requestLog.length) return 0;
  const hits = requestLog.filter((x) => x.cacheHit).length;
  return (hits / requestLog.length) * 100;
}

export function getCallsThisMinute(): number {
  const now = Date.now();
  return callTimestamps.filter((t) => now - t < 60000).length;
}

export async function managedRequest<T>(
  key: string,
  request: () => Promise<T>,
  ttlMs: number,
  ttlDays: number
): Promise<T> {
  // Tier 1 + Tier 2 cache check
  const cached = await getCached(key);
  if (cached !== null) {
    logRequest({ key, time: Date.now(), cacheHit: true });
    console.log(`[Request] Cache hit: ${key.slice(0, 16)}`);
    return cached as T;
  }

  // In-flight deduplication — share an ongoing request for the same key
  const pending = inFlightRequests.get(key);
  if (pending) {
    logRequest({ key, time: Date.now(), cacheHit: true });
    console.log(`[Request] Shared in-flight: ${key.slice(0, 16)}`);
    return pending as Promise<T>;
  }

  // Rate limit: rolling 60-second window cap
  const recentCalls = callTimestamps.filter((t) => Date.now() - t < 60000).length;
  if (recentCalls >= MAX_PER_MIN) {
    throw new Error('RATE_LIMIT_PROTECTION: Too many requests. Please wait a moment and retry.');
  }

  // Rate limit: minimum spacing between requests
  const gap = MIN_MS - (Date.now() - lastRequestAt);
  if (gap > 0) {
    console.log(`[Request] Rate throttle: waiting ${gap}ms`);
    await new Promise<void>((resolve) => setTimeout(resolve, gap));
  }

  const runner = (async () => {
    logRequest({ key, time: Date.now(), cacheHit: false });
    const data = await request();
    setMemory(key, data, ttlMs);
    await setDB(key, data, ttlDays);
    return data;
  })();

  inFlightRequests.set(key, runner);

  try {
    const result = await runner;
    // Record successful call timestamps for rate limiting
    lastRequestAt = Date.now();
    callTimestamps.push(lastRequestAt);
    // Keep only last 100 entries to avoid unbounded growth
    if (callTimestamps.length > 100) {
      callTimestamps.splice(0, callTimestamps.length - 100);
    }
    return result;
  } finally {
    inFlightRequests.delete(key);
  }
}

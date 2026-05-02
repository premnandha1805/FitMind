import { CacheCategory, getCached, setCached } from './cacheEngine';
import { checkRateLimit, logRequest } from './rateLimit';
const IN_FLIGHT = new Map<string, Promise<any>>();
export const requestLog: Array<{ key: string; time: number; cacheHit: boolean }> = [];
export function getCacheHitRate(): number { if (!requestLog.length) return 0; return (requestLog.filter((r) => r.cacheHit).length / requestLog.length) * 100; }
export async function managedRequest<T>(cacheKey: string, requestFn: () => Promise<T>, categoryOrTtlMs: CacheCategory | number, optionsOrTtlDays: { skipCache?: boolean; skipRateLimit?: boolean; fallbackFn?: () => T } | number = {}): Promise<T> {
  const category = typeof categoryOrTtlMs === 'number' ? CacheCategory.OUTFIT_VAL : categoryOrTtlMs;
  const options = typeof optionsOrTtlDays === 'number' ? {} : optionsOrTtlDays;
  const start = Date.now();
  if (!options.skipCache) { const cached = await getCached(cacheKey); if (cached !== null) { requestLog.push({ key: cacheKey, time: Date.now(), cacheHit: true }); return cached as T; } }
  if (IN_FLIGHT.has(cacheKey)) return IN_FLIGHT.get(cacheKey) as Promise<T>;
  if (!options.skipRateLimit) { const status = await checkRateLimit('gemini'); if (!status.allowed) { await logRequest('gemini', 'fallback', 0, false, 'RATE_LIMIT'); if (options.fallbackFn) return options.fallbackFn(); throw new Error(`RATE_LIMIT:${status.waitMs}`); } if (status.waitMs > 0) await new Promise(r => setTimeout(r, status.waitMs)); }
  const promise = requestFn().then(async (result) => { requestLog.push({ key: cacheKey, time: Date.now(), cacheHit: false }); await setCached(cacheKey, result, category); await logRequest('gemini', 'api', Date.now() - start, true); return result; }).catch(async (error: Error) => { await logRequest('gemini', 'api', Date.now() - start, false, error.message?.substring(0, 50)); throw error; }).finally(() => { IN_FLIGHT.delete(cacheKey); });
  IN_FLIGHT.set(cacheKey, promise);
  try { return await promise; } catch (error) { if (options.fallbackFn) { await logRequest('gemini', 'fallback', 0, true); return options.fallbackFn(); } throw error; }
}

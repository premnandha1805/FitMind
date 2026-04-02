import { executeSqlWithRetry, getOne } from '../db/queries';

const memoryCache = new Map<string, { data: any; expires: number }>();

const DAY_MS = 24 * 60 * 60 * 1000;

export function setMemory(key: string, data: any, ttlMs: number): void {
  memoryCache.set(key, { data, expires: Date.now() + ttlMs });
}

export function getMemory(key: string): any | null {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expires) {
    memoryCache.delete(key);
    return null;
  }
  return item.data;
}

export async function setDB(key: string, data: any, ttlDays: number): Promise<void> {
  const now = Date.now();
  const expiresAt = now + Math.max(1, ttlDays) * DAY_MS;
  const value = JSON.stringify(data);

  await executeSqlWithRetry(
    `INSERT OR REPLACE INTO api_cache (key, value, created_at, expires_at)
     VALUES (?, ?, ?, ?);`,
    [key, value, now, expiresAt]
  );
}

export async function getDB(key: string): Promise<any | null> {
  const now = Date.now();
  const row = await getOne<{ value: string; expires_at: number }>(
    `SELECT value, expires_at FROM api_cache
     WHERE key = ? AND expires_at > ?;`,
    [key, now]
  );

  if (!row) {
    return null;
  }

  try {
    const parsed = JSON.parse(row.value) as any;
    const ttlMs = row.expires_at - now;
    if (ttlMs > 0) {
      setMemory(key, parsed, ttlMs);
    }
    return parsed;
  } catch {
    await executeSqlWithRetry('DELETE FROM api_cache WHERE key = ?;', [key]);
    return null;
  }
}

export async function getCached(key: string): Promise<any | null> {
  return getMemory(key) || await getDB(key) || null;
}

/** Convenience: write to both memory + SQLite in one call. */
export async function setCached(
  key: string,
  data: any,
  ttlMs: number,
  ttlDays: number
): Promise<void> {
  setMemory(key, data, ttlMs);
  await setDB(key, data, ttlDays);
}

export async function cleanExpiredCache(): Promise<void> {
  await executeSqlWithRetry('DELETE FROM api_cache WHERE expires_at < ?;', [Date.now()]);
}

/** Alias kept for compatibility with PRD naming. */
export const cleanCache = cleanExpiredCache;

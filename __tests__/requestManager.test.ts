jest.mock('../src/services/cacheEngine', () => {
  const mem = new Map<string, unknown>();
  return {
    CacheCategory: { OUTFIT_VAL: 'outfit_validation' },
    getCached: jest.fn(async (key: string) => mem.get(key) ?? null),
    setCached: jest.fn(async (key: string, value: unknown) => { mem.set(key, value); }),
    setCachedWithTtl: jest.fn(async (key: string, value: unknown) => { mem.set(key, value); }),
  };
});

jest.mock('../src/services/rateLimit', () => ({
  checkRateLimit: jest.fn(async () => ({
    allowed: true,
    reason: 'OK',
    waitMs: 0,
    remaining: { perMin: 4, perHour: 24, perDay: 50 },
    resetAt: { perMin: '', perHour: '', perDay: '' },
  })),
  cleanupRequestLog: jest.fn(async () => undefined),
  logRequest: jest.fn(async () => undefined),
  resetDailyCounter: jest.fn(async () => undefined),
}));

describe('requestManager', () => {
  test('managedRequest deduplicates concurrent calls for same key', async () => {
    const { managedRequest } = await import('../src/services/requestManager');
    let calls = 0;
    const fn = jest.fn(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { calls };
    });

    const [a, b] = await Promise.all([
      managedRequest('same-key', fn, 'outfit_validation' as any),
      managedRequest('same-key', fn, 'outfit_validation' as any),
    ]);

    expect(a).toEqual({ calls: 1 });
    expect(b).toEqual({ calls: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('managedRequest retries retriable failures', async () => {
    const { managedRequest } = await import('../src/services/requestManager');
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce('ok');

    await expect(managedRequest('retry-key', fn, 'outfit_validation' as any, { retries: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

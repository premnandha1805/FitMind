import { localFitCheck, withFallback } from '../src/services/fallbackEngine';

describe('fallbackEngine', () => {
  test('withFallback returns primary when it succeeds', async () => {
    await expect(withFallback(async () => 'primary', async () => 'fallback1', () => 'fallback2')).resolves.toBe('primary');
  });

  test('withFallback tries fallback1 after recoverable primary failure', async () => {
    await expect(withFallback(async () => { throw new Error('network'); }, async () => 'fallback1', () => 'fallback2')).resolves.toBe('fallback1');
  });

  test('withFallback jumps to local fallback on hard quota', async () => {
    await expect(withFallback(async () => { throw new Error('quota exceeded limit:0'); }, async () => 'fallback1', () => 'fallback2')).resolves.toBe('fallback2');
  });

  test('localFitCheck returns complete fit check shape', () => {
    const result = localFitCheck([], 3, 'Warm');
    expect(result.style_score).toBeGreaterThanOrEqual(1);
    expect(result.skin_tone_match.reason).toBeTruthy();
    expect(result.color_harmony.reason).toBeTruthy();
    expect(result.styling_tips.length).toBeGreaterThan(0);
  });
});

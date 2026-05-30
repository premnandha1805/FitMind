import { trackError, trackMetric } from '../services/observability';

export async function safeAsync<T>(
  fn: () => Promise<T>,
  context: string
): Promise<{ data: T | null; error: string | null }> {
  const start = Date.now();
  try {
    const data = await fn();
    trackMetric('async.success', Date.now() - start, { context });
    return { data, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    trackError('async.error', err, { context, durationMs: Date.now() - start });
    if (__DEV__) {
      console.error(`[${context}] ${message}`);
    }
    return { data: null, error: message };
  }
}

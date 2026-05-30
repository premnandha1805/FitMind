import { getRecentEvents, logEvent, trackError, trackMetric } from '../src/services/observability';

describe('observability', () => {
  test('records structured events, metrics, and errors', () => {
    const before = getRecentEvents().length;
    logEvent('info', 'test.event', { ok: true });
    trackMetric('latency', 123, { route: 'home' });
    trackError('failure', new Error('boom'), { area: 'test' });

    const after = getRecentEvents().slice(before);
    expect(after.map((event) => event.name)).toEqual(['test.event', 'metric.latency', 'failure']);
    expect(after[2].payload?.message).toBe('boom');
  });
});

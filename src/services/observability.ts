type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface EventPayload {
  [key: string]: unknown;
}

interface LogEvent {
  level: LogLevel;
  name: string;
  timestamp: string;
  payload?: EventPayload;
}

const recentEvents: LogEvent[] = [];
const MAX_EVENTS = 200;

function emit(event: LogEvent): void {
  recentEvents.push(event);
  if (recentEvents.length > MAX_EVENTS) {
    recentEvents.shift();
  }

  if (!__DEV__) return;
  const prefix = `[FitMind:${event.level}] ${event.name}`;
  if (event.level === 'error') console.error(prefix, event.payload ?? {});
  else if (event.level === 'warn') console.warn(prefix, event.payload ?? {});
  else console.info(prefix, event.payload ?? {});
}

export function logEvent(level: LogLevel, name: string, payload?: EventPayload): void {
  emit({ level, name, timestamp: new Date().toISOString(), payload });
}

export function trackMetric(name: string, value: number, payload?: EventPayload): void {
  logEvent('info', `metric.${name}`, { value, ...payload });
}

export function trackError(name: string, error: unknown, payload?: EventPayload): void {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  logEvent('error', name, { message, ...payload });
}

export function getRecentEvents(): LogEvent[] {
  return [...recentEvents];
}

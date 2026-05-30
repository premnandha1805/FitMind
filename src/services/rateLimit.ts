import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('fitmind.db');
const MAX_DAILY_CALLS = 50;
const LIMITS = {
	gemini_per_minute: 4,
	gemini_per_hour: 24,
	gemini_per_day: MAX_DAILY_CALLS,
	min_interval_ms: 6500,
};
const LOCAL_DAY_FILTER = "DATE(datetime(timestamp, 'unixepoch', 'localtime')) = DATE('now', 'localtime')";
let lastRequestTime = 0;

export interface RateLimitStatus {
	allowed: boolean;
	reason: string;
	waitMs: number;
	remaining: { perMin: number; perHour: number; perDay: number };
	resetAt: { perMin: string; perHour: string; perDay: string };
}

export async function cleanupRequestLog(): Promise<void> {
	await db.runAsync(
		"DELETE FROM request_log WHERE datetime(timestamp, 'unixepoch', 'localtime') < datetime('now', '-2 days', 'localtime')",
	);
}

export async function resetDailyCounter(): Promise<void> {
	await db.runAsync(`DELETE FROM request_log WHERE ${LOCAL_DAY_FILTER}`);
}

export async function checkRateLimit(type = 'gemini'): Promise<RateLimitStatus> {
	const now = Date.now();
	const nowSec = Math.floor(now / 1000);
	const perMin = await db.getFirstAsync<{ count: number }>(
		`SELECT COUNT(*) as count FROM request_log WHERE timestamp > ? AND request_type = ? AND source = 'api'`,
		[nowSec - 60, type],
	);
	const perHour = await db.getFirstAsync<{ count: number }>(
		`SELECT COUNT(*) as count FROM request_log WHERE timestamp > ? AND request_type = ? AND source = 'api'`,
		[nowSec - 3600, type],
	);
	const perDay = await db.getFirstAsync<{ count: number }>(
		`SELECT COUNT(*) as count FROM request_log WHERE ${LOCAL_DAY_FILTER} AND request_type = ? AND source = 'api'`,
		[type],
	);

	const cntMin = perMin?.count || 0;
	const cntHour = perHour?.count || 0;
	const cntDay = perDay?.count || 0;
	const remaining = {
		perMin: LIMITS.gemini_per_minute - cntMin,
		perHour: LIMITS.gemini_per_hour - cntHour,
		perDay: LIMITS.gemini_per_day - cntDay,
	};
	const waitMs = Math.max(0, LIMITS.min_interval_ms - (now - lastRequestTime));
	const lastCallAgoSec = lastRequestTime ? Math.round((now - lastRequestTime) / 1000) : -1;
	console.log(`Rate check: ${cntDay} calls today, limit ${LIMITS.gemini_per_day}, last call ${lastCallAgoSec} seconds ago`);

	if (cntMin >= LIMITS.gemini_per_minute) {
		return {
			allowed: false,
			reason: `Rate limit: ${cntMin} calls in last minute`,
			waitMs: 60000 - ((nowSec % 60) * 1000),
			remaining,
			resetAt: {
				perMin: new Date(now + 60000).toLocaleTimeString(),
				perHour: new Date(now + 3600000).toLocaleTimeString(),
				perDay: 'Midnight',
			},
		};
	}
	if (cntHour >= LIMITS.gemini_per_hour) {
		return {
			allowed: false,
			reason: `Rate limit: ${cntHour} calls in last hour`,
			waitMs: 3600000 - ((nowSec % 3600) * 1000),
			remaining,
			resetAt: {
				perMin: new Date(now + 60000).toLocaleTimeString(),
				perHour: new Date(now + 3600000).toLocaleTimeString(),
				perDay: 'Midnight',
			},
		};
	}
	if (cntDay >= LIMITS.gemini_per_day) {
		const midnight = new Date();
		midnight.setHours(24, 0, 0, 0);
		return {
			allowed: false,
			reason: `Rate limit: ${cntDay} calls today`,
			waitMs: Math.max(0, midnight.getTime() - now),
			remaining,
			resetAt: {
				perMin: new Date(now + 60000).toLocaleTimeString(),
				perHour: new Date(now + 3600000).toLocaleTimeString(),
				perDay: 'Midnight',
			},
		};
	}
	return {
		allowed: true,
		reason: 'OK',
		waitMs,
		remaining,
		resetAt: {
			perMin: new Date(now + 60000).toLocaleTimeString(),
			perHour: new Date(now + 3600000).toLocaleTimeString(),
			perDay: 'Midnight',
		},
	};
}

export async function logRequest(
	type: string,
	source: string,
	durationMs: number,
	success: boolean,
	errorCode?: string,
): Promise<void> {
	await db.runAsync(
		`INSERT INTO request_log (timestamp, request_type, source, duration_ms, success, error_code) VALUES (?, ?, ?, ?, ?, ?)` ,
		[Math.floor(Date.now() / 1000), type, source, durationMs, success ? 1 : 0, errorCode || null],
	);
	if (source === 'api') lastRequestTime = Date.now();
}

export async function getRateLimitStats(): Promise<any> {
	const total = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM request_log');
	const fromCache = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM request_log WHERE source='cache'`);
	const fromApi = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM request_log WHERE source='api'`);
	const fromFallback = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM request_log WHERE source='fallback'`);
	const t = total?.count || 1;
	const apiCallsToday = await db
		.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM request_log WHERE ${LOCAL_DAY_FILTER} AND source='api'`)
		.then((r) => r?.count || 0);

	return {
		total: t,
		fromCache: fromCache?.count || 0,
		fromApi: fromApi?.count || 0,
		fromFallback: fromFallback?.count || 0,
		cacheHitRate: (((fromCache?.count || 0) / t) * 100).toFixed(1) + '%',
		apiCallsToday,
	};
}

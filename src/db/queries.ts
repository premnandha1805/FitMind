import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { safeAsync } from '../utils/safeAsync';

const isWeb = Platform.OS === 'web';
let db: SQLite.SQLiteDatabase | null = null;

function getNativeDb(): SQLite.SQLiteDatabase {
  if (isWeb) {
    throw new Error('SQLite is not available on web.');
  }

  if (!db) {
    db = SQLite.openDatabaseSync('fitmind.db');
  }

  return db;
}

export function getDb(): SQLite.SQLiteDatabase {
  return getNativeDb();
}

export async function executeSqlWithRetry(sql: string, params: SQLite.SQLiteBindParams = []): Promise<void> {
  if (isWeb) {
    if (__DEV__) {
      console.warn('[executeSqlWithRetry] Database persistence skipped: not available on web.');
    }
    return;
  }

  const nativeDb = getNativeDb();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error } = await safeAsync(
      async () => {
        nativeDb.runSync(sql, params);
      },
      `Db.executeSqlRetry${attempt}`
    );
    if (!error) {
      return;
    }
    await safeAsync(async () => new Promise((resolve) => { setTimeout(resolve, 300); }), `Db.executeSqlDelay${attempt}`);
  }
  throw new Error(`Database operation failed after 3 attempts: ${sql}`);
}

export async function executeTransactionWithRetry(queries: { sql: string; params: SQLite.SQLiteBindParams }[]): Promise<void> {
  if (isWeb) {
    if (__DEV__) {
      console.warn('[executeTransactionWithRetry] Database persistence skipped: not available on web.');
    }
    return;
  }

  const nativeDb = getNativeDb();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error } = await safeAsync(
      async () => {
        nativeDb.withTransactionSync(() => {
          for (const q of queries) {
            nativeDb.runSync(q.sql, q.params);
          }
        });
      },
      `Db.executeTransactionRetry${attempt}`
    );
    if (!error) {
      return;
    }
    await safeAsync(async () => new Promise((resolve) => { setTimeout(resolve, 300); }), `Db.executeTransactionDelay${attempt}`);
  }
  throw new Error('Database transaction failed after 3 attempts');
}

export async function getOne<T>(sql: string, params: SQLite.SQLiteBindParams = []): Promise<T | null> {
  if (isWeb) {
    throw new Error('UnsupportedPlatform: database not available on web');
  }

  const nativeDb = getNativeDb();
  const { data, error } = await safeAsync(
    async () => nativeDb.getFirstSync<T>(sql, params),
    'Db.getOne'
  );
  if (error) {
    throw new Error('Database read failed.');
  }
  return data ?? null;
}

export async function getAll<T>(sql: string, params: SQLite.SQLiteBindParams = []): Promise<T[]> {
  if (isWeb) {
    throw new Error('UnsupportedPlatform: database not available on web');
  }

  const nativeDb = getNativeDb();
  const { data, error } = await safeAsync(
    async () => nativeDb.getAllSync<T>(sql, params),
    'Db.getAll'
  );
  if (error || !data) {
    throw new Error('Database list read failed.');
  }
  return data;
}

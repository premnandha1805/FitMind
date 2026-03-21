import * as SQLite from 'expo-sqlite';
import { safeAsync } from '../utils/safeAsync';

const db = SQLite.openDatabaseSync('fitmind.db');

export function getDb(): SQLite.SQLiteDatabase {
  return db;
}

export async function executeSqlWithRetry(sql: string, params: SQLite.SQLiteBindParams = []): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error } = await safeAsync(
      async () => {
        db.runSync(sql, params);
      },
      `Db.executeSqlRetry${attempt}`
    );
    if (!error) {
      return;
    }
    await safeAsync(
      async () => new Promise<void>((resolve) => setTimeout(resolve, 150 * (2 ** attempt))),
      'Db.executeSqlBackoff'
    );
  }
  throw new Error('Database write failed after retries.');
}

export async function getOne<T>(sql: string, params: SQLite.SQLiteBindParams = []): Promise<T | null> {
  const { data, error } = await safeAsync(
    async () => db.getFirstSync<T>(sql, params),
    'Db.getOne'
  );
  if (error) {
    throw new Error('Database read failed.');
  }
  return data ?? null;
}

export async function getAll<T>(sql: string, params: SQLite.SQLiteBindParams = []): Promise<T[]> {
  const { data, error } = await safeAsync(
    async () => db.getAllSync<T>(sql, params),
    'Db.getAll'
  );
  if (error || !data) {
    throw new Error('Database list read failed.');
  }
  return data;
}

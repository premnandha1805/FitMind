import { DEFAULT_PREFS_SQL, DEFAULT_TASTE_SQL, TABLE_SQL } from './schema';
import { executeSqlWithRetry, getDb, getOne } from './queries';
import { safeAsync } from '../utils/safeAsync';

const LATEST_VERSION = 1;

export async function initializeDatabase(): Promise<void> {
  const db = getDb();
  const { data: versionRow } = await safeAsync(
    async () => db.getFirstSync<{ user_version: number }>('PRAGMA user_version;'),
    'Db.readUserVersion'
  );
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion < 1) {
    await executeSqlWithRetry(TABLE_SQL.userProfile);
    await executeSqlWithRetry(TABLE_SQL.clothingItems);
    await executeSqlWithRetry(TABLE_SQL.outfits);
    await executeSqlWithRetry(TABLE_SQL.fitChecks);
    await executeSqlWithRetry(TABLE_SQL.apiUsage);
    await executeSqlWithRetry(TABLE_SQL.outfitFeedback);
    await executeSqlWithRetry(TABLE_SQL.tasteProfile);
    await executeSqlWithRetry(TABLE_SQL.explicitPreferences);
    await executeSqlWithRetry(TABLE_SQL.blockedPatterns);
    await executeSqlWithRetry('PRAGMA user_version = 1;');
  }

  await executeSqlWithRetry(DEFAULT_TASTE_SQL);
  await executeSqlWithRetry(DEFAULT_PREFS_SQL);

  const tasteExists = await getOne<{ id: string }>('SELECT id FROM taste_profile WHERE id = ?;', ['taste']);
  if (!tasteExists) {
    await executeSqlWithRetry(TABLE_SQL.tasteProfile);
    await executeSqlWithRetry(DEFAULT_TASTE_SQL);
  }

  const prefsExists = await getOne<{ id: string }>('SELECT id FROM explicit_preferences WHERE id = ?;', ['prefs']);
  if (!prefsExists) {
    await executeSqlWithRetry(TABLE_SQL.explicitPreferences);
    await executeSqlWithRetry(DEFAULT_PREFS_SQL);
  }

  const prefCols = await safeAsync(
    async () => db.getAllSync<{ name: string }>("PRAGMA table_info('explicit_preferences');"),
    'Db.readPreferenceColumns'
  );
  const hasBlockedSeen = (prefCols.data ?? []).some((c) => c.name === 'blocked_notice_seen');
  if (!hasBlockedSeen) {
    await executeSqlWithRetry('ALTER TABLE explicit_preferences ADD COLUMN blocked_notice_seen INTEGER DEFAULT 0;');
  }

  if (currentVersion > LATEST_VERSION) {
    console.warn('Database version is newer than this app build supports.');
  }
}

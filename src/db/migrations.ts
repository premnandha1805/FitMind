import { DEFAULT_PREFS_SQL, DEFAULT_TASTE_SQL, TABLE_SQL } from './schema';
import { Platform } from 'react-native';
import { executeSqlWithRetry, getDb, getOne, executeTransactionWithRetry } from './queries';
import { safeAsync } from '../utils/safeAsync';

const LATEST_VERSION = 2;

async function migrateClothingItemsToStrictV2(): Promise<void> {
  const db = getDb();
  const existing = await safeAsync(
    async () => db.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='clothing_items';"),
    'Db.checkClothingItemsTable'
  );

  if (!existing.data?.length) {
    await executeSqlWithRetry(TABLE_SQL.clothingItems);
    return;
  }

  const queries = [
    { sql: 'ALTER TABLE clothing_items RENAME TO clothing_items_legacy;', params: [] },
    { sql: TABLE_SQL.clothingItems, params: [] },
    {
      sql: `INSERT INTO clothing_items (
        id, image_path, category, subcategory, color_hsl, color_hex, color_family,
        pattern, style_type, fit_type, season, user_corrected, ai_confidence, ai_raw_label,
        times_worn, last_worn, created_at
      )
      SELECT
        id,
        image_path,
        CASE
          WHEN lower(trim(category)) = 'top' THEN 'top'
          WHEN lower(trim(category)) = 'bottom' THEN 'bottom'
          WHEN lower(trim(category)) = 'shoes' THEN 'shoes'
          WHEN lower(trim(category)) = 'accessory' THEN 'accessory'
          WHEN lower(trim(category)) = 'outerwear' THEN 'outerwear'
          ELSE 'top'
        END,
        COALESCE(NULLIF(trim(subcategory), ''), 'general'),
        COALESCE(NULLIF(trim(color_hsl), ''), 'hsl(0,0%,50%)'),
        COALESCE(NULLIF(trim(color_hex), ''), '#808080'),
        'neutral',
        CASE
          WHEN lower(trim(pattern)) IN ('solid','stripes','checks','floral','print','geometric','abstract','other') THEN lower(trim(pattern))
          ELSE 'solid'
        END,
        CASE
          WHEN lower(trim(style_type)) IN ('casual','formal','party','ethnic','professional','sports','smart_casual') THEN lower(trim(style_type))
          WHEN lower(trim(style_type)) = 'business' THEN 'professional'
          WHEN lower(trim(style_type)) = 'work' THEN 'professional'
          ELSE 'casual'
        END,
        'regular',
        CASE
          WHEN lower(trim(season)) IN ('summer','winter','spring','autumn','all-season') THEN lower(trim(season))
          ELSE 'all-season'
        END,
        0,
        0.0,
        '',
        COALESCE(times_worn, 0),
        last_worn,
        COALESCE(created_at, datetime('now'))
      FROM clothing_items_legacy;`,
      params: []
    },
    { sql: 'DROP TABLE clothing_items_legacy;', params: [] }
  ];

  await executeTransactionWithRetry(queries);
}

export async function initializeDatabase(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

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
    await executeSqlWithRetry('PRAGMA user_version = 2;');
  }

  if (currentVersion >= 1 && currentVersion < 2) {
    await migrateClothingItemsToStrictV2();
    await executeSqlWithRetry('PRAGMA user_version = 2;');
  }

  await executeSqlWithRetry(TABLE_SQL.apiCache);

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
    if (__DEV__) {
      console.warn('Database version is newer than this app build supports.');
    }
  }
}

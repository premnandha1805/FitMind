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

  const columnsResult = await safeAsync(
    async () => db.getAllSync<{ name: string }>("PRAGMA table_info('clothing_items');"),
    'Db.readClothingItemsColumns'
  );
  const existingColumns = new Set((columnsResult.data ?? []).map((c) => c.name));

  const v2Columns = [
    'id',
    'image_path',
    'category',
    'subcategory',
    'color_hsl',
    'color_hex',
    'color_family',
    'pattern',
    'style_type',
    'fit_type',
    'season',
    'user_corrected',
    'ai_confidence',
    'ai_raw_label',
    'times_worn',
    'last_worn',
    'created_at'
  ];

  const isAlreadyV2Compatible = v2Columns.every((col) => existingColumns.has(col));
  if (isAlreadyV2Compatible) {
    return;
  }

  const hasColumn = (name: string) => existingColumns.has(name);
  const categoryExpr = hasColumn('category')
    ? `CASE
          WHEN lower(trim(category)) = 'top' THEN 'top'
          WHEN lower(trim(category)) = 'bottom' THEN 'bottom'
          WHEN lower(trim(category)) = 'shoes' THEN 'shoes'
          WHEN lower(trim(category)) = 'accessory' THEN 'accessory'
          WHEN lower(trim(category)) = 'outerwear' THEN 'outerwear'
          ELSE 'top'
        END`
    : `'top'`;
  const subcategoryExpr = hasColumn('subcategory')
    ? `COALESCE(NULLIF(trim(subcategory), ''), 'general')`
    : `'general'`;
  const colorHslExpr = hasColumn('color_hsl')
    ? `COALESCE(NULLIF(trim(color_hsl), ''), 'hsl(0,0%,50%)')`
    : `'hsl(0,0%,50%)'`;
  const colorHexExpr = hasColumn('color_hex')
    ? `COALESCE(NULLIF(trim(color_hex), ''), '#808080')`
    : `'#808080'`;
  const patternExpr = hasColumn('pattern')
    ? `CASE
          WHEN lower(trim(pattern)) IN ('solid','stripes','checks','floral','print','geometric','abstract','other') THEN lower(trim(pattern))
          ELSE 'solid'
        END`
    : `'solid'`;
  const styleTypeExpr = hasColumn('style_type')
    ? `CASE
          WHEN lower(trim(style_type)) IN ('casual','formal','party','ethnic','professional','sports','smart_casual') THEN lower(trim(style_type))
          WHEN lower(trim(style_type)) = 'business' THEN 'professional'
          WHEN lower(trim(style_type)) = 'work' THEN 'professional'
          ELSE 'casual'
        END`
    : `'casual'`;
  const seasonExpr = hasColumn('season')
    ? `CASE
          WHEN lower(trim(season)) IN ('summer','winter','spring','autumn','all-season') THEN lower(trim(season))
          ELSE 'all-season'
        END`
    : `'all-season'`;
  const userCorrectedExpr = hasColumn('user_corrected') ? 'COALESCE(user_corrected, 0)' : '0';
  const aiConfidenceExpr = hasColumn('ai_confidence') ? 'COALESCE(ai_confidence, 0.0)' : '0.0';
  const aiRawLabelExpr = hasColumn('ai_raw_label') ? `COALESCE(ai_raw_label, '')` : `''`;
  const timesWornExpr = hasColumn('times_worn') ? 'COALESCE(times_worn, 0)' : '0';
  const lastWornExpr = hasColumn('last_worn') ? 'last_worn' : 'NULL';
  const createdAtExpr = hasColumn('created_at') ? `COALESCE(created_at, datetime('now'))` : `datetime('now')`;

  const insertLegacySql = `INSERT INTO clothing_items (
        id, image_path, category, subcategory, color_hsl, color_hex, color_family,
        pattern, style_type, fit_type, season, user_corrected, ai_confidence, ai_raw_label,
        times_worn, last_worn, created_at
      )
      SELECT
        id,
        image_path,
        ${categoryExpr},
        ${subcategoryExpr},
        ${colorHslExpr},
        ${colorHexExpr},
        'neutral',
        ${patternExpr},
        ${styleTypeExpr},
        'regular',
        ${seasonExpr},
        ${userCorrectedExpr},
        ${aiConfidenceExpr},
        ${aiRawLabelExpr},
        ${timesWornExpr},
        ${lastWornExpr},
        ${createdAtExpr}
      FROM clothing_items_legacy;`;

  const queries = [
    { sql: 'ALTER TABLE clothing_items RENAME TO clothing_items_legacy;', params: [] },
    { sql: TABLE_SQL.clothingItems, params: [] },
    { sql: insertLegacySql, params: [] },
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
  }

  if (currentVersion < 2) {
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

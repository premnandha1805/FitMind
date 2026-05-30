import { getDb } from './queries';
import { resolveCategory, normalizeStyle } from '../constants/categoryMap';

const db = getDb();
const SCHEMA_VERSION = 6;

const TABLES = `
CREATE TABLE IF NOT EXISTS user_profile (
  id TEXT PRIMARY KEY DEFAULT 'user', skin_tone_id INTEGER NOT NULL DEFAULT 3, skin_undertone TEXT NOT NULL DEFAULT 'neutral', skin_hex TEXT NOT NULL DEFAULT '#C9956C', skin_image_path TEXT, onboarded INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS clothing_items (
  id TEXT PRIMARY KEY, image_path TEXT NOT NULL, thumbnail_path TEXT, category TEXT NOT NULL DEFAULT 'top' CHECK(category IN ('top','bottom','shoes','accessory','outerwear')), subcategory TEXT NOT NULL DEFAULT 'item', color_hsl TEXT NOT NULL DEFAULT 'hsl(0,0%,50%)', color_hex TEXT NOT NULL DEFAULT '#808080', color_family TEXT NOT NULL DEFAULT 'neutral', color_name TEXT NOT NULL DEFAULT 'Grey', pattern TEXT NOT NULL DEFAULT 'solid' CHECK(pattern IN ('solid','stripes','checks','floral','print','geometric','abstract','other')), style_type TEXT NOT NULL DEFAULT 'casual' CHECK(style_type IN ('casual','formal','party','ethnic','professional','sports','smart_casual')), fit_type TEXT NOT NULL DEFAULT 'regular' CHECK(fit_type IN ('slim','regular','relaxed','oversized','fitted')), season TEXT NOT NULL DEFAULT 'all-season' CHECK(season IN ('summer','winter','spring','autumn','all-season')), material TEXT DEFAULT 'unknown', brand TEXT DEFAULT '', user_corrected INTEGER NOT NULL DEFAULT 0, ai_confidence REAL NOT NULL DEFAULT 0.0, ai_raw_label TEXT DEFAULT '', times_worn INTEGER NOT NULL DEFAULT 0, last_worn TEXT, cost REAL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS outfits (
  id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT 'My Look', occasion TEXT NOT NULL, item_ids TEXT NOT NULL DEFAULT '[]', color_score REAL NOT NULL DEFAULT 7.0, skin_score REAL NOT NULL DEFAULT 7.0, taste_score REAL NOT NULL DEFAULT 7.0, gemini_score REAL NOT NULL DEFAULT 7.0, final_score REAL NOT NULL DEFAULT 7.0, explanation TEXT NOT NULL DEFAULT '[]', worn_on TEXT, liked INTEGER NOT NULL DEFAULT 0, weather_temp REAL, weather_cond TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS fit_checks (
  id TEXT PRIMARY KEY, image_path TEXT NOT NULL, image_hash TEXT NOT NULL UNIQUE, outfit_id TEXT, result_json TEXT NOT NULL, style_score INTEGER NOT NULL DEFAULT 7, skin_score INTEGER NOT NULL DEFAULT 7, color_score INTEGER NOT NULL DEFAULT 7, source TEXT NOT NULL DEFAULT 'gemini' CHECK(source IN ('gemini','local','cached')), created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS taste_profile (
  id TEXT PRIMARY KEY DEFAULT 'taste', color_weights TEXT NOT NULL DEFAULT '{}', pattern_weights TEXT NOT NULL DEFAULT '{}', style_weights TEXT NOT NULL DEFAULT '{}', occasion_weights TEXT NOT NULL DEFAULT '{}', contrast_pref REAL NOT NULL DEFAULT 0.5, warmcool_bias REAL NOT NULL DEFAULT 0.5, boldness_pref REAL NOT NULL DEFAULT 0.5, formality_pref REAL NOT NULL DEFAULT 0.5, accessory_pref REAL NOT NULL DEFAULT 0.5, layering_pref REAL NOT NULL DEFAULT 0.5, feedback_count INTEGER NOT NULL DEFAULT 0, accuracy_trend REAL NOT NULL DEFAULT 0.5, last_updated TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS explicit_preferences (
  id TEXT PRIMARY KEY DEFAULT 'prefs', loved_colors TEXT NOT NULL DEFAULT '[]', disliked_colors TEXT NOT NULL DEFAULT '[]', loved_patterns TEXT NOT NULL DEFAULT '[]', blocked_patterns TEXT NOT NULL DEFAULT '[]', fit_preference TEXT NOT NULL DEFAULT 'regular', style_identity TEXT NOT NULL DEFAULT 'classic', updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS outfit_feedback (
  id TEXT PRIMARY KEY, outfit_id TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('worn','liked','skipped','rejected','fitcheck_loved','fitcheck_fine','fitcheck_bad','swap_accepted','swap_rejected')), item_ids TEXT NOT NULL DEFAULT '[]', color_hexes TEXT NOT NULL DEFAULT '[]', color_families TEXT NOT NULL DEFAULT '[]', patterns TEXT NOT NULL DEFAULT '[]', style_type TEXT NOT NULL DEFAULT 'casual', occasion TEXT NOT NULL DEFAULT 'casual', final_score REAL NOT NULL DEFAULT 7.0, skin_score REAL NOT NULL DEFAULT 7.0, color_score REAL NOT NULL DEFAULT 7.0, time_of_day TEXT DEFAULT 'morning', day_of_week INTEGER DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS api_cache (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'general', hit_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()), expires_at INTEGER NOT NULL, last_hit INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS request_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER NOT NULL DEFAULT (unixepoch()), request_type TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('api','cache','fallback','local')), duration_ms INTEGER DEFAULT 0, success INTEGER NOT NULL DEFAULT 1, error_code TEXT DEFAULT NULL
);
CREATE TABLE IF NOT EXISTS api_usage (
  date TEXT PRIMARY KEY, gemini_calls INTEGER NOT NULL DEFAULT 0, gemini_quota_exhausted INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now'))
);
`;

const INDEXES = `
CREATE INDEX IF NOT EXISTS idx_items_category ON clothing_items(category);
CREATE INDEX IF NOT EXISTS idx_items_style ON clothing_items(style_type);
CREATE INDEX IF NOT EXISTS idx_items_season ON clothing_items(season);
CREATE INDEX IF NOT EXISTS idx_feedback_outfit ON outfit_feedback(outfit_id);
CREATE INDEX IF NOT EXISTS idx_feedback_action ON outfit_feedback(action);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON outfit_feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON api_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_cache_category ON api_cache(category);
CREATE INDEX IF NOT EXISTS idx_requests_time ON request_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_requests_type_source_time ON request_log(request_type, source, timestamp);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fitcheck_hash ON fit_checks(image_hash);
`;

export async function initializeDatabase(): Promise<void> { await db.execAsync('PRAGMA journal_mode = WAL;'); await db.execAsync('PRAGMA foreign_keys = ON;'); await db.execAsync('PRAGMA cache_size = -8000;'); await db.execAsync(TABLES); await runMigrations(); await db.execAsync(INDEXES); await insertDefaults(); }
async function insertDefaults(): Promise<void> { await db.runAsync(`INSERT OR IGNORE INTO taste_profile (id) VALUES ('taste')`); await db.runAsync(`INSERT OR IGNORE INTO explicit_preferences (id) VALUES ('prefs')`); }
async function runMigrations(): Promise<void> {
  const current = await db.getFirstAsync<{version:number}>('SELECT MAX(version) as version FROM schema_version').catch(() => ({version:0}));
  const v = current?.version || 0;
  if (v < 5) {
    const migrations = ['ALTER TABLE clothing_items ADD COLUMN thumbnail_path TEXT','ALTER TABLE clothing_items ADD COLUMN color_name TEXT DEFAULT "Grey"','ALTER TABLE clothing_items ADD COLUMN material TEXT DEFAULT "unknown"','ALTER TABLE clothing_items ADD COLUMN brand TEXT DEFAULT ""','ALTER TABLE clothing_items ADD COLUMN cost REAL DEFAULT 0','ALTER TABLE clothing_items ADD COLUMN updated_at TEXT DEFAULT (datetime("now"))','ALTER TABLE outfits ADD COLUMN taste_score REAL DEFAULT 7.0','ALTER TABLE outfits ADD COLUMN explanation TEXT DEFAULT "[]"','ALTER TABLE outfits ADD COLUMN weather_temp REAL','ALTER TABLE outfits ADD COLUMN weather_cond TEXT','ALTER TABLE fit_checks ADD COLUMN outfit_id TEXT','ALTER TABLE fit_checks ADD COLUMN skin_score INTEGER DEFAULT 7','ALTER TABLE fit_checks ADD COLUMN color_score INTEGER DEFAULT 7','ALTER TABLE fit_checks ADD COLUMN source TEXT DEFAULT "gemini"','ALTER TABLE outfit_feedback ADD COLUMN color_families TEXT DEFAULT "[]"','ALTER TABLE outfit_feedback ADD COLUMN time_of_day TEXT DEFAULT "morning"','ALTER TABLE outfit_feedback ADD COLUMN day_of_week INTEGER DEFAULT 1','ALTER TABLE api_cache ADD COLUMN category TEXT DEFAULT "general"','ALTER TABLE api_cache ADD COLUMN hit_count INTEGER DEFAULT 0','ALTER TABLE api_cache ADD COLUMN last_hit INTEGER DEFAULT (unixepoch())'];
    for (const sql of migrations) await db.execAsync(sql).catch(() => {});
  }
  if (v < 6) {
    await db.execAsync('CREATE TABLE IF NOT EXISTS api_usage (date TEXT PRIMARY KEY, gemini_calls INTEGER NOT NULL DEFAULT 0, gemini_quota_exhausted INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime("now")));');
    await db.execAsync('ALTER TABLE fit_checks ADD COLUMN result_json TEXT').catch(() => {});
    await db.execAsync('UPDATE fit_checks SET result_json = COALESCE(result_json, gemini_result) WHERE result_json IS NULL').catch(() => {});
  }
  if (v < SCHEMA_VERSION) {
    await db.runAsync('INSERT OR REPLACE INTO schema_version (version) VALUES (?)', [SCHEMA_VERSION]);
  }
}
export async function repairExistingItems(): Promise<void> { const items = await db.getAllAsync<any>('SELECT id, category, style_type FROM clothing_items'); for (const item of items) { const fixedCategory = resolveCategory(item.category); const fixedStyle = normalizeStyle(item.style_type); if (fixedCategory !== item.category || fixedStyle !== item.style_type) { await db.runAsync(`UPDATE clothing_items SET category = ?, style_type = ?, updated_at = datetime('now') WHERE id = ? AND user_corrected = 0`, [fixedCategory, fixedStyle, item.id]); } } }

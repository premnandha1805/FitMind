import { Platform } from 'react-native';

const isNativeDb = Platform.OS !== 'web';

export const TABLE_SQL = {
  userProfile: isNativeDb ? `CREATE TABLE IF NOT EXISTS user_profile (
    id TEXT PRIMARY KEY DEFAULT 'user',
    skin_tone_id INTEGER NOT NULL,
    skin_undertone TEXT NOT NULL,
    skin_image_path TEXT,
    onboarded INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );` : '',
  clothingItems: isNativeDb ? `CREATE TABLE IF NOT EXISTS clothing_items (
    id TEXT PRIMARY KEY,
    image_path TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN (
      'top','bottom','shoes','accessory','outerwear'
    )),
    subcategory TEXT NOT NULL DEFAULT 'general',
    color_hsl TEXT NOT NULL DEFAULT 'hsl(0,0%,50%)',
    color_hex TEXT NOT NULL DEFAULT '#808080',
    color_family TEXT NOT NULL DEFAULT 'neutral' CHECK(color_family IN (
      'red','orange','yellow','green','blue',
      'purple','pink','brown','grey','black',
      'white','neutral','warm','cool'
    )),
    pattern TEXT NOT NULL DEFAULT 'solid' CHECK(pattern IN (
      'solid','stripes','checks','floral',
      'print','geometric','abstract','other'
    )),
    style_type TEXT NOT NULL DEFAULT 'casual' CHECK(style_type IN (
      'casual','formal','party','ethnic','professional',
      'sports','smart_casual'
    )),
    fit_type TEXT NOT NULL DEFAULT 'regular' CHECK(fit_type IN (
      'slim','regular','relaxed','oversized','fitted'
    )),
    season TEXT NOT NULL DEFAULT 'all-season' CHECK(season IN (
      'summer','winter','spring','autumn','all-season'
    )),
    user_corrected INTEGER NOT NULL DEFAULT 0,
    ai_confidence REAL NOT NULL DEFAULT 0.0,
    ai_raw_label TEXT DEFAULT '',
    times_worn INTEGER NOT NULL DEFAULT 0,
    last_worn TEXT,
    created_at TEXT NOT NULL
  );` : '',
  outfits: isNativeDb ? `CREATE TABLE IF NOT EXISTS outfits (
    id TEXT PRIMARY KEY,
    occasion TEXT NOT NULL,
    item_ids TEXT NOT NULL,
    color_score INTEGER,
    skin_score INTEGER,
    gemini_score INTEGER,
    final_score INTEGER,
    worn_on TEXT,
    liked INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );` : '',
  fitChecks: isNativeDb ? `CREATE TABLE IF NOT EXISTS fit_checks (
    id TEXT PRIMARY KEY,
    image_path TEXT NOT NULL,
    image_hash TEXT NOT NULL UNIQUE,
    gemini_result TEXT NOT NULL,
    style_score INTEGER,
    created_at TEXT NOT NULL
  );` : '',
  apiUsage: isNativeDb ? `CREATE TABLE IF NOT EXISTS api_usage (
    date TEXT PRIMARY KEY,
    gemini_calls INTEGER DEFAULT 0
  );` : '',
  outfitFeedback: isNativeDb ? `CREATE TABLE IF NOT EXISTS outfit_feedback (
    id TEXT PRIMARY KEY,
    outfit_id TEXT NOT NULL,
    action TEXT NOT NULL,
    item_ids TEXT NOT NULL,
    colors TEXT NOT NULL,
    patterns TEXT NOT NULL,
    style_type TEXT NOT NULL,
    skin_score INTEGER,
    color_score INTEGER,
    final_score INTEGER,
    created_at TEXT NOT NULL
  );` : '',
  tasteProfile: isNativeDb ? `CREATE TABLE IF NOT EXISTS taste_profile (
    id TEXT PRIMARY KEY DEFAULT 'taste',
    contrast_preference REAL DEFAULT 0.5,
    warm_cool_bias REAL DEFAULT 0.5,
    pattern_tolerance REAL DEFAULT 0.5,
    accessory_interest REAL DEFAULT 0.5,
    formality_comfort REAL DEFAULT 0.5,
    skin_tone_weight REAL DEFAULT 0.6,
    boldness_preference REAL DEFAULT 0.5,
    layering_preference REAL DEFAULT 0.5,
    feedback_count INTEGER DEFAULT 0,
    last_updated TEXT
  );` : '',
  explicitPreferences: isNativeDb ? `CREATE TABLE IF NOT EXISTS explicit_preferences (
    id TEXT PRIMARY KEY DEFAULT 'prefs',
    loved_colors TEXT DEFAULT '[]',
    disliked_colors TEXT DEFAULT '[]',
    loved_patterns TEXT DEFAULT '[]',
    disliked_patterns TEXT DEFAULT '[]',
    fit_preference TEXT DEFAULT 'relaxed',
    style_identity TEXT DEFAULT 'classic',
    blocked_notice_seen INTEGER DEFAULT 0,
    updated_at TEXT
  );` : '',
  blockedPatterns: isNativeDb ? `CREATE TABLE IF NOT EXISTS blocked_patterns (
    id TEXT PRIMARY KEY,
    pattern_type TEXT NOT NULL,
    reason TEXT,
    blocked_at TEXT NOT NULL
  );` : '',
  apiCache: isNativeDb ? `CREATE TABLE IF NOT EXISTS api_cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );` : '',
};

export const DEFAULT_TASTE_SQL = isNativeDb ? `INSERT OR IGNORE INTO taste_profile (
  id, contrast_preference, warm_cool_bias, pattern_tolerance,
  accessory_interest, formality_comfort, skin_tone_weight,
  boldness_preference, layering_preference, feedback_count, last_updated
) VALUES ('taste', 0.5, 0.5, 0.5, 0.5, 0.5, 0.6, 0.5, 0.5, 0, datetime('now'));` : '';

export const DEFAULT_PREFS_SQL = isNativeDb ? `INSERT OR IGNORE INTO explicit_preferences (
  id, loved_colors, disliked_colors, loved_patterns, disliked_patterns,
  fit_preference, style_identity, blocked_notice_seen, updated_at
) VALUES ('prefs', '[]', '[]', '[]', '[]', 'relaxed', 'classic', 0, datetime('now'));` : '';

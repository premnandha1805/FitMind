export const TABLE_SQL = {
  userProfile: `CREATE TABLE IF NOT EXISTS user_profile (
    id TEXT PRIMARY KEY DEFAULT 'user',
    skin_tone_id INTEGER NOT NULL,
    skin_undertone TEXT NOT NULL,
    skin_image_path TEXT,
    onboarded INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );`,
  clothingItems: `CREATE TABLE IF NOT EXISTS clothing_items (
    id TEXT PRIMARY KEY,
    image_path TEXT NOT NULL,
    category TEXT NOT NULL,
    color_hsl TEXT NOT NULL,
    color_hex TEXT NOT NULL,
    pattern TEXT,
    style_type TEXT NOT NULL,
    season TEXT,
    times_worn INTEGER DEFAULT 0,
    last_worn TEXT,
    created_at TEXT NOT NULL
  );`,
  outfits: `CREATE TABLE IF NOT EXISTS outfits (
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
  );`,
  fitChecks: `CREATE TABLE IF NOT EXISTS fit_checks (
    id TEXT PRIMARY KEY,
    image_path TEXT NOT NULL,
    image_hash TEXT NOT NULL UNIQUE,
    gemini_result TEXT NOT NULL,
    style_score INTEGER,
    created_at TEXT NOT NULL
  );`,
  apiUsage: `CREATE TABLE IF NOT EXISTS api_usage (
    date TEXT PRIMARY KEY,
    gemini_calls INTEGER DEFAULT 0
  );`,
  outfitFeedback: `CREATE TABLE IF NOT EXISTS outfit_feedback (
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
  );`,
  tasteProfile: `CREATE TABLE IF NOT EXISTS taste_profile (
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
  );`,
  explicitPreferences: `CREATE TABLE IF NOT EXISTS explicit_preferences (
    id TEXT PRIMARY KEY DEFAULT 'prefs',
    loved_colors TEXT DEFAULT '[]',
    disliked_colors TEXT DEFAULT '[]',
    loved_patterns TEXT DEFAULT '[]',
    disliked_patterns TEXT DEFAULT '[]',
    fit_preference TEXT DEFAULT 'relaxed',
    style_identity TEXT DEFAULT 'classic',
    blocked_notice_seen INTEGER DEFAULT 0,
    updated_at TEXT
  );`,
  blockedPatterns: `CREATE TABLE IF NOT EXISTS blocked_patterns (
    id TEXT PRIMARY KEY,
    pattern_type TEXT NOT NULL,
    reason TEXT,
    blocked_at TEXT NOT NULL
  );`,
};

export const DEFAULT_TASTE_SQL = `INSERT OR IGNORE INTO taste_profile (
  id, contrast_preference, warm_cool_bias, pattern_tolerance,
  accessory_interest, formality_comfort, skin_tone_weight,
  boldness_preference, layering_preference, feedback_count, last_updated
) VALUES ('taste', 0.5, 0.5, 0.5, 0.5, 0.5, 0.6, 0.5, 0.5, 0, datetime('now'));`;

export const DEFAULT_PREFS_SQL = `INSERT OR IGNORE INTO explicit_preferences (
  id, loved_colors, disliked_colors, loved_patterns, disliked_patterns,
  fit_preference, style_identity, blocked_notice_seen, updated_at
) VALUES ('prefs', '[]', '[]', '[]', '[]', 'relaxed', 'classic', 0, datetime('now'));`;

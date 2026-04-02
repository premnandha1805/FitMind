import { create } from 'zustand';
import { Platform } from 'react-native';
import { executeSqlWithRetry, getOne } from '../db/queries';
import { ExplicitPreferences, UserProfile } from '../types/models';
import { safeAsync } from '../utils/safeAsync';

interface UserState {
  profile: UserProfile | null;
  preferences: ExplicitPreferences;
  loading: boolean;
  loadUser: () => Promise<void>;
  saveProfile: (profile: Pick<UserProfile, 'skinToneId' | 'skinUndertone' | 'skinImagePath' | 'onboarded'>) => Promise<void>;
  savePreferences: (prefs: ExplicitPreferences) => Promise<void>;
}

const defaultPrefs: ExplicitPreferences = {
  lovedColors: [],
  dislikedColors: [],
  lovedPatterns: [],
  dislikedPatterns: [],
  fitPreference: 'relaxed',
  styleIdentity: 'classic',
};

export const useUserStore = create<UserState>((set) => ({
  profile: null,
  preferences: defaultPrefs,
  loading: false,

  loadUser: async () => {
    if (Platform.OS === 'web') {
      set({ profile: null, preferences: defaultPrefs, loading: false });
      return;
    }

    set({ loading: true });
    await safeAsync(async () => {
      const row = await getOne<{
        id: string;
        skin_tone_id: number;
        skin_undertone: 'Warm' | 'Cool' | 'Neutral';
        skin_image_path: string | null;
        onboarded: number;
        created_at: string;
      }>('SELECT * FROM user_profile WHERE id = ?;', ['user']);

      const prefs = await getOne<{
        loved_colors: string;
        disliked_colors: string;
        loved_patterns: string;
        disliked_patterns: string;
        fit_preference: 'relaxed' | 'fitted';
        style_identity: 'minimal' | 'classic' | 'bold' | 'traditional';
      }>('SELECT * FROM explicit_preferences WHERE id = ?;', ['prefs']);

      if (row) {
        set({
          profile: {
            id: row.id,
            skinToneId: row.skin_tone_id,
            skinUndertone: row.skin_undertone,
            skinImagePath: row.skin_image_path,
            onboarded: row.onboarded,
            createdAt: row.created_at,
          },
        });
      }

      if (prefs) {
        set({
          preferences: {
            lovedColors: JSON.parse(prefs.loved_colors) as string[],
            dislikedColors: JSON.parse(prefs.disliked_colors) as string[],
            lovedPatterns: JSON.parse(prefs.loved_patterns) as string[],
            dislikedPatterns: JSON.parse(prefs.disliked_patterns) as string[],
            fitPreference: prefs.fit_preference,
            styleIdentity: prefs.style_identity,
          },
        });
      }
    }, 'User.loadProfile');
    set({ loading: false });
  },

  saveProfile: async (profile) => {
    if (Platform.OS === 'web') {
      set({
        profile: {
          id: 'user',
          skinToneId: profile.skinToneId,
          skinUndertone: profile.skinUndertone,
          skinImagePath: profile.skinImagePath,
          onboarded: profile.onboarded,
          createdAt: new Date().toISOString(),
        },
      });
      return;
    }

    await safeAsync(async () => {
      await executeSqlWithRetry(
        `INSERT OR REPLACE INTO user_profile
         (id, skin_tone_id, skin_undertone, skin_image_path, onboarded, created_at)
         VALUES ('user', ?, ?, ?, ?, COALESCE((SELECT created_at FROM user_profile WHERE id='user'), datetime('now')));`,
        [profile.skinToneId, profile.skinUndertone, profile.skinImagePath, profile.onboarded]
      );
      set({
        profile: {
          id: 'user',
          skinToneId: profile.skinToneId,
          skinUndertone: profile.skinUndertone,
          skinImagePath: profile.skinImagePath,
          onboarded: profile.onboarded,
          createdAt: new Date().toISOString(),
        },
      });
    }, 'User.saveProfile');
  },

  savePreferences: async (prefs) => {
    if (Platform.OS === 'web') {
      set({ preferences: prefs });
      return;
    }

    await safeAsync(async () => {
      await executeSqlWithRetry(
        `UPDATE explicit_preferences
         SET loved_colors = ?, disliked_colors = ?, loved_patterns = ?, disliked_patterns = ?,
             fit_preference = ?, style_identity = ?, updated_at = datetime('now')
         WHERE id = 'prefs';`,
        [
          JSON.stringify(prefs.lovedColors),
          JSON.stringify(prefs.dislikedColors),
          JSON.stringify(prefs.lovedPatterns),
          JSON.stringify(prefs.dislikedPatterns),
          prefs.fitPreference,
          prefs.styleIdentity,
        ]
      );
      set({ preferences: prefs });
    }, 'User.savePreferences');
  },
}));

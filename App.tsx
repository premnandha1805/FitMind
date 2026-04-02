import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View, StyleSheet, AppState, AppStateStatus, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import {
  NotoSerif_400Regular,
  NotoSerif_700Bold,
  NotoSerif_400Regular_Italic,
  NotoSerif_700Bold_Italic,
} from '@expo-google-fonts/noto-serif';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { PlayfairDisplay_700Bold_Italic } from '@expo-google-fonts/playfair-display';
import NetInfo from '@react-native-community/netinfo';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { initializeDatabase } from './src/db/migrations';
import { OfflineBanner } from './src/components/OfflineBanner';
import { useUserStore } from './src/store/useUserStore';
import { useTasteStore } from './src/store/useTasteStore';
import { useClosetStore } from './src/store/useClosetStore';
import { safeAsync } from './src/utils/safeAsync';
import GeminiKeySetupScreen from './src/screens/GeminiKeySetupScreen';
import { validateGeminiKey } from './src/services/gemini';
import { retryQueuedFeedback } from './src/services/feedbackEngine';
import { cleanExpiredCache } from './src/services/cacheEngine';

void SplashScreen.preventAutoHideAsync();

export default function App(): React.JSX.Element | null {
  const [fontsLoaded] = useFonts({
    NotoSerif_400Regular,
    NotoSerif_700Bold,
    NotoSerif_400Regular_Italic,
    NotoSerif_700Bold_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    PlayfairDisplay_700Bold_Italic,
  });
  const loadUser = useUserStore((s) => s.loadUser);
  const profile = useUserStore((s) => s.profile);
  const refreshTaste = useTasteStore((s) => s.refresh);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [keyValid, setKeyValid] = useState(true);

  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOffline(!(state.isConnected ?? false));
    });

    safeAsync(async () => {
      const rawKey = Constants.expoConfig?.extra?.geminiApiKey as string | undefined;
      const key = typeof rawKey === 'string' ? rawKey.trim() : '';
      const configured = Boolean(key) && key.toLowerCase() !== 'paste_your_key_here_no_quotes';
      console.log('Gemini key configured:', configured);

      if (Platform.OS !== 'web') {
        // a. (Fonts handled by useFonts above)
        // b. Clean expired cache
        await cleanExpiredCache();
        // c. Initialize SQLite DB
        await initializeDatabase();
        console.log('[App] DB & Cache ready');
      }

      // f. Load user profile
      await loadUser();
      await refreshTaste();

      // d. Run category migration on existing items
      if (Platform.OS !== 'web') {
        await useClosetStore.getState().loadItems();
        await useClosetStore.getState().migrateCategories();
        console.log('[App] Closet items migrated');
      }

      // e. Validate Gemini key
      const shouldValidateGemini = useUserStore.getState().profile?.onboarded === 1;
      if (shouldValidateGemini) {
        const { data: valid } = await safeAsync(async () => validateGeminiKey(), 'App.validateGeminiKey');
        setKeyValid(Boolean(valid));
      }

      // g. Show first screen
      setReady(true);
    }, 'App.bootstrapInit');

    const appStateSub = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') {
        safeAsync(async () => retryQueuedFeedback(), 'App.retryQueuedFeedback');
      }
    });

    return () => {
      unsubscribe();
      appStateSub.remove();
    };
  }, [loadUser, refreshTaste]);

  if (!fontsLoaded) {
    return null;
  }

  if (!ready) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.loadingText}>Setting up FitMind...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <OfflineBanner visible={offline} />
        {(keyValid || profile?.onboarded !== 1) ? <AppNavigator /> : <GeminiKeySetupScreen onValid={() => setKeyValid(true)} />}
        <StatusBar style="light" />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#131313' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, backgroundColor: '#131313' },
  loadingText: { color: '#d0c5b5', fontWeight: '600' },
});

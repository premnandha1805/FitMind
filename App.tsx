import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View, StyleSheet, AppState, AppStateStatus } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
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
import AppNavigator from './src/navigation/AppNavigator';
import { initializeDatabase } from './src/db/migrations';
import { OfflineBanner } from './src/components/OfflineBanner';
import { useUserStore } from './src/store/useUserStore';
import { useTasteStore } from './src/store/useTasteStore';
import { safeAsync } from './src/utils/safeAsync';
import GeminiKeySetupScreen from './src/screens/GeminiKeySetupScreen';
import { validateGeminiKey } from './src/services/gemini';
import { retryQueuedFeedback } from './src/services/feedbackEngine';

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
      await initializeDatabase();
      await loadUser();
      await refreshTaste();
      const shouldValidateGemini = useUserStore.getState().profile?.onboarded === 1;
      if (shouldValidateGemini) {
        const valid = await validateGeminiKey();
        setKeyValid(valid);
      }
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
    <View style={styles.root}>
      <OfflineBanner visible={offline} />
      {(keyValid || profile?.onboarded !== 1) ? <AppNavigator /> : <GeminiKeySetupScreen onValid={() => setKeyValid(true)} />}
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, backgroundColor: '#fff' },
  loadingText: { color: '#334155', fontWeight: '600' },
});

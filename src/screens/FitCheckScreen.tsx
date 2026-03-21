import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Animated, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { FitReport } from '../components/FitReport';
import { runFitCheck } from '../services/gemini';
import { useUserStore } from '../store/useUserStore';
import { recordFitCheckRating, recordSwapRequest } from '../services/feedbackEngine';
import { safeAsync } from '../utils/safeAsync';
import { ErrorCard } from '../components/ErrorCard';
import { useClosetStore } from '../store/useClosetStore';

type FitCheckErrorKind = 'timeout' | 'rateLimit' | 'offline' | 'invalidJson' | 'networkFail';

const ERROR_CARD_CONFIG: Record<FitCheckErrorKind, { icon: string; title: string; description: string; action: string }> = {
  timeout: {
    icon: '🕒',
    title: 'Taking too long',
    description: 'Analysis is taking longer than expected.',
    action: 'Retry',
  },
  rateLimit: {
    icon: '🔒',
    title: '60 checks used today',
    description: 'Resets in Xh Ym',
    action: 'OK',
  },
  offline: {
    icon: '📴',
    title: 'No internet',
    description: 'Fit Check needs connection',
    action: 'OK',
  },
  invalidJson: {
    icon: '⚠️',
    title: 'Partial result loaded',
    description: 'Some fields could not be read',
    action: 'Continue',
  },
  networkFail: {
    icon: '🔄',
    title: 'Connection failed',
    description: 'Please try again.',
    action: 'Retry',
  },
};

export default function FitCheckScreen(): React.JSX.Element {
  const profile = useUserStore((s) => s.profile);
  const closetItems = useClosetStore((s) => s.items);
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState(60);
  const [fitId, setFitId] = useState<string>('');
  const [report, setReport] = useState<Awaited<ReturnType<typeof runFitCheck>>['result'] | null>(null);
  const [errorKind, setErrorKind] = useState<FitCheckErrorKind | null>(null);
  const [ratingCaptured, setRatingCaptured] = useState(false);

  const pulse = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    if (!loading) {
      pulse.setValue(0.7);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.7, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [loading, pulse]);

  const counterColor = useMemo(() => {
    if (remaining < 10) return '#dc2626';
    if (remaining <= 30) return '#ea580c';
    return '#15803d';
  }, [remaining]);

  const resolveSwapImage = (itemType: string): string | null => {
    const normalized = itemType.trim().toLowerCase();
    const match = closetItems.find((item) => {
      const category = item.category.toLowerCase();
      return category.includes(normalized) || normalized.includes(category);
    });
    return match?.imagePath ?? null;
  };

  const parseResetCountdown = (message: string): string => {
    const match = message.match(/Resets in\s+([^.]*)/i);
    return match?.[1]?.trim() ?? 'Xh Ym';
  };

  const upload = async (): Promise<void> => {
    if (!profile) return;
    setLoading(true);
    setErrorKind(null);
    setRatingCaptured(false);
    const { data } = await safeAsync(async () => {
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!p.granted) return null;
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (res.canceled) return null;
      return res.assets[0].uri;
    }, 'FitCheckScreen.pickImage');

    if (!data) {
      setLoading(false);
      return;
    }

    const { data: checked, error } = await safeAsync(async () => runFitCheck(data, profile), 'FitCheckScreen.runFitCheck');
    setLoading(false);

    if (error || !checked) {
      const lower = (error ?? '').toLowerCase();
      if (lower.includes('limit') || lower.includes('60')) setErrorKind('rateLimit');
      else if (lower.includes('long') || lower.includes('timeout')) setErrorKind('timeout');
      else if (lower.includes('offline') || lower.includes('internet')) setErrorKind('offline');
      else setErrorKind('networkFail');
      return;
    }

    setReport(checked.result);
    setRemaining(checked.remaining);
    setFitId(`fit-${Date.now()}`);

    if (checked.result.one_line_verdict.toLowerCase().includes('partial')) {
      setErrorKind('invalidJson');
    }
  };

  const onRate = (rating: 'loved' | 'fine' | 'notGreat'): void => {
    if (ratingCaptured) return;
    setRatingCaptured(true);
    safeAsync(async () => recordFitCheckRating(fitId, rating), 'FitCheckScreen.rateFitCheck');
  };

  const onErrorAction = (): void => {
    if (errorKind === 'timeout' || errorKind === 'networkFail') {
      upload();
      return;
    }
    setErrorKind(null);
  };

  const rateLimitDescription = errorKind === 'rateLimit'
    ? `Resets in ${parseResetCountdown('Resets in Xh Ym')}`
    : '';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={[styles.counter, { color: counterColor }]}>{remaining} / 60 free checks remaining today</Text>
      <Pressable style={styles.btn} onPress={upload}><Text style={styles.btnText}>Upload Outfit Photo</Text></Pressable>
      {loading ? (
        <Animated.View style={[styles.pulseCard, { opacity: pulse }]}> 
          <Text style={styles.loading}>Analyzing your outfit...</Text>
          <Text style={styles.loadingSub}>This takes about 5-10 seconds</Text>
        </Animated.View>
      ) : null}

      {errorKind ? (
        <ErrorCard
          icon={ERROR_CARD_CONFIG[errorKind].icon}
          title={ERROR_CARD_CONFIG[errorKind].title}
          description={errorKind === 'rateLimit' ? rateLimitDescription : ERROR_CARD_CONFIG[errorKind].description}
          actionText={ERROR_CARD_CONFIG[errorKind].action}
          onAction={onErrorAction}
        />
      ) : null}

      {report ? (
        <>
          <FitReport report={report} onSwapUse={() => {}} onSwapReject={(itemType) => { safeAsync(async () => recordSwapRequest('fitcheck', itemType, 'Not for me'), 'FitCheckScreen.swapRejectInline'); }} />
          <Text style={styles.swapHeader}>Swap Suggestions</Text>
          {report.swap_suggestions.map((swap, idx) => {
            const img = resolveSwapImage(swap.item_type);
            return (
              <View key={`${swap.item_type}-${swap.color}-${idx}`} style={styles.swapCard}>
                {img ? (
                  <Image source={{ uri: img }} style={styles.swapImage} />
                ) : (
                  <View style={[styles.swapImage, styles.swapPlaceholder]}>
                    <Text style={styles.swapPlaceholderText}>No closet match</Text>
                  </View>
                )}
                <View style={styles.swapBody}>
                  <Text style={styles.swapTitle}>{swap.item_type}</Text>
                  <Text style={styles.swapReason}>{swap.reason}</Text>
                  <Text style={styles.swapColor}>Suggested color: {swap.color}</Text>
                  <View style={styles.swapActions}>
                    <Pressable style={styles.swapBtn} onPress={() => {}}>
                      <Text>Use This Swap</Text>
                    </Pressable>
                    <Pressable
                      style={styles.swapBtn}
                      onPress={() => {
                        safeAsync(async () => recordSwapRequest('fitcheck', swap.item_type, 'Not for me'), 'FitCheckScreen.swapRejectCard');
                      }}
                    >
                      <Text>Not for me</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
        </>
      ) : null}

      {report && !ratingCaptured ? (
        <View style={styles.rating}>
          <Text>Did this match how you felt?</Text>
          <View style={styles.row}>
            <Pressable style={styles.pill} onPress={() => onRate('loved')}><Text>😍 Loved it</Text></Pressable>
            <Pressable style={styles.pill} onPress={() => onRate('fine')}><Text>👍 It was fine</Text></Pressable>
            <Pressable style={styles.pill} onPress={() => onRate('notGreat')}><Text>😐 Not great</Text></Pressable>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff' },
  counter: { fontWeight: '700' },
  btn: { marginTop: 10, backgroundColor: '#0f766e', padding: 12, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  pulseCard: { marginTop: 12, borderRadius: 12, backgroundColor: '#e0f2fe', padding: 14 },
  loading: { color: '#0369a1', fontWeight: '800', fontSize: 16 },
  loadingSub: { marginTop: 4, color: '#075985' },
  swapHeader: { marginTop: 14, fontWeight: '800', color: '#0f172a' },
  swapCard: { marginTop: 8, flexDirection: 'row', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, overflow: 'hidden' },
  swapImage: { width: 88, height: 88, backgroundColor: '#e5e7eb' },
  swapPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  swapPlaceholderText: { color: '#64748b', fontSize: 11, textAlign: 'center', paddingHorizontal: 4 },
  swapBody: { flex: 1, padding: 10 },
  swapTitle: { fontWeight: '800', textTransform: 'capitalize' },
  swapReason: { marginTop: 2, color: '#334155' },
  swapColor: { marginTop: 2, color: '#0f766e', fontWeight: '600' },
  swapActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  swapBtn: { backgroundColor: '#e2e8f0', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  rating: { marginTop: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  pill: { backgroundColor: '#e2e8f0', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
});

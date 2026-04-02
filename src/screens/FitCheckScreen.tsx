import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Animated } from 'react-native';
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
          <FitReport
            report={report}
            onSwapUse={(itemType) => {
              safeAsync(async () => recordSwapRequest('fitcheck', itemType, 'Use This Swap'), 'FitCheckScreen.swapUse');
            }}
            onSwapReject={(itemType) => {
              safeAsync(async () => recordSwapRequest('fitcheck', itemType, 'Not for me'), 'FitCheckScreen.swapRejectInline');
            }}
            onRate={onRate}
            ratingCaptured={ratingCaptured}
            swapImageUri={report.swap_suggestions[0] ? resolveSwapImage(report.swap_suggestions[0].item_type) : null}
          />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#131313', paddingBottom: 30 },
  counter: { color: '#d0c5b5', fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  btn: { marginTop: 10, backgroundColor: '#2a2a2a', padding: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#4d463a' },
  btnText: { color: '#e6c487', fontFamily: 'Inter_700Bold', fontSize: 14 },
  pulseCard: { marginTop: 12, borderRadius: 12, backgroundColor: '#201f1f', padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  loading: { color: '#e6c487', fontFamily: 'Inter_700Bold', fontSize: 16 },
  loadingSub: { marginTop: 4, color: '#d0c5b5', fontFamily: 'Inter_400Regular' },
});

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Animated, Alert, Platform, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { FitReport } from '../components/FitReport';
import { getGeminiUsageStatus, runFitCheck } from '../services/gemini';
import { useUserStore } from '../store/useUserStore';
import { recordFitCheckRating, recordSwapRequest } from '../services/feedbackEngine';
import { safeAsync } from '../utils/safeAsync';
import { ErrorCard } from '../components/ErrorCard';
import { useClosetStore } from '../store/useClosetStore';
import { useResponsive } from '../utils/responsive';

type FitCheckErrorKind = 'timeout' | 'rateLimit' | 'offline' | 'invalidJson' | 'networkFail';

const PRE_UPLOAD_METRICS = [
  { key: 'skin', label: 'Skin Tone Match', value: '--/10', verdict: 'Awaiting photo' },
  { key: 'color', label: 'Color Harmony', value: '--/10', verdict: 'Awaiting photo' },
  { key: 'proportion', label: 'Proportion', value: '--/10', verdict: 'Awaiting photo' },
];

const PRE_UPLOAD_TIPS = [
  'Upload a full outfit photo in clear lighting.',
  'Include top, bottom, and visible footwear when possible.',
  'Stand against a simple background for cleaner analysis.',
];

const TAB_BAR_CLEARANCE = 92;

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
    title: 'Incomplete AI response',
    description: 'Could not read a full report. Try once more.',
    action: 'Retry',
  },
  networkFail: {
    icon: '🔄',
    title: 'Connection failed',
    description: 'Please try again.',
    action: 'Retry',
  },
};

export default function FitCheckScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { rs, width, compact } = useResponsive();
  const profile = useUserStore((s) => s.profile);
  const closetItems = useClosetStore((s) => s.items);
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState(60);
  const [fitId, setFitId] = useState<string>('');
  const [uploadedImageUri, setUploadedImageUri] = useState<string | null>(null);
  const [report, setReport] = useState<Awaited<ReturnType<typeof runFitCheck>>['result'] | null>(null);
  const [errorKind, setErrorKind] = useState<FitCheckErrorKind | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [resetInText, setResetInText] = useState<string>('Xh Ym');
  const [ratingCaptured, setRatingCaptured] = useState(false);
  const transition = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    Animated.timing(transition, {
      toValue: report ? 1 : 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [report, transition]);

  const counterColor = useMemo(() => {
    if (remaining < 10) return '#dc2626';
    if (remaining <= 30) return '#ea580c';
    return '#e6c487';
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

  useFocusEffect(
    React.useCallback(() => {
      let alive = true;

      safeAsync(async () => getGeminiUsageStatus(), 'FitCheckScreen.loadUsage').then((result) => {
        if (!alive || !result.data) return;
        setRemaining(result.data.remaining);
        setResetInText(result.data.resetIn);
      });

      return () => {
        alive = false;
      };
    }, [])
  );

  const pickWebImage = async (): Promise<string | null> => {
    if (Platform.OS !== 'web') return null;

    const host = globalThis as unknown as {
      document?: {
        createElement: (tag: string) => {
          type: string;
          accept: string;
          onchange: ((this: unknown, ev: unknown) => void) | null;
          click: () => void;
          files?: ArrayLike<unknown>;
        };
      };
      URL?: {
        createObjectURL: (file: unknown) => string;
      };
    };

    const documentRef = host.document;
    const urlRef = host.URL;
    if (!documentRef || !urlRef) return null;

    return new Promise<string | null>((resolve) => {
      const input = documentRef.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      let resolved = false;
      const cleanup = () => {
        if (typeof globalThis.removeEventListener === 'function') {
          globalThis.removeEventListener('focus', onFocus);
        }
      };
      const onFocus = () => {
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            cleanup();
            resolve(null);
          }
        }, 300);
      };
      input.onchange = () => {
        resolved = true;
        cleanup();
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        resolve(urlRef.createObjectURL(file));
      };
      if (typeof globalThis.addEventListener === 'function') {
        globalThis.addEventListener('focus', onFocus);
      }
      input.click();
    });
  };

  const pickFromCameraNative = async (): Promise<string | null> => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera permission needed', 'Please allow camera access to take a photo.');
        return null;
      }
      const res = await ImagePicker.launchCameraAsync({ quality: 1, mediaTypes: ['images'] });
      return res.canceled ? null : res.assets[0].uri;
    } catch (error) {
      console.error('[Screen] Error:', error);
      return null;
    }
  };

  const pickFromGalleryNative = async (): Promise<string | null> => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Gallery permission needed', 'Please allow photo access to choose an outfit image.');
        return null;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      return res.canceled ? null : res.assets[0].uri;
    } catch (error) {
      console.error('[Screen] Error:', error);
      return null;
    }
  };

  const runCheckForImage = async (uri: string | null): Promise<void> => {
    if (!profile || !uri) {
      setReport(null);
      setFitId('');
      return;
    }

    setReport(null);
    setFitId('');
    setUploadedImageUri(uri);
    setLoading(true);
    setErrorKind(null);
    setErrorMessage('');
    setRatingCaptured(false);

    const { data: checked, error } = await safeAsync(async () => runFitCheck(uri, profile), 'FitCheckScreen.runFitCheck');
    setLoading(false);

    if (error || !checked) {
      const lower = (error ?? '').toLowerCase();
      setErrorMessage(error ?? '');
      setReport(null);
      setFitId('');
      if (lower.includes('limit') || lower.includes('60')) setErrorKind('rateLimit');
      else if (lower.includes('long') || lower.includes('timeout')) setErrorKind('timeout');
      else if (lower.includes('offline') || lower.includes('internet')) setErrorKind('offline');
      else if (lower.includes('full fit report') || lower.includes('empty response')) setErrorKind('invalidJson');
      else setErrorKind('networkFail');
      return;
    }

    setReport(checked.result);
    setUploadedImageUri(uri);
    setRemaining(checked.remaining);
    setResetInText((prev) => prev || 'Xh Ym');
    setFitId(`fit-${Date.now()}`);

    if (checked.result.one_line_verdict.toLowerCase().includes('partial')) {
      setErrorKind('invalidJson');
    }
  };

  const uploadFromCamera = async (): Promise<void> => {
    const { data } = await safeAsync(
      async () => (Platform.OS === 'web' ? pickWebImage() : pickFromCameraNative()),
      'FitCheckScreen.pickImageCamera'
    );
    await runCheckForImage(data ?? null);
  };

  const uploadFromGallery = async (): Promise<void> => {
    const { data } = await safeAsync(
      async () => (Platform.OS === 'web' ? pickWebImage() : pickFromGalleryNative()),
      'FitCheckScreen.pickImageGallery'
    );
    await runCheckForImage(data ?? null);
  };

  const promptRetrySource = (): void => {
    if (Platform.OS === 'web') {
      void uploadFromGallery();
      return;
    }

    Alert.alert('Retry fit check', 'Choose a source for another outfit photo.', [
      { text: 'Camera', onPress: () => { void uploadFromCamera(); } },
      { text: 'Gallery', onPress: () => { void uploadFromGallery(); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const onRate = (rating: 'loved' | 'fine' | 'notGreat'): void => {
    if (ratingCaptured) return;
    setRatingCaptured(true);
    safeAsync(async () => recordFitCheckRating(fitId, rating), 'FitCheckScreen.rateFitCheck');
  };

  const onErrorAction = (): void => {
    if (errorKind === 'timeout' || errorKind === 'networkFail' || errorKind === 'invalidJson') {
      promptRetrySource();
      return;
    }
    setErrorKind(null);
  };

  const rateLimitDescription = errorKind === 'rateLimit'
    ? `Resets in ${parseResetCountdown(errorMessage || `Resets in ${resetInText}`)}`
    : '';
  const lowerError = errorMessage.toLowerCase();
  const isGeminiQuotaExhausted = lowerError.includes('quota') || lowerError.includes('limit:0') || lowerError.includes('free_tier');
  const rateLimitTitle = isGeminiQuotaExhausted ? 'Gemini quota exhausted for this key' : ERROR_CARD_CONFIG.rateLimit.title;
  const rateLimitBody = isGeminiQuotaExhausted
    ? 'This API key hit Gemini free-tier quota. Add your own Gemini key or wait for quota reset.'
    : rateLimitDescription;

  const showPreUpload = !report && !loading;
  const showAnalyzingPlaceholder = loading && !report;
  const showPostUpload = Boolean(report);
  const usageProgress = Math.max(0, Math.min(100, (remaining / 60) * 100));

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        {
          paddingHorizontal: rs(16, 12, 22),
          paddingTop: Math.max(rs(8, 4, 12), insets.top + 6),
          paddingBottom: Math.max(140, insets.bottom + TAB_BAR_CLEARANCE + 34),
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.contentWrap, width >= 900 ? styles.contentWrapWide : null]}>
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            <View style={styles.avatarWrap}>
              {profile?.skinImagePath ? (
                <Image source={{ uri: profile.skinImagePath }} style={styles.avatar} resizeMode="cover" />
              ) : (
                <MaterialIcons name="person" size={16} color="#d0c5b5" />
              )}
            </View>
            <Text style={styles.topTitle}>FitCheck</Text>
          </View>
        </View>

        <View style={styles.usageWrap}>
          <View style={styles.usageMetaRow}>
            <Text style={styles.usageLabel}>Usage Limit</Text>
            <Text style={[styles.counter, { color: counterColor }]}>{remaining} / 60 free checks remaining</Text>
          </View>
          <View style={styles.usageTrack}>
            <View style={[styles.usageFill, { width: `${usageProgress}%` }]} />
          </View>
        </View>

        {showPreUpload ? (
          <View style={styles.uploadPanel}>
            <View style={styles.uploadIconCircle}>
              <MaterialIcons name="cloud-upload" size={40} color="#c9a96e" />
            </View>
            <Text style={[styles.uploadTitle, compact ? styles.uploadTitleCompact : null]}>Upload a photo of your outfit</Text>
            <Text style={styles.uploadSubtitle}>Get instant feedback on color harmony, skin tone match, and proportions.</Text>
            <View style={[styles.uploadActions, compact ? styles.uploadActionsCompact : null]}>
              <Pressable style={styles.btnPrimary} onPress={uploadFromCamera}>
                <MaterialIcons name="photo-camera" size={18} color="#261900" />
                <Text style={styles.btnPrimaryText}>Take Photo</Text>
              </Pressable>
              <Pressable style={styles.btnSecondary} onPress={uploadFromGallery}>
                <MaterialIcons name="photo-library" size={18} color="#e6c487" />
                <Text style={styles.btnSecondaryText}>Choose from Gallery</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.uploadedPhotoCard}>
            {uploadedImageUri ? (
              <Image source={{ uri: uploadedImageUri }} style={styles.uploadedPhoto} resizeMode="cover" />
            ) : (
              <View style={styles.uploadedPhotoFallback}>
                <MaterialIcons name="image-not-supported" size={26} color="#d0c5b5" />
                <Text style={styles.uploadedPhotoFallbackText}>Photo preview unavailable</Text>
              </View>
            )}
            <Text style={styles.uploadedPhotoLabel}>Your uploaded outfit</Text>
            <View style={styles.postUploadActionsRow}>
              <Pressable style={[styles.postUploadBtn, styles.postUploadBtnPrimary]} onPress={uploadFromCamera}>
                <MaterialIcons name="photo-camera" size={16} color="#261900" />
                <Text style={styles.postUploadBtnPrimaryText}>Retake</Text>
              </Pressable>
              <Pressable style={[styles.postUploadBtn, styles.postUploadBtnSecondary]} onPress={uploadFromGallery}>
                <MaterialIcons name="photo-library" size={16} color="#e6c487" />
                <Text style={styles.postUploadBtnSecondaryText}>Choose another</Text>
              </Pressable>
            </View>
          </View>
        )}

        {loading ? (
          <Animated.View style={[styles.pulseCard, { opacity: pulse }]}>
            <Text style={styles.loading}>Analyzing your outfit...</Text>
            <Text style={styles.loadingSub}>This takes about 5-10 seconds</Text>
          </Animated.View>
        ) : null}

        {showAnalyzingPlaceholder ? (
          <View style={styles.analyzingWrap}>
            <View style={styles.analyzingOverallCard}>
              <Text style={styles.analyzingLabel}>OVERALL STYLE SCORE</Text>
              <Text style={styles.analyzingValue}>--/10</Text>
              <Text style={styles.analyzingSub}>Refreshing scores for your new photo...</Text>
            </View>

            <View style={styles.analyzingMetricsStack}>
              {PRE_UPLOAD_METRICS.map((metric) => (
                <View key={`loading-${metric.key}`} style={styles.analyzingMetricCard}>
                  <View style={styles.analyzingMetricTop}>
                    <Text style={styles.preMetricLabel}>{metric.label}</Text>
                    <Text style={styles.analyzingMetricStatus}>Analyzing</Text>
                  </View>
                  <View style={styles.analyzingBarTrack}>
                    <Animated.View style={[styles.analyzingBarFill, { opacity: pulse }]} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {errorKind ? (
          <ErrorCard
            icon={ERROR_CARD_CONFIG[errorKind].icon}
            title={errorKind === 'rateLimit' ? rateLimitTitle : ERROR_CARD_CONFIG[errorKind].title}
            description={errorKind === 'rateLimit' ? rateLimitBody : ERROR_CARD_CONFIG[errorKind].description}
            actionText={ERROR_CARD_CONFIG[errorKind].action}
            onAction={onErrorAction}
          />
        ) : null}

        {showPreUpload ? (
          <Animated.View
            style={[
              styles.preUploadWrap,
              {
                opacity: transition.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                transform: [{ translateY: transition.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }) }],
              },
            ]}
          >
            <View style={styles.preOverallCard}>
              <Text style={styles.preOverallLabel}>OVERALL STYLE SCORE</Text>
              <Text style={[styles.preOverallValue, compact ? styles.preOverallValueCompact : null]}>--/10</Text>
            </View>

            <View style={styles.preMetricsStack}>
              {PRE_UPLOAD_METRICS.map((metric) => (
                <View key={metric.key} style={styles.preMetricCard}>
                  <View style={styles.preMetricTop}>
                    <Text style={styles.preMetricLabel}>{metric.label}</Text>
                    <Text style={styles.preMetricVerdict}>{metric.verdict}</Text>
                  </View>
                  <Text style={styles.preMetricValue}>{metric.value}</Text>
                </View>
              ))}
            </View>

            <View style={styles.preTipsCard}>
              <Text style={styles.preTipsTitle}>Before You Upload</Text>
              {PRE_UPLOAD_TIPS.map((tip) => (
                <Text key={tip} style={styles.preTipItem}>- {tip}</Text>
              ))}
            </View>
          </Animated.View>
        ) : null}

        {showPostUpload && report ? (
          <Animated.View
            style={[
              styles.postUploadWrap,
              {
                opacity: transition,
                transform: [{ translateY: transition.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
              },
            ]}
          >
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
              swapImageUri={report.swap_suggestions?.[0] ? resolveSwapImage(report.swap_suggestions[0].item_type) : null}
            />
          </Animated.View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#131313', paddingBottom: 30 },
  contentWrap: {
    width: '100%',
    alignSelf: 'center',
    gap: 2,
  },
  contentWrapWide: {
    maxWidth: 760,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: '#353534',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  topTitle: {
    color: '#e6c487',
    fontFamily: 'NotoSerif_700Bold_Italic',
    fontSize: 32,
    letterSpacing: -0.7,
  },
  usageWrap: {
    marginTop: 6,
    marginBottom: 10,
    gap: 8,
  },
  usageMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  usageLabel: {
    color: '#d0c5b5',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  usageTrack: {
    height: 6,
    width: '100%',
    borderRadius: 999,
    backgroundColor: '#201f1f',
    overflow: 'hidden',
  },
  usageFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#e6c487',
  },
  counter: { color: '#d0c5b5', fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  uploadPanel: {
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 22,
    borderRadius: 16,
    backgroundColor: '#201f1f',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(230,196,135,0.35)',
    alignItems: 'center',
  },
  uploadIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    marginBottom: 14,
    backgroundColor: 'rgba(201,169,110,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTitle: { color: '#e5e2e1', fontFamily: 'NotoSerif_700Bold', fontSize: 32, marginBottom: 6, textAlign: 'center' },
  uploadTitleCompact: { fontSize: 20 },
  uploadSubtitle: { color: '#d0c5b5', fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 320 },
  uploadActions: {
    marginTop: 14,
    width: '100%',
    gap: 10,
  },
  uploadActionsCompact: {
    gap: 8,
  },
  btnPrimary: {
    height: 44,
    borderRadius: 999,
    backgroundColor: '#e6c487',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnPrimaryText: {
    color: '#261900',
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
  },
  btnSecondary: {
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(230,196,135,0.25)',
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnSecondaryText: {
    color: '#e6c487',
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
  pulseCard: { marginTop: 12, borderRadius: 12, backgroundColor: '#201f1f', padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  loading: { color: '#e6c487', fontFamily: 'Inter_700Bold', fontSize: 16 },
  loadingSub: { marginTop: 4, color: '#d0c5b5', fontFamily: 'Inter_400Regular' },
  preUploadWrap: {
    marginTop: 14,
    gap: 12,
  },
  preOverallCard: {
    borderRadius: 14,
    backgroundColor: '#201f1f',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    alignItems: 'center',
  },
  preOverallLabel: {
    color: '#d0c5b5',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  preOverallValue: {
    marginTop: 8,
    color: '#998f81',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 40,
    lineHeight: 44,
  },
  preOverallValueCompact: {
    fontSize: 34,
    lineHeight: 38,
  },
  preMetricsStack: {
    gap: 10,
  },
  preMetricCard: {
    borderRadius: 12,
    backgroundColor: '#201f1f',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    padding: 14,
  },
  preMetricTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  preMetricLabel: {
    color: '#d0c5b5',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  preMetricVerdict: {
    color: '#998f81',
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  preMetricValue: {
    marginTop: 8,
    color: '#998f81',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 28,
  },
  preTipsCard: {
    borderRadius: 12,
    backgroundColor: 'rgba(201,169,110,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(230,196,135,0.25)',
    padding: 14,
    gap: 8,
  },
  preTipsTitle: {
    color: '#e6c487',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  preTipItem: {
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
  },
  analyzingWrap: {
    marginTop: 14,
    gap: 10,
  },
  analyzingOverallCard: {
    borderRadius: 14,
    backgroundColor: '#201f1f',
    borderWidth: 1,
    borderColor: 'rgba(230,196,135,0.28)',
    padding: 16,
    alignItems: 'center',
  },
  analyzingLabel: {
    color: '#d0c5b5',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  analyzingValue: {
    marginTop: 8,
    color: '#998f81',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 36,
    lineHeight: 40,
  },
  analyzingSub: {
    marginTop: 6,
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  analyzingMetricsStack: {
    gap: 10,
  },
  analyzingMetricCard: {
    borderRadius: 12,
    backgroundColor: '#201f1f',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    padding: 14,
    gap: 8,
  },
  analyzingMetricTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  analyzingMetricStatus: {
    color: '#e6c487',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  analyzingBarTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#2a2a2a',
    overflow: 'hidden',
  },
  analyzingBarFill: {
    width: '65%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#e6c487',
  },
  postUploadWrap: {
    marginTop: 14,
  },
  uploadedPhotoCard: {
    marginTop: 6,
    borderRadius: 16,
    padding: 10,
    backgroundColor: '#201f1f',
    borderWidth: 1,
    borderColor: 'rgba(230,196,135,0.28)',
    gap: 8,
  },
  uploadedPhoto: {
    width: '100%',
    height: 260,
    borderRadius: 12,
    backgroundColor: '#353534',
  },
  uploadedPhotoFallback: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  uploadedPhotoFallbackText: {
    color: '#d0c5b5',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  uploadedPhotoLabel: {
    color: '#d0c5b5',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingHorizontal: 2,
  },
  postUploadActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  postUploadBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  postUploadBtnPrimary: {
    backgroundColor: '#e6c487',
  },
  postUploadBtnSecondary: {
    borderWidth: 1,
    borderColor: 'rgba(230,196,135,0.25)',
    backgroundColor: '#2a2a2a',
  },
  postUploadBtnPrimaryText: {
    color: '#261900',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  postUploadBtnSecondaryText: {
    color: '#e6c487',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  resultBanner: {
    borderRadius: 14,
    backgroundColor: 'rgba(201,169,110,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(230,196,135,0.25)',
    padding: 14,
  },
  resultBannerKicker: {
    color: '#e6c487',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  resultBannerText: {
    marginTop: 6,
    color: '#e5e2e1',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 18,
    lineHeight: 24,
  },
});

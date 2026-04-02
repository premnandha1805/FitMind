import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  useWindowDimensions,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { NavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserStore } from '../store/useUserStore';
import { useClosetStore } from '../store/useClosetStore';
import { executeSqlWithRetry, getAll, getOne } from '../db/queries';
import { detectTasteInsights, getLearningProgress, recalculateTasteWeights } from '../services/feedbackEngine';
import { getTasteProfile } from '../services/tasteEngine';
import { getCacheHitRate, requestLog } from '../services/requestManager';
import { safeAsync } from '../utils/safeAsync';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { TasteInsight, TasteProfile } from '../types/models';
import { useResponsive } from '../utils/responsive';

const palette = ['#1b2a49', '#7a1f3d', '#0f8b5f', '#ff7f50', '#d4a017', '#008080', '#000000', '#ffffff'];
const patternOptions = ['Solid', 'Stripes', 'Checks', 'Florals', 'Abstract', 'Minimal Print'];
const fitOptions: Array<TasteProfile['fitPreference']> = ['relaxed', 'fitted'];
const identityOptions: Array<TasteProfile['styleIdentity']> = ['minimal', 'classic', 'bold', 'traditional'];

export default function ProfileScreen(): React.JSX.Element {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { compact, rs } = useResponsive();
  const navigation = useNavigation<NavigationProp<RootStackParamList & MainTabParamList>>();
  const user = useUserStore((s) => s.profile);
  const items = useClosetStore((s) => s.items);
  const savePreferences = useUserStore((s) => s.savePreferences);

  const [blocked, setBlocked] = useState<Array<{ id: string; pattern_type: string }>>([]);
  const [lovedColors, setLovedColors] = useState<string[]>([]);
  const [preferredPatterns, setPreferredPatterns] = useState<string[]>([]);
  const [insights, setInsights] = useState<TasteInsight[]>([]);
  const [learningProgress, setLearningProgress] = useState<{ count: number; nextMilestone: number; accuracyTrend: 'improving' | 'stable' } | null>(null);
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [tasteProfile, setTasteProfile] = useState<TasteProfile | null>(null);
  const [fitPreference, setFitPreference] = useState<TasteProfile['fitPreference']>('relaxed');
  const [styleIdentity, setStyleIdentity] = useState<TasteProfile['styleIdentity']>('classic');
  const [settingsHovered, setSettingsHovered] = useState(false);
  const [settingsPressed, setSettingsPressed] = useState(false);
  const [retakeHovered, setRetakeHovered] = useState(false);
  const [glowHovered, setGlowHovered] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const showToast = (message: string): void => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return;
    }
    Alert.alert('FitMind', message);
  };

  useFocusEffect(
    useCallback(() => {
      safeAsync(async () => {
        const [rows, loadedInsights, progress, tasteRow, prefRow] = await Promise.all([
          getAll<{ id: string; pattern_type: string }>('SELECT id, pattern_type FROM blocked_patterns ORDER BY blocked_at DESC;'),
          detectTasteInsights(),
          getLearningProgress(),
          getTasteProfile(),
          getOne<{ loved_colors: string; disliked_colors: string }>('SELECT loved_colors, disliked_colors FROM explicit_preferences WHERE id = ?;', ['prefs']),
        ]);

        const rawFeedbackCount = await getOne<{ feedback_count: number }>('SELECT feedback_count FROM taste_profile WHERE id = ?;', ['taste']);
        const count = rawFeedbackCount?.feedback_count ?? 0;

        setBlocked(rows);
        setInsights(loadedInsights.slice(0, 5));
        setLearningProgress(progress);
        setTasteProfile(tasteRow);
        setFitPreference(tasteRow?.fitPreference ?? 'relaxed');
        setStyleIdentity(tasteRow?.styleIdentity ?? 'classic');
        setPreferredPatterns(tasteRow?.lovedPatterns ?? []);
        setFeedbackCount(count);
        setLovedColors(JSON.parse(prefRow?.loved_colors ?? '[]') as string[]);
      }, 'ProfileScreen.focusLoad');
    }, [])
  );

  const interactions = learningProgress?.count ?? 0;
  const nextMilestone = learningProgress?.nextMilestone ?? 5;
  const previousMilestone = Math.max(0, nextMilestone - 5);
  const progressValue = Math.min(100, Math.max(0, ((interactions - previousMilestone) / 5) * 100));
  const contentPadding = rs(16, 12, 24);
  const topCardWidth = compact ? width - contentPadding * 2 : (width - contentPadding * 2 - 16) / 2;
  const insightCols = compact ? 1 : width >= 900 ? 3 : 2;
  const insightCardWidth = (width - contentPadding * 2 - 12 * (insightCols - 1)) / insightCols;
  const headerHeight = Math.max(64, insets.top + rs(54, 50, 64));

  useEffect(() => {
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: progressValue,
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [progressAnim, progressValue]);

  const learningLevel = useMemo(() => {
    if (interactions >= 20) return 'Lvl 5 Visionary';
    if (interactions >= 15) return 'Lvl 4 Curator';
    if (interactions >= 10) return 'Lvl 3 Stylist';
    if (interactions >= 5) return 'Lvl 2 Explorer';
    return 'Lvl 1 Starter';
  }, [interactions]);

  const apiCallsThisSession = requestLog.filter((entry) => !entry.cacheHit).length;
  const cacheHitRate = getCacheHitRate();

  const cycleFitPreference = (): void => {
    const index = fitOptions.indexOf(fitPreference);
    const next = fitOptions[(index + 1) % fitOptions.length];
    setFitPreference(next);
  };

  const cycleStyleIdentity = (): void => {
    const index = identityOptions.indexOf(styleIdentity);
    const next = identityOptions[(index + 1) % identityOptions.length];
    setStyleIdentity(next);
  };

  const saveProfilePrefs = (): void => {
    safeAsync(async () => {
      await savePreferences({
        lovedColors,
        dislikedColors: tasteProfile?.dislikedColors ?? [],
        lovedPatterns: preferredPatterns,
        dislikedPatterns: tasteProfile?.dislikedPatterns ?? [],
        fitPreference,
        styleIdentity,
      });
      await recalculateTasteWeights();
      showToast('Preferences saved and style weights updated.');
    }, 'ProfileScreen.savePreferences');
  };

  const openSettingsMenu = (): void => {
    Alert.alert('Profile settings', 'Choose what you want to manage.', [
      {
        text: 'Retake Skin Tone',
        onPress: () => navigation.navigate('SkinTone', { returnToProfile: true }),
      },
      {
        text: 'Open Closet',
        onPress: () => navigation.navigate('Closet'),
      },
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ]);
  };

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        {
          paddingHorizontal: contentPadding,
          paddingBottom: Math.max(28, insets.bottom + rs(18, 12, 28)),
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <BlurView
        intensity={20}
        tint="dark"
        style={[
          styles.headerBar,
          {
            height: headerHeight,
            paddingTop: insets.top,
            paddingHorizontal: rs(24, 14, 28),
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <View style={styles.headerPersonCircle}>
            <MaterialIcons name="person" size={14} color="#e6c487" />
          </View>
          <Text style={styles.headerTitle}>My Profile</Text>
        </View>

        <Pressable
          onPress={openSettingsMenu}
          onHoverIn={() => setSettingsHovered(true)}
          onHoverOut={() => setSettingsHovered(false)}
          onPressIn={() => setSettingsPressed(true)}
          onPressOut={() => setSettingsPressed(false)}
          accessibilityRole="button"
          accessibilityLabel="Open profile settings"
          style={[
            styles.settingsBtn,
            settingsHovered ? styles.settingsBtnHover : null,
            { transform: [{ scale: settingsPressed ? 0.9 : 1 }] },
          ]}
        >
          <MaterialIcons name="settings" size={18} color="#e6c487" />
        </Pressable>
      </BlurView>

      <View style={[styles.topGrid, compact ? styles.topGridCompact : null]}>
        <Pressable
          onHoverIn={() => setGlowHovered(true)}
          onHoverOut={() => setGlowHovered(false)}
          style={[styles.skinCard, { width: topCardWidth, minHeight: 160 }]}
        >
          <View
            style={[
              styles.skinGlow,
              { backgroundColor: glowHovered ? 'rgba(230,196,135,0.10)' : 'rgba(230,196,135,0.05)' },
            ]}
          />

          <View>
            <Text style={styles.miniLabel}>PERSONAL PALETTE</Text>
            <Text style={styles.skinToneName}>{`Tone ${user?.skinToneId ?? '-'}`}</Text>
            <View style={styles.undertoneBadge}>
              <Text style={styles.undertoneText}>{(user?.skinUndertone ?? 'Neutral').toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.skinBottomRow}>
            <Pressable
              onHoverIn={() => setRetakeHovered(true)}
              onHoverOut={() => setRetakeHovered(false)}
              style={{ opacity: retakeHovered ? 0.8 : 1 }}
              onPress={() => navigation.navigate('SkinTone', { returnToProfile: true })}
            >
              <View style={styles.retakeRow}>
                <MaterialIcons name="refresh" size={14} color="#e6c487" />
                <Text style={styles.retakeText}>Retake Scan</Text>
              </View>
            </Pressable>

            <View style={[styles.skinHexCircle, { backgroundColor: '#c8a27a' }]} />
          </View>
        </Pressable>

        <View style={[styles.tasteCard, { width: topCardWidth, minHeight: 160 }]}>
          <View style={styles.tasteHeaderRow}>
            <Text style={styles.miniLabel}>TASTE LEARNING</Text>
            <View style={styles.improvingBadge}>
              <Text style={styles.improvingText}>Improving</Text>
              <MaterialIcons name="north-east" size={10} color="#e6c487" />
            </View>
          </View>

          <View style={styles.interactionRow}>
            <Text style={styles.interactionCount}>{interactions}</Text>
            <Text style={styles.interactionLabel}>Interactions</Text>
          </View>

          <View style={styles.progressSection}>
            <View style={styles.progressMetaRow}>
              <Text style={styles.progressMetaText}>{learningLevel}</Text>
              <Text style={styles.progressMetaText}>Next: Style Icon</Text>
            </View>
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
                  },
                ]}
              />
            </View>
          </View>
        </View>
      </View>

      <View style={styles.sectionWrap}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Style Insights</Text>
          <View style={styles.sectionLine} />
        </View>

        {feedbackCount < 5 ? (
          <View style={styles.insightLockedCard}>
            <MaterialIcons name="auto-awesome" size={30} color="#e6c487" />
            <Text style={styles.insightTitle}>Interact with outfits to unlock insights</Text>
            <Text style={styles.insightSubtitle}>Keep liking, skipping and wearing outfits</Text>
          </View>
        ) : (
          <View style={styles.insightGrid}>
            {insights.slice(0, 6).map((insight) => (
              <View key={insight.id} style={[styles.insightCard, { width: insightCardWidth }]}>
                <MaterialIcons name="auto-awesome" size={30} color="#e6c487" style={styles.insightIcon} />
                <Text style={styles.insightCardTitle}>{insight.text.split('. ')[0]}</Text>
                <Text style={styles.insightCardSub}>{insight.text}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.sectionWrap}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Style Preferences</Text>
          <View style={styles.sectionLine} />
        </View>

        <View style={styles.preferencesBox}>
          <View>
            <Text style={styles.prefLabel}>COLOR PALETTE</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.colorsRow}
            >
              {palette.map((color) => {
                const selected = lovedColors.includes(color);
                return (
                  <Pressable
                    key={color}
                    onPress={() => setLovedColors((prev) => (prev.includes(color) ? prev.filter((x) => x !== color) : [...prev, color]))}
                    style={[styles.colorDot, { backgroundColor: color }, selected ? styles.colorDotSelected : null]}
                  />
                );
              })}
              <View style={styles.addColorBtn}>
                <MaterialIcons name="add" size={14} color="#998f81" />
              </View>
            </ScrollView>
          </View>

          <View>
            <Text style={styles.prefLabel}>PREFERRED PATTERNS</Text>
            <View style={styles.patternRow}>
              {patternOptions.map((pattern) => {
                const selected = preferredPatterns.includes(pattern);
                return (
                  <Pressable
                    key={pattern}
                    onPress={() => {
                      setPreferredPatterns((prev) => (
                        prev.includes(pattern)
                          ? prev.filter((item) => item !== pattern)
                          : [...prev, pattern]
                      ));
                    }}
                    style={[styles.patternPill, selected ? styles.patternPillSelected : null]}
                  >
                    <Text style={[styles.patternText, selected ? styles.patternTextSelected : null]}>{pattern}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.selectGrid, compact ? styles.selectGridCompact : null]}>
            <View style={styles.selectCol}>
              <Text style={styles.selectLabel}>FIT</Text>
              <Pressable style={styles.selectBox} onPress={cycleFitPreference}>
                <Text style={styles.selectText}>{fitPreference}</Text>
              </Pressable>
            </View>

            <View style={styles.selectCol}>
              <Text style={styles.selectLabel}>IDENTITY</Text>
              <Pressable style={styles.selectBox} onPress={cycleStyleIdentity}>
                <Text style={styles.selectText}>{styleIdentity}</Text>
              </Pressable>
            </View>
          </View>

          <Pressable style={styles.saveBtn} onPress={saveProfilePrefs}>
            <Text style={styles.saveBtnText}>Save Preferences</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.sectionWrap}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Blocked Patterns</Text>
          <View style={styles.sectionLine} />
        </View>

        <View style={styles.blockedContainer}>
          {!blocked.length ? <Text style={styles.blockedEmpty}>No blocked patterns.</Text> : null}
          {blocked.map((item, index) => (
            <View
              key={item.id}
              style={[
                styles.blockedItem,
                index === blocked.length - 1 ? styles.blockedItemLast : null,
              ]}
            >
              <Text style={styles.blockedName}>{item.pattern_type}</Text>
              <Pressable
                onPress={() => {
                  safeAsync(async () => {
                    await executeSqlWithRetry('DELETE FROM blocked_patterns WHERE id = ?;', [item.id]);
                    setBlocked((prev) => prev.filter((x) => x.id !== item.id));
                    showToast('Pattern unblocked - you may see it again');
                  }, 'ProfileScreen.unblockPattern');
                }}
              >
                <Text style={styles.unblockText}>UNBLOCK</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.learningMetaRow, compact ? styles.learningMetaRowCompact : null]}>
        <Text style={styles.learningMetaText}>Next milestone: {nextMilestone}</Text>
        <Text style={styles.learningMetaText}>Current step: {progressValue.toFixed(0)}%</Text>
      </View>

      {__DEV__ ? (
        <View style={styles.devDebugCard}>
          <Text style={styles.devDebugTitle}>Debug Session Stats</Text>
          <Text style={styles.devDebugLine}>Closet Stats: {items.length} items</Text>
          <Text style={styles.devDebugLine}>API calls this session: {apiCallsThisSession}</Text>
          <Text style={styles.devDebugLine}>Cache hit rate: {cacheHitRate.toFixed(0)}%</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#131313',
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  headerBar: {
    backgroundColor: 'rgba(10,10,10,0.60)',
    borderRadius: 16,
    marginTop: 10,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerPersonCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#353534',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#f5f5f5',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 20,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBtnHover: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  topGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  topGridCompact: {
    flexDirection: 'column',
  },
  skinCard: {
    backgroundColor: '#201f1f',
    borderRadius: 16,
    padding: 24,
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
  },
  skinGlow: {
    position: 'absolute',
    right: -16,
    top: -16,
    width: 96,
    height: 96,
    borderRadius: 48,
    shadowColor: '#e6c487',
    shadowOpacity: 0.9,
    shadowRadius: 48,
    shadowOffset: { width: 0, height: 0 },
  },
  miniLabel: {
    color: '#d0c5b5',
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    marginBottom: 8,
  },
  skinToneName: {
    color: '#e5e2e1',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 24,
    marginBottom: 10,
  },
  undertoneBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(84,72,44,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.15)',
    borderRadius: 9999,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  undertoneText: {
    color: '#d7c5a0',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  skinBottomRow: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  retakeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  retakeText: {
    color: '#e6c487',
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  skinHexCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 4,
    borderColor: '#353534',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  tasteCard: {
    backgroundColor: '#201f1f',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.15)',
  },
  tasteHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  improvingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 9999,
    paddingVertical: 2,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(230,196,135,0.10)',
  },
  improvingText: {
    color: '#e6c487',
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
  },
  interactionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  interactionCount: {
    color: '#e5e2e1',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 40,
    lineHeight: 42,
  },
  interactionLabel: {
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  progressSection: {
    marginTop: 24,
  },
  progressMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressMetaText: {
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
  },
  progressTrack: {
    height: 6,
    borderRadius: 9999,
    backgroundColor: '#353534',
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 9999,
    backgroundColor: '#e6c487',
  },
  sectionWrap: {
    marginTop: 28,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#e5e2e1',
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 18,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(77,70,58,0.15)',
  },
  insightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  insightCard: {
    backgroundColor: '#1c1b1b',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.15)',
    alignItems: 'center',
  },
  insightIcon: {
    marginBottom: 12,
  },
  insightCardTitle: {
    color: '#e5e2e1',
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 14,
    textAlign: 'center',
  },
  insightCardSub: {
    marginTop: 4,
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    textAlign: 'center',
  },
  insightLockedCard: {
    backgroundColor: '#1c1b1b',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.15)',
    alignItems: 'center',
  },
  insightTitle: {
    marginTop: 12,
    color: '#e5e2e1',
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 14,
    textAlign: 'center',
  },
  insightSubtitle: {
    marginTop: 4,
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    textAlign: 'center',
  },
  preferencesBox: {
    backgroundColor: '#201f1f',
    borderRadius: 16,
    padding: 24,
    gap: 32,
  },
  prefLabel: {
    color: '#d0c5b5',
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    marginBottom: 16,
  },
  colorsRow: {
    gap: 12,
    paddingBottom: 8,
    alignItems: 'center',
  },
  colorDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  colorDotSelected: {
    borderWidth: 2,
    borderColor: '#e6c487',
    shadowColor: '#201f1f',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  addColorBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#4d463a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  patternRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  patternPill: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.15)',
    borderRadius: 9999,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  patternPillSelected: {
    backgroundColor: 'rgba(230,196,135,0.20)',
    borderColor: 'rgba(230,196,135,0.30)',
  },
  patternText: {
    color: '#e5e2e1',
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  patternTextSelected: {
    color: '#e6c487',
  },
  selectGrid: {
    flexDirection: 'row',
    gap: 24,
  },
  selectGridCompact: {
    flexDirection: 'column',
    gap: 12,
  },
  selectCol: {
    flex: 1,
  },
  selectLabel: {
    color: '#d0c5b5',
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  selectBox: {
    backgroundColor: '#1c1b1b',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e6c487',
  },
  selectText: {
    color: '#e5e2e1',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    textTransform: 'capitalize',
  },
  saveBtn: {
    borderRadius: 9999,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#4d463a',
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#e6c487',
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    letterSpacing: 0.6,
  },
  blockedContainer: {
    backgroundColor: '#0e0e0e',
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.10)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  blockedItem: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(77,70,58,0.05)',
  },
  blockedItemLast: {
    borderBottomWidth: 0,
  },
  blockedName: {
    color: '#d0c5b5',
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    textTransform: 'capitalize',
  },
  unblockText: {
    color: '#e6c487',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  blockedEmpty: {
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    padding: 24,
  },
  learningMetaRow: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  learningMetaRowCompact: {
    flexDirection: 'column',
    gap: 6,
  },
  learningMetaText: {
    color: '#998f81',
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  devDebugCard: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(230,196,135,0.20)',
    backgroundColor: '#1a1713',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 4,
  },
  devDebugTitle: {
    color: '#e6c487',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  devDebugLine: {
    color: '#d0c5b5',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
});

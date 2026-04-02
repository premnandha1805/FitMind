import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import { MaterialIcons } from '@expo/vector-icons';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { OCCASION_KEYWORDS } from '../constants/occasions';
import { useClosetStore } from '../store/useClosetStore';
import { useOutfitStore } from '../store/useOutfitStore';
import { useTasteStore } from '../store/useTasteStore';
import { useUserStore } from '../store/useUserStore';
import { useResponsive } from '../utils/responsive';

function mapOccasion(input: string): string {
  const lower = input.toLowerCase();
  const hit = OCCASION_KEYWORDS.find((rule) => rule.words.some((word) => lower.includes(word)));
  return hit?.mapped ?? 'casual';
}

const occasionOptions = [
  { key: 'work', label: 'Work', icon: 'work' as const },
  { key: 'date', label: 'Date', icon: 'favorite' as const },
  { key: 'wedding', label: 'Wedding', icon: 'auto-awesome' as const },
  { key: 'party', label: 'Party', icon: 'celebration' as const },
  { key: 'travel', label: 'Travel', icon: 'flight' as const },
  { key: 'casual', label: 'Casual', icon: 'weekend' as const },
];

const scenarioChips = ['Interview', 'Rooftop', 'Gala', 'Dinner'];
const timeOptions = ['Morning', 'Afternoon', 'Evening'];
const weatherOptions = ['Warm', 'Crisp', 'Cold'];

const timeIcons: Record<string, any> = { Morning: 'wb-sunny', Afternoon: 'brightness-5', Evening: 'nights-stay' };
const weatherIcons: Record<string, any> = { Warm: 'wb-sunny', Crisp: 'cloud', Cold: 'ac-unit' };

export default function OccasionScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { compact, rs } = useResponsive();
  const [eventText, setEventText] = useState('Rooftop work social');
  const [selectedOccasion, setSelectedOccasion] = useState('work');
  const [selectedScenario, setSelectedScenario] = useState('Rooftop');
  const [timeOfDay, setTimeOfDay] = useState('Evening');
  const [weather, setWeather] = useState('Crisp');
  const [formality, setFormality] = useState(45);
  const [timeIndex, setTimeIndex] = useState(2);
  const [weatherIndex, setWeatherIndex] = useState(1);

  const mapped = useMemo(
    () => mapOccasion(`${selectedOccasion} ${selectedScenario} ${eventText}`),
    [eventText, selectedOccasion, selectedScenario]
  );

  const items = useClosetStore((s) => s.items);
  const generate = useOutfitStore((s) => s.generate);
  const best = useOutfitStore((s) => s.outfits[0] ?? null);
  const taste = useTasteStore((s) => s.profile);
  const user = useUserStore((s) => s.profile);

  const formalityTag = useMemo(() => {
    if (formality < 35) return 'Relaxed';
    if (formality < 70) return 'Smart Casual';
    return 'Black Tie';
  }, [formality]);

  const onGenerate = (): void => {
    if (!user || !taste) {
      Alert.alert('Setup Required', 'Please complete your profile setup before generating outfits.');
      return;
    }
    void generate(mapped, items, user, taste);
  };

  const onSaveOccasion = (): void => {
    Alert.alert('FitMind', `Saved: ${selectedOccasion}, ${timeOfDay}, ${weather}`);
  };

  const headerHeight = Math.max(64, insets.top + rs(54, 50, 64));

  return (
    <View style={styles.screen}>
      <BlurView
        intensity={20}
        tint="dark"
        style={[
          styles.header,
          {
            height: headerHeight,
            paddingTop: insets.top,
            paddingHorizontal: rs(24, 14, 28),
          },
        ]}
      >
        <Pressable style={styles.headerIconBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={20} color="#e6c487" />
        </Pressable>
        <Text style={styles.headerTitle}>Select Occasion</Text>
        <Pressable style={styles.headerIconBtn} onPress={() => navigation.navigate('Profile')}>
          <MaterialIcons name="person-outline" size={20} color="#e6c487" />
        </Pressable>
      </BlurView>

      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: headerHeight + rs(20, 16, 26),
            paddingHorizontal: rs(24, 14, 28),
            paddingBottom: Math.max(180, insets.bottom + rs(140, 126, 172)),
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.introCard}>
          <View style={styles.introGlow} />
          <Text style={styles.introLabel}>THEME</Text>
          <Text style={[styles.introTitle, { fontSize: rs(32, 26, 34), lineHeight: rs(38, 32, 42) }]}>Curate for the Moment</Text>
          <Text style={styles.introSub}>
            Define the essence of your next outing and let FitMind weave the perfect silhouette.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Nature of Event</Text>
          <View style={styles.grid}>
            {occasionOptions.map((option) => {
              const selected = selectedOccasion === option.key;
              return (
                <Pressable
                  key={option.key}
                  style={({ pressed }) => [
                    styles.gridCard,
                    compact ? { width: '100%' } : null,
                    selected ? styles.gridCardActive : null,
                    { transform: [{ scale: pressed ? 0.97 : 1 }] },
                  ]}
                  onPress={() => setSelectedOccasion(option.key)}
                >
                  <MaterialIcons
                    name={option.icon}
                    size={30}
                    color={selected ? '#e6c487' : '#d0c5b5'}
                  />
                  <Text style={[styles.gridText, selected ? styles.gridTextActive : null]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.formalityCard}>
          <View style={styles.formalityTop}>
            <Text style={styles.formalityLabel}>Formality Level</Text>
            <View style={styles.formalityBadge}><Text style={styles.formalityBadgeText}>{formalityTag}</Text></View>
          </View>

          <Slider
            value={formality}
            onValueChange={setFormality}
            minimumValue={0}
            maximumValue={100}
            minimumTrackTintColor="#e6c487"
            maximumTrackTintColor="#353534"
            thumbTintColor="#e6c487"
          />

          <View style={styles.formalityScale}>
            <Text style={styles.formalityScaleText}>Relaxed</Text>
            <Text style={styles.formalityScaleText}>Black Tie</Text>
          </View>
        </View>

        <View style={[styles.contextGrid, compact ? styles.contextGridCompact : null]}>
          <View style={styles.contextField}>
            <Text style={styles.contextLabel}>Time of Day</Text>
            <Pressable
              style={styles.contextPill}
              onPress={() => {
                const next = (timeIndex + 1) % timeOptions.length;
                setTimeIndex(next);
                setTimeOfDay(timeOptions[next]);
              }}
            >
              <MaterialIcons name={timeIcons[timeOfDay] || 'nights-stay'} size={18} color="#e6c487" />
              <Text style={styles.contextText}>{timeOfDay}</Text>
            </Pressable>
          </View>

          <View style={styles.contextField}>
            <Text style={styles.contextLabel}>Weather</Text>
            <Pressable
              style={styles.contextPill}
              onPress={() => {
                const next = (weatherIndex + 1) % weatherOptions.length;
                setWeatherIndex(next);
                setWeather(weatherOptions[next]);
              }}
            >
              <MaterialIcons name={weatherIcons[weather] || 'cloud'} size={18} color="#e6c487" />
              <Text style={styles.contextText}>{weather}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Specific Scenario</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {scenarioChips.map((chip) => {
              const selected = selectedScenario === chip;
              return (
                <Pressable
                  key={chip}
                  onPress={() => {
                    setSelectedScenario(chip);
                    setEventText(chip);
                  }}
                  style={[styles.chip, selected ? styles.chipActive : null]}
                >
                  <Text style={[styles.chipText, selected ? styles.chipTextActive : null]}>{chip}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.inputWrap}>
          <Text style={styles.inputLabel}>Describe your event</Text>
          <TextInput
            placeholder="Rooftop networking night"
            placeholderTextColor="#998f81"
            value={eventText}
            onChangeText={setEventText}
            style={styles.input}
          />
          <Text style={styles.detectedText}>Detected: {mapped}</Text>
        </View>

        {best ? (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>Best match for {mapped}</Text>
            <Text style={styles.resultText}>
              Perfect for {eventText || 'your event'}. The color combination is especially flattering for your tone.
            </Text>
            {best.reasons.map((reason, idx) => <Text key={`${reason}-${idx}`} style={styles.resultReason}>- {reason}</Text>)}
          </View>
        ) : null}

        <View style={styles.scrollSpacer} />
      </ScrollView>

      <BlurView
        intensity={20}
        tint="dark"
        style={[
          styles.footer,
          {
            paddingHorizontal: rs(24, 14, 28),
            paddingBottom: Math.max(20, insets.bottom + 8),
          },
        ]}
      >
        <Pressable style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }] }]} onPress={onGenerate}>
          <LinearGradient colors={['#e6c487', '#c9a96e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Generate Outfit Suggestions</Text>
          </LinearGradient>
        </Pressable>

        <Pressable style={({ pressed }) => [styles.secondaryBtn, { transform: [{ scale: pressed ? 0.98 : 1 }] }]} onPress={onSaveOccasion}>
          <Text style={styles.secondaryBtnText}>Save Occasion</Text>
        </Pressable>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#131313' },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(10,10,10,0.60)',
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#201f1f',
  },
  headerTitle: {
    color: '#e6c487',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 20,
  },
  container: {
    paddingTop: 84,
    paddingHorizontal: 24,
    paddingBottom: 180,
  },
  introCard: {
    marginBottom: 28,
    backgroundColor: '#201f1f',
    borderRadius: 16,
    padding: 24,
    overflow: 'hidden',
  },
  introGlow: {
    position: 'absolute',
    right: -48,
    top: -48,
    width: 192,
    height: 192,
    borderRadius: 96,
    backgroundColor: 'rgba(230,196,135,0.05)',
  },
  introLabel: {
    color: '#e6c487',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 2.2,
    marginBottom: 10,
  },
  introTitle: {
    color: '#e5e2e1',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 32,
    lineHeight: 38,
    marginBottom: 10,
  },
  introSub: {
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 22,
  },
  section: { marginBottom: 28 },
  sectionLabel: {
    color: '#d0c5b5',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridCard: {
    width: '48%',
    minHeight: 92,
    borderRadius: 16,
    backgroundColor: '#201f1f',
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  gridCardActive: {
    backgroundColor: 'rgba(230,196,135,0.10)',
    borderColor: 'rgba(230,196,135,0.40)',
  },
  gridText: {
    color: '#e5e2e1',
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  gridTextActive: { color: '#e6c487' },
  formalityCard: {
    marginBottom: 28,
    borderRadius: 16,
    backgroundColor: '#1c1b1b',
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.10)',
    padding: 20,
  },
  formalityTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  formalityLabel: {
    color: '#d0c5b5',
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  formalityBadge: {
    borderRadius: 9999,
    backgroundColor: 'rgba(230,196,135,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  formalityBadgeText: {
    color: '#d7c5a0',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  formalityScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  formalityScaleText: {
    color: '#998f81',
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  contextGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },
  contextGridCompact: {
    flexDirection: 'column',
  },
  contextField: { flex: 1, gap: 8 },
  contextLabel: {
    color: '#998f81',
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    paddingLeft: 4,
  },
  contextPill: {
    borderRadius: 9999,
    backgroundColor: '#1c1b1b',
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.20)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contextText: {
    color: '#e5e2e1',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  chipsRow: {
    gap: 12,
    paddingBottom: 8,
  },
  chip: {
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.30)',
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  chipActive: {
    borderColor: 'rgba(230,196,135,0.30)',
    backgroundColor: 'rgba(230,196,135,0.10)',
  },
  chipText: {
    color: '#e5e2e1',
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  chipTextActive: {
    color: '#e6c487',
    fontFamily: 'Inter_600SemiBold',
  },
  inputWrap: {
    marginBottom: 22,
  },
  inputLabel: {
    color: '#d0c5b5',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  input: {
    backgroundColor: '#1c1b1b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.20)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#e5e2e1',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  detectedText: {
    marginTop: 8,
    color: '#998f81',
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  resultCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.15)',
    backgroundColor: '#201f1f',
    padding: 16,
  },
  resultTitle: {
    color: '#e6c487',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 18,
    marginBottom: 8,
    textTransform: 'capitalize',
  },
  resultText: {
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 22,
  },
  resultReason: {
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    marginTop: 8,
    lineHeight: 20,
  },
  scrollSpacer: { height: 24 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(229,226,225,0.05)',
    backgroundColor: 'rgba(19,19,19,0.90)',
    paddingTop: 14,
    paddingBottom: 20,
    gap: 10,
  },
  primaryBtn: {
    borderRadius: 9999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#261900',
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  secondaryBtn: {
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.20)',
    backgroundColor: '#2a2a2a',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: '#e5e2e1',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
});

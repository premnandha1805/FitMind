import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/types';
import { useUserStore } from '../store/useUserStore';

type Props = StackScreenProps<RootStackParamList, 'StylePreferences'>;

const COLOR_SWATCHES = [
  { name: 'Black', hex: '#0E0E0E' },
  { name: 'Ivory', hex: '#E5E2E1' },
  { name: 'Navy', hex: '#374669' },
  { name: 'Espresso', hex: '#4A3228' },
  { name: 'Olive', hex: '#5A4312' },
  { name: 'Gold', hex: '#C9A96E' },
  { name: 'Burgundy', hex: '#690005' },
  { name: 'Charcoal', hex: '#353534' },
] as const;

const PATTERN_OPTIONS = [
  { value: 'solid', label: 'Solid only' },
  { value: 'subtle', label: 'Subtle prints' },
  { value: 'bold', label: 'Bold patterns' },
  { value: 'all', label: 'All patterns' },
] as const;

const FIT_OPTIONS = [
  {
    value: 'relaxed',
    label: 'Relaxed',
    icon: 'weekend',
    colors: ['#3a2f25', '#181818'] as const,
  },
  {
    value: 'fitted',
    label: 'Fitted',
    icon: 'checkroom',
    colors: ['#25313f', '#181818'] as const,
  },
] as const;

const STYLE_OPTIONS = [
  {
    value: 'minimal',
    title: 'Minimal',
    description: 'Clean lines, quiet palettes, and effortless restraint.',
    icon: 'filter-drama',
  },
  {
    value: 'classic',
    title: 'Classic',
    description: 'Timeless staples, polished structure, and elegant balance.',
    icon: 'history-edu',
  },
  {
    value: 'bold',
    title: 'Bold',
    description: 'High contrast, statement details, and fearless silhouettes.',
    icon: 'rocket-launch',
  },
  {
    value: 'traditional',
    title: 'Traditional',
    description: 'Heritage textures, rooted forms, and crafted richness.',
    icon: 'architecture',
  },
] as const;

export default function StylePreferencesScreen({ navigation }: Props): React.JSX.Element {
  const savePreferences = useUserStore((s) => s.savePreferences);
  const profile = useUserStore((s) => s.profile);
  const saveProfile = useUserStore((s) => s.saveProfile);
  const [lovedColors, setLovedColors] = useState<string[]>([]);
  const [patternMode, setPatternMode] = useState<'solid' | 'subtle' | 'bold' | 'all'>('solid');
  const [fitPreference, setFitPreference] = useState<'relaxed' | 'fitted'>('relaxed');
  const [styleIdentity, setStyleIdentity] = useState<'minimal' | 'classic' | 'bold' | 'traditional'>('classic');
  const [saveHovered, setSaveHovered] = useState(false);
  const [savePressed, setSavePressed] = useState(false);
  const [hoveredPattern, setHoveredPattern] = useState<string | null>(null);
  const [hoveredStyle, setHoveredStyle] = useState<string | null>(null);
  const [hoveredFit, setHoveredFit] = useState<string | null>(null);
  const saveArrowX = useRef(new Animated.Value(0)).current;

  const lovedPatterns = useMemo(() => {
    if (patternMode === 'all') return ['solid', 'subtle', 'bold'];
    if (patternMode === 'solid') return ['solid'];
    if (patternMode === 'subtle') return ['subtle'];
    return ['bold'];
  }, [patternMode]);

  const saveScale = savePressed ? 0.98 : saveHovered ? 1.02 : 1;

  const onSaveHoverIn = (): void => {
    setSaveHovered(true);
    Animated.timing(saveArrowX, {
      toValue: 5,
      duration: 160,
      useNativeDriver: true,
    }).start();
  };

  const onSaveHoverOut = (): void => {
    setSaveHovered(false);
    Animated.timing(saveArrowX, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  };

  const persistAndContinue = async (): Promise<void> => {
    await savePreferences({
      lovedColors,
      dislikedColors: [],
      lovedPatterns,
      dislikedPatterns: [],
      fitPreference,
      styleIdentity,
    });

    if (profile) {
      await saveProfile({
        skinToneId: profile.skinToneId,
        skinUndertone: profile.skinUndertone,
        skinImagePath: profile.skinImagePath,
        onboarded: 1,
      });
    }

    navigation.navigate('ClosetIntro');
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Tell us your style</Text>
        <Text style={styles.subtitle}>Takes 30 seconds - makes suggestions much better</Text>

        <Text style={styles.sectionLabel}>COLORS YOU LOVE</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.colorsRail}
        >
          {COLOR_SWATCHES.map((swatch) => {
            const selected = lovedColors.includes(swatch.hex);
            return (
              <Pressable
                key={swatch.hex}
                onPress={() => setLovedColors((prev) => (
                  prev.includes(swatch.hex)
                    ? prev.filter((c) => c !== swatch.hex)
                    : [...prev, swatch.hex]
                ))}
                style={selected ? styles.swatchOuterSelected : styles.swatchOuter}
                accessibilityLabel={swatch.name}
              >
                <View style={[styles.swatch, { backgroundColor: swatch.hex }]} />
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.sectionLabel}>PATTERNS YOU WEAR</Text>
        <View style={styles.patternWrap}>
          {PATTERN_OPTIONS.map((option) => {
            const selected = patternMode === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setPatternMode(option.value)}
                onHoverIn={() => setHoveredPattern(option.value)}
                onHoverOut={() => setHoveredPattern(null)}
                style={({ pressed }) => [
                  styles.patternPill,
                  selected ? styles.patternPillSelected : styles.patternPillUnselected,
                  (!selected && hoveredPattern === option.value) || (!selected && pressed)
                    ? styles.patternPillHover
                    : null,
                ]}
              >
                <Text style={[styles.patternText, selected ? styles.patternTextSelected : styles.patternTextUnselected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>FIT PREFERENCE</Text>
        <View style={styles.fitGrid}>
          {FIT_OPTIONS.map((option) => {
            const selected = fitPreference === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setFitPreference(option.value)}
                onHoverIn={() => setHoveredFit(option.value)}
                onHoverOut={() => setHoveredFit(null)}
                style={({ pressed }) => [styles.fitCard, selected ? styles.fitCardSelected : null, pressed ? styles.fitPressed : null]}
              >
                <LinearGradient
                  colors={['#1c1b1b', '#1c1b1b']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.fitImageLayer,
                    selected ? styles.fitImageSelected : styles.fitImageUnselected,
                    !selected && hoveredFit === option.value ? styles.fitImageHover : null,
                  ]}
                >
                  <ImageBackground
                    source={require('../../assets/splash-icon.png')}
                    resizeMode="cover"
                    style={styles.fitImageBg}
                    imageStyle={styles.fitImageBgInner}
                  >
                    <LinearGradient
                      colors={[`${option.colors[0]}cc`, `${option.colors[1]}cc`]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.fitImageTint}
                    >
                      <MaterialIcons name={option.icon} size={54} color="rgba(229,226,225,0.85)" />
                    </LinearGradient>
                  </ImageBackground>
                </LinearGradient>
                <LinearGradient
                  colors={['#0e0e0e', 'transparent']}
                  start={{ x: 0.5, y: 1 }}
                  end={{ x: 0.5, y: 0 }}
                  style={styles.fitBottomShade}
                />
                <Text style={styles.fitLabel}>{option.label}</Text>
                {selected ? (
                  <View style={styles.fitCheckBadge}>
                    <MaterialIcons name="check" size={16} color="#261900" />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>STYLE IDENTITY</Text>
        <View style={styles.identityGrid}>
          {STYLE_OPTIONS.map((option) => {
            const selected = styleIdentity === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setStyleIdentity(option.value)}
                onHoverIn={() => setHoveredStyle(option.value)}
                onHoverOut={() => setHoveredStyle(null)}
                style={({ pressed }) => [
                  styles.identityCard,
                  selected ? styles.identityCardSelected : null,
                  !selected && hoveredStyle === option.value ? styles.identityCardHover : null,
                  pressed ? styles.identityPressed : null,
                ]}
              >
                <MaterialIcons
                  name={option.icon}
                  size={30}
                  color={selected || hoveredStyle === option.value ? '#e6c487' : '#d0c5b5'}
                />
                <Text style={styles.identityTitle}>{option.title}</Text>
                <Text style={styles.identityDescription}>{option.description}</Text>
                {selected ? (
                  <View style={styles.identityCheckBadge}>
                    <MaterialIcons name="check" size={14} color="#261900" />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <LinearGradient
        colors={['rgba(19,19,19,0)', '#131313']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.saveBar}
      >
        <Animated.View style={[styles.saveButtonWrap, { transform: [{ scale: saveScale }] }]}>
          <Pressable
            onPress={persistAndContinue}
            onHoverIn={onSaveHoverIn}
            onHoverOut={onSaveHoverOut}
            onPressIn={() => setSavePressed(true)}
            onPressOut={() => setSavePressed(false)}
          >
            <LinearGradient
              colors={['#e6c487', '#c9a96e']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.saveButton}
            >
              <Text style={styles.saveText}>Save Preferences</Text>
              <Animated.View style={{ transform: [{ translateX: saveArrowX }] }}>
                <MaterialIcons name="arrow-forward" size={20} color="#261900" />
              </Animated.View>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#131313',
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 170,
  },
  title: {
    color: '#e5e2e1',
    fontFamily: 'PlayfairDisplay_700Bold_Italic',
    fontSize: 40,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 10,
    marginBottom: 48,
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    letterSpacing: 0.65,
  },
  sectionLabel: {
    marginBottom: 24,
    color: '#d0c5b5',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 2.2,
  },
  colorsRail: {
    gap: 24,
    paddingVertical: 8,
    marginBottom: 36,
  },
  swatchOuter: {
    padding: 4,
    borderRadius: 9999,
    backgroundColor: '#131313',
  },
  swatchOuterSelected: {
    padding: 4,
    borderRadius: 9999,
    backgroundColor: '#131313',
    borderWidth: 2,
    borderColor: '#e6c487',
  },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  patternWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 36,
  },
  patternPill: {
    borderRadius: 9999,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  patternPillUnselected: {
    backgroundColor: '#2a2a2a',
  },
  patternPillHover: {
    backgroundColor: '#353534',
  },
  patternPillSelected: {
    backgroundColor: '#e6c487',
    shadowColor: '#e6c487',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  patternText: {
    fontSize: 14,
  },
  patternTextUnselected: {
    color: '#e5e2e1',
    fontFamily: 'Inter_500Medium',
  },
  patternTextSelected: {
    color: '#261900',
    fontFamily: 'Inter_700Bold',
  },
  fitGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 36,
  },
  fitCard: {
    flex: 1,
    aspectRatio: 4 / 5,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1c1b1b',
  },
  fitPressed: {
    transform: [{ scale: 0.99 }],
  },
  fitCardSelected: {
    borderWidth: 2,
    borderColor: '#e6c487',
    shadowColor: '#e6c487',
    shadowOpacity: 0.2,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  fitImageLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fitImageBg: {
    ...StyleSheet.absoluteFillObject,
  },
  fitImageBgInner: {
    opacity: 0.9,
  },
  fitImageTint: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fitImageUnselected: {
    opacity: 0.6,
  },
  fitImageHover: {
    opacity: 0.8,
  },
  fitImageSelected: {
    opacity: 0.8,
  },
  fitBottomShade: {
    ...StyleSheet.absoluteFillObject,
  },
  fitLabel: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    color: '#e5e2e1',
    fontSize: 18,
    fontFamily: 'NotoSerif_400Regular_Italic',
  },
  fitCheckBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e6c487',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  identityCard: {
    width: '47%',
    backgroundColor: '#201f1f',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 24,
    position: 'relative',
  },
  identityCardHover: {
    backgroundColor: '#2a2a2a',
  },
  identityPressed: {
    transform: [{ scale: 0.99 }],
  },
  identityCardSelected: {
    borderWidth: 2,
    borderColor: '#e6c487',
  },
  identityTitle: {
    marginTop: 10,
    color: '#e5e2e1',
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 20,
  },
  identityDescription: {
    marginTop: 8,
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  identityCheckBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#e6c487',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 24,
  },
  saveButtonWrap: {
    width: '100%',
  },
  saveButton: {
    height: 56,
    borderRadius: 9999,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#e6c487',
    shadowOpacity: 0.3,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  saveText: {
    color: '#261900',
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    letterSpacing: -0.2,
  },
});

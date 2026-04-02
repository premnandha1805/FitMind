import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { StackScreenProps } from '@react-navigation/stack';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { detectSkinTone, DetectSkinToneResult } from '../services/skinToneEngine';
import { RootStackParamList } from '../navigation/types';
import { SKIN_TONES } from '../constants/skinTones';
import { useUserStore } from '../store/useUserStore';
import { safeAsync } from '../utils/safeAsync';

type Props = StackScreenProps<RootStackParamList, 'SkinTone'>;

export default function SkinToneScreen({ navigation, route }: Props): React.JSX.Element {
  const returnToProfile = Boolean(route.params?.returnToProfile);
  const saveProfile = useUserStore((s) => s.saveProfile);
  const profile = useUserStore((s) => s.profile);
  const [photo, setPhoto] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectSkinToneResult | null>(null);
  const [manualToneId, setManualToneId] = useState<number | null>(null);
  const [manualUndertone, setManualUndertone] = useState<'Warm' | 'Neutral' | 'Cool' | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [selfiePressed, setSelfiePressed] = useState(false);
  const [confirmPressed, setConfirmPressed] = useState(false);
  const [confirmHovered, setConfirmHovered] = useState(false);
  const [hoveredUndertone, setHoveredUndertone] = useState<'Warm' | 'Neutral' | 'Cool' | null>(null);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const toneHex: Record<number, string> = {
    1: '#F5D6C6',
    2: '#E8B99A',
    3: '#D2A87E',
    4: '#A5714F',
    5: '#6B4430',
    6: '#3D251E',
  };

  const isManualRequired = detected !== null && (!detected.detected || detected.toooDark);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 20000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [rotateAnim]);

  const ringSpin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const takePhoto = async (): Promise<void> => {
    await safeAsync(async () => {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera access needed', 'Please allow camera permission to continue.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.front, quality: 0.9 });
      if (result.canceled) return;
      const uri = result.assets[0].uri;
      setPhoto(uri);
      setManualToneId(null);
      setManualUndertone(null);
      setDetecting(true);
      const tone = await detectSkinTone(uri);
      setDetected(tone);
      setDetecting(false);
      if (tone.toooDark) {
        Alert.alert('Photo is too dark', 'Photo is too dark. Please retake in natural daylight.');
      }
    }, 'SkinToneScreen.takePhoto');
  };

  const confirm = async (): Promise<void> => {
    const selectedTone = manualToneId ?? (detected && detected.detected ? detected.toneId : null);
    const selectedUndertone = manualUndertone ?? (detected && detected.detected ? detected.undertone : null);

    if (!selectedTone || !selectedUndertone) {
      return;
    }

    await saveProfile({ skinToneId: final.toneId, skinUndertone: final.undertone, skinImagePath: photo, onboarded: 0 });
    if (returnToProfile) {
      navigation.goBack();
      return;
    }
    navigation.navigate('StylePreferences');
  };

  const canConfirm = isManualRequired
    ? Boolean(manualToneId && manualUndertone)
    : Boolean(detected && detected.detected);

  const final = {
    toneId: manualToneId ?? (detected && detected.detected ? detected.toneId : 3),
    undertone: manualUndertone ?? (detected && detected.detected ? detected.undertone : 'Neutral' as const),
  };

  const previewHex = useMemo(() => {
    if (manualToneId) return toneHex[manualToneId] ?? '#D2A87E';
    if (detected?.detected) return detected.hexPreview;
    return '#D2A87E';
  }, [detected, manualToneId]);

  const displayedToneName = manualToneId
    ? SKIN_TONES.find((tone) => tone.id === manualToneId)?.name ?? 'Medium Light'
    : detected?.detected
      ? detected.toneName
      : 'Medium Light';

  const displayedUndertone = manualUndertone ?? (detected?.detected ? detected.undertone : 'Neutral');
  const userThumb = photo ?? profile?.skinImagePath ?? null;

  return (
    <View style={styles.screen}>
      <BlurView intensity={25} tint="dark" style={styles.headerBar}>
        <View style={styles.headerLeft}>
          <MaterialIcons name="face" size={26} color="#E6C487" />
          <Text style={styles.headerBrand}>FitMind</Text>
        </View>
        <View style={styles.headerAvatarWrap}>
          {userThumb ? (
            <Image source={{ uri: userThumb }} style={styles.headerAvatar} resizeMode="cover" />
          ) : (
            <MaterialIcons name="person" size={20} color="#e5e2e1" />
          )}
        </View>
      </BlurView>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.textSection}>
          <Text style={styles.title}>Let's personalize your style</Text>
          <Text style={styles.subtitle}>Take a selfie in natural light for best results</Text>
        </View>

        <View style={styles.cameraArea}>
          <Animated.View style={[styles.cameraOuterRing, { transform: [{ rotate: ringSpin }] }]}>
            <View style={styles.cameraInnerCircle}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.cameraImage} resizeMode="cover" />
              ) : (
                <View style={styles.cameraPlaceholder} />
              )}
              <MaterialIcons name="filter-center-focus" size={60} color="rgba(230,196,135,0.40)" style={styles.focusIcon} />
            </View>
          </Animated.View>
        </View>

        <Animated.View style={{ transform: [{ scale: selfiePressed ? 0.9 : 1 }] }}>
          <Pressable
            style={styles.selfieBtnPressable}
            onPress={takePhoto}
            onPressIn={() => setSelfiePressed(true)}
            onPressOut={() => setSelfiePressed(false)}
          >
            <LinearGradient
              colors={['#e6c487', '#c9a96e']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.selfieBtn}
            >
              <MaterialIcons name="photo-camera" size={18} color="#261900" />
              <Text style={styles.selfieBtnText}>Take Selfie</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>

      {detecting ? (
        <View style={styles.progressWrap}>
          <Text style={styles.progressText}>Reading your skin tone...</Text>
          <View style={styles.progressTrack}><View style={styles.progressFill} /></View>
        </View>
      ) : null}

        {detected ? (
          <BlurView intensity={20} tint="dark" style={styles.detectCard}>
            <View style={styles.resultRow}>
              <View style={styles.resultLeft}>
                <View style={styles.toneSwatchRing}>
                  <View style={[styles.toneSwatch, { backgroundColor: previewHex }]} />
                </View>
                <View>
                  <Text style={styles.resultToneName}>{displayedToneName}</Text>
                  <View style={styles.undertoneBadge}>
                    <Text style={styles.undertoneBadgeText}>{displayedUndertone}</Text>
                  </View>
                </View>
              </View>
              <MaterialIcons name="check-circle" size={30} color="#c9a96e" />
            </View>

            <Text style={styles.manualLabel}>NOT QUITE RIGHT? CHOOSE MANUALLY:</Text>

            <View style={styles.toneCirclesRow}>
              {SKIN_TONES.map((tone) => {
                const selected = final.toneId === tone.id;
                return (
                  <Pressable
                    key={tone.id}
                    onPress={() => setManualToneId(tone.id)}
                    style={[styles.toneCircleWrap, selected && styles.toneCircleWrapSelected]}
                  >
                    <View style={[styles.toneCircle, { backgroundColor: toneHex[tone.id] ?? '#D2A87E' }, selected && styles.toneCircleSelected]} />
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.undertoneRow}>
              {(['Warm', 'Neutral', 'Cool'] as const).map((tone) => {
                const selected = displayedUndertone === tone;
                return (
                  <Pressable
                    key={tone}
                    onPress={() => setManualUndertone(tone)}
                    onHoverIn={() => setHoveredUndertone(tone)}
                    onHoverOut={() => setHoveredUndertone(null)}
                    style={({ pressed }) => [
                      styles.undertonePill,
                      selected ? styles.undertonePillSelected : styles.undertonePillUnselected,
                      (pressed || (Platform.OS === 'web' && hoveredUndertone === tone)) && !selected ? styles.undertonePillHover : null,
                    ]}
                  >
                    <Text style={[styles.undertonePillText, selected ? styles.undertonePillTextSelected : styles.undertonePillTextUnselected]}>{tone}</Text>
                  </Pressable>
                );
              })}
            </View>
          </BlurView>
        ) : null}

        <Animated.View style={[styles.confirmWrap, { transform: [{ scale: confirmPressed ? 0.98 : 1 }] }]}> 
          <Pressable
            onPress={confirm}
            disabled={!canConfirm}
            onPressIn={() => setConfirmPressed(true)}
            onPressOut={() => setConfirmPressed(false)}
            onHoverIn={() => setConfirmHovered(true)}
            onHoverOut={() => setConfirmHovered(false)}
            style={({ pressed }) => [styles.confirmPressable, (pressed || (Platform.OS === 'web' && confirmHovered)) && canConfirm ? styles.confirmHover : null]}
          >
            <LinearGradient
              colors={['#e6c487', '#c9a96e']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.confirmBtn, Platform.OS === 'web' && confirmHovered && canConfirm ? styles.confirmBtnHover : null, !canConfirm ? styles.confirmBtnDisabled : null]}
            >
              <Text style={styles.confirmText}>Confirm</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>

        <Pressable
          style={styles.skipBtn}
          onPress={async () => {
            await saveProfile({ skinToneId: 3, skinUndertone: 'Neutral', skinImagePath: null, onboarded: 0 });
            if (returnToProfile) {
              navigation.goBack();
              return;
            }
            navigation.navigate('StylePreferences');
          }}
        >
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#131313',
  },
  headerBar: {
    marginTop: 0,
    height: 64,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(10,10,10,0.60)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBrand: {
    color: '#E6C487',
    fontSize: 24,
    letterSpacing: -0.5,
    fontFamily: 'NotoSerif_700Bold_Italic',
  },
  headerAvatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#353534',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatar: {
    width: '100%',
    height: '100%',
  },
  container: {
    paddingHorizontal: 24,
    paddingBottom: 36,
  },
  textSection: {
    marginTop: 96,
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    color: '#e5e2e1',
    fontSize: 32,
    lineHeight: 40,
    textAlign: 'center',
    fontFamily: 'PlayfairDisplay_700Bold_Italic',
  },
  subtitle: {
    marginTop: 10,
    color: '#d0c5b5',
    fontSize: 14,
    letterSpacing: 1.4,
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
  },
  cameraArea: {
    alignItems: 'center',
  },
  cameraOuterRing: {
    width: 256,
    height: 256,
    borderRadius: 128,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#e6c487',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraInnerCircle: {
    width: '92%',
    height: '92%',
    borderRadius: 9999,
    overflow: 'hidden',
    backgroundColor: '#201f1f',
    borderWidth: 4,
    borderColor: '#0e0e0e',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraImage: {
    width: '100%',
    height: '100%',
  },
  cameraPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#201f1f',
  },
  focusIcon: {
    position: 'absolute',
  },
  selfieBtnPressable: {
    marginTop: 32,
    alignSelf: 'center',
  },
  selfieBtn: {
    borderRadius: 9999,
    paddingVertical: 16,
    paddingHorizontal: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#e6c487',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  selfieBtnText: {
    color: '#261900',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  progressWrap: {
    marginTop: 16,
    marginBottom: 20,
  },
  progressText: {
    color: '#d0c5b5',
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  progressTrack: {
    height: 8,
    borderRadius: 9999,
    backgroundColor: '#2a2826',
    overflow: 'hidden',
  },
  progressFill: {
    width: '70%',
    height: 8,
    backgroundColor: '#e6c487',
  },
  detectCard: {
    marginTop: 24,
    marginBottom: 48,
    backgroundColor: 'rgba(32,31,31,0.60)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 24,
    overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  toneSwatchRing: {
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.20)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    padding: 0,
  },
  toneSwatch: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  resultToneName: {
    color: '#e5e2e1',
    fontSize: 18,
    fontFamily: 'NotoSerif_700Bold',
  },
  undertoneBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#54482c',
    borderRadius: 9999,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  undertoneBadgeText: {
    color: '#c8b693',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontFamily: 'Inter_700Bold',
  },
  manualLabel: {
    marginTop: 22,
    marginBottom: 24,
    color: '#d0c5b5',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    fontFamily: 'Inter_600SemiBold',
  },
  toneCirclesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  toneCircleWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toneCircleWrapSelected: {
    borderWidth: 2,
    borderColor: 'rgba(230,196,135,0.30)',
  },
  toneCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  toneCircleSelected: {
    borderColor: '#e6c487',
    transform: [{ scale: 0.8 }],
  },
  undertoneRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  undertonePill: {
    borderRadius: 9999,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderWidth: 1,
  },
  undertonePillSelected: {
    borderColor: '#e6c487',
    backgroundColor: 'rgba(230,196,135,0.10)',
  },
  undertonePillUnselected: {
    borderColor: '#4d463a',
    backgroundColor: 'transparent',
  },
  undertonePillHover: {
    backgroundColor: '#2a2a2a',
  },
  undertonePillText: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  undertonePillTextSelected: {
    color: '#e6c487',
    fontFamily: 'Inter_700Bold',
  },
  undertonePillTextUnselected: {
    color: '#d0c5b5',
  },
  confirmWrap: {
    width: '100%',
  },
  confirmPressable: {
    width: '100%',
  },
  confirmHover: {
    opacity: 1,
  },
  confirmBtn: {
    width: '100%',
    height: 56,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#e6c487',
    shadowOpacity: 0.3,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  confirmBtnHover: {
    opacity: 0.95,
  },
  confirmBtnDisabled: {
    opacity: 0.4,
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmText: {
    color: '#261900',
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
  skipBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 8,
  },
  skipText: {
    color: '#b5aa98',
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
});

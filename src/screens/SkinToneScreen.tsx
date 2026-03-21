import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image, Alert, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { StackScreenProps } from '@react-navigation/stack';
import { detectSkinTone, DetectSkinToneResult } from '../services/skinToneEngine';
import { RootStackParamList } from '../navigation/types';
import { SKIN_TONES } from '../constants/skinTones';
import { useUserStore } from '../store/useUserStore';
import { safeAsync } from '../utils/safeAsync';

type Props = StackScreenProps<RootStackParamList, 'SkinTone'>;

export default function SkinToneScreen({ navigation, route }: Props): React.JSX.Element {
  const returnToProfile = Boolean(route.params?.returnToProfile);
  const saveProfile = useUserStore((s) => s.saveProfile);
  const [photo, setPhoto] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectSkinToneResult | null>(null);
  const [manualToneId, setManualToneId] = useState<number | null>(null);
  const [manualUndertone, setManualUndertone] = useState<'Warm' | 'Neutral' | 'Cool' | null>(null);
  const [detecting, setDetecting] = useState(false);

  const toneHex: Record<number, string> = {
    1: '#f7e7da',
    2: '#efd4bf',
    3: '#ddb392',
    4: '#c78e62',
    5: '#8b5a3c',
    6: '#5a3a2a',
  };

  const isManualRequired = detected !== null && (!detected.detected || detected.toooDark);

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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Let's personalize your style</Text>
      <Text style={styles.subtitle}>Take a selfie in natural light for best results</Text>
      {photo ? <Image source={{ uri: photo }} style={styles.image} /> : null}
      <Pressable style={styles.primary} onPress={takePhoto}><Text style={styles.primaryText}>Take Selfie</Text></Pressable>
      {detecting ? (
        <View style={styles.progressWrap}>
          <Text style={styles.progressText}>Reading your skin tone...</Text>
          <View style={styles.progressTrack}><View style={styles.progressFill} /></View>
        </View>
      ) : null}

      {detected?.detected ? (
        <View style={styles.detectBox}>
          <Text>Detected tone: {detected.toneName}</Text>
          <Text>Undertone: {detected.undertone}</Text>
          <View style={[styles.preview, { backgroundColor: detected.hexPreview }]} />
        </View>
      ) : null}

      {isManualRequired ? (
        <>
          <Text style={styles.subhead}>Manual tone selection</Text>
          <View style={styles.swatches}>
            {SKIN_TONES.map((tone) => (
              <Pressable key={tone.id} style={styles.manualOption} onPress={() => setManualToneId(tone.id)}>
                <View
                  style={[
                    styles.manualCircle,
                    { backgroundColor: toneHex[tone.id] ?? '#c8a27a' },
                    manualToneId === tone.id && styles.manualCircleSelected,
                  ]}
                />
                <Text style={styles.manualLabel}>{tone.name}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.subhead}>Undertone</Text>
          <View style={styles.undertoneRow}>
            {(['Warm', 'Neutral', 'Cool'] as const).map((tone) => (
              <Pressable
                key={tone}
                style={[styles.undertoneBtn, manualUndertone === tone && styles.undertoneBtnSelected]}
                onPress={() => setManualUndertone(tone)}
              >
                <Text>{tone}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <Pressable style={[styles.primary, !canConfirm && styles.primaryDisabled]} onPress={confirm} disabled={!canConfirm}><Text style={styles.primaryText}>Confirm</Text></Pressable>
      <Pressable style={styles.secondary} onPress={async () => {
        await saveProfile({ skinToneId: 3, skinUndertone: 'Neutral', skinImagePath: null, onboarded: 0 });
        if (returnToProfile) {
          navigation.goBack();
          return;
        }
        navigation.navigate('StylePreferences');
      }}><Text style={styles.secondaryText}>Skip</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: '#fff' },
  title: { fontSize: 26, fontWeight: '800', color: '#0f172a' },
  subtitle: { color: '#475569', marginBottom: 12 },
  image: { width: '100%', aspectRatio: 1, borderRadius: 16, backgroundColor: '#e2e8f0' },
  primary: { marginTop: 12, backgroundColor: '#0f766e', borderRadius: 12, padding: 12, alignItems: 'center' },
  primaryDisabled: { backgroundColor: '#94a3b8' },
  primaryText: { color: '#fff', fontWeight: '700' },
  detectBox: { marginTop: 12, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  preview: { marginTop: 8, width: 32, height: 32, borderRadius: 16 },
  subhead: { marginTop: 16, fontWeight: '700' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  swatch: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#e2e8f0' },
  manualOption: { width: '30%', alignItems: 'center', marginBottom: 12 },
  manualCircle: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#cbd5e1' },
  manualCircleSelected: { borderWidth: 3, borderColor: '#0f766e' },
  manualLabel: { marginTop: 6, textAlign: 'center', fontSize: 12, color: '#334155' },
  undertoneRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  undertoneBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#e2e8f0' },
  undertoneBtnSelected: { backgroundColor: '#99f6e4' },
  progressWrap: { marginTop: 10 },
  progressText: { color: '#0369a1', marginBottom: 6 },
  progressTrack: { height: 8, borderRadius: 8, backgroundColor: '#e2e8f0', overflow: 'hidden' },
  progressFill: { width: '70%', height: 8, backgroundColor: '#0f766e' },
  secondary: { marginTop: 8, padding: 12, alignItems: 'center' },
  secondaryText: { color: '#0369a1' },
});

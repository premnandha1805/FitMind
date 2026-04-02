import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { StackScreenProps } from '@react-navigation/stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { autoTagClothing } from '../services/mlkit';
import { ensureImageUnder4Mb, saveImageToAppDir } from '../utils/imageUtils';
import { safeAsync } from '../utils/safeAsync';
import { useClosetStore } from '../store/useClosetStore';
import { rgbToHsl, rgbToHex } from '../utils/colorUtils';
import { RootStackParamList } from '../navigation/types';

type Props = StackScreenProps<RootStackParamList, 'AddItem'>;

type CategoryLabel = 'Footwear' | 'Outerwear' | 'Tops' | 'Accessories';
type FitOccasion = 'Relaxed' | 'Tailored' | 'Evening' | 'Minimalist';

const CATEGORY_OPTIONS: CategoryLabel[] = ['Footwear', 'Outerwear', 'Tops', 'Accessories'];
const FIT_OPTIONS: FitOccasion[] = ['Relaxed', 'Tailored', 'Evening', 'Minimalist'];

function categoryToLabel(category?: 'top' | 'bottom' | 'shoes' | 'accessory' | 'outerwear' | 'other'): CategoryLabel {
  if (category === 'shoes') return 'Footwear';
  if (category === 'outerwear') return 'Outerwear';
  if (category === 'accessory') return 'Accessories';
  return 'Tops';
}

function labelToCategory(label: CategoryLabel): 'top' | 'shoes' | 'accessory' | 'outerwear' {
  if (label === 'Footwear') return 'shoes';
  if (label === 'Outerwear') return 'outerwear';
  if (label === 'Accessories') return 'accessory';
  return 'top';
}

function randomColorFromUri(uri: string): { hex: string; hsl: string } {
  let hash = 0;
  for (let i = 0; i < uri.length; i += 1) hash = (hash + uri.charCodeAt(i) * (i + 1)) % 255;
  const r = hash;
  const g = (hash * 2) % 255;
  const b = (hash * 3) % 255;
  const hsl = rgbToHsl(r, g, b);
  return { hex: rgbToHex(r, g, b), hsl: `hsl(${hsl.h.toFixed(0)},${hsl.s.toFixed(0)},${hsl.l.toFixed(0)})` };
}

export default function AddItemScreen({ route, navigation }: Props): React.JSX.Element {
  const addItem = useClosetStore((s) => s.addItem);
  const updateItem = useClosetStore((s) => s.updateItem);
  const items = useClosetStore((s) => s.items);
  const editingItemId = route.params?.existingItemId;
  const editingItem = editingItemId ? items.find((item) => item.id === editingItemId) : undefined;
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const { width, height } = useWindowDimensions();

  const [uri, setUri] = useState<string | null>(null);
  const [detectedLabel, setDetectedLabel] = useState<CategoryLabel>(categoryToLabel(route.params?.prefill?.category ?? editingItem?.category));
  const [categoryLabel, setCategoryLabel] = useState<CategoryLabel>(categoryToLabel(route.params?.prefill?.category ?? editingItem?.category));
  const [fitChoice, setFitChoice] = useState<FitOccasion>('Relaxed');
  const [pattern, setPattern] = useState<string>(route.params?.prefill?.pattern ?? editingItem?.pattern ?? 'solid');
  const [colorHex, setColorHex] = useState<string>(route.params?.prefill?.colorHex ?? editingItem?.colorHex ?? '#808080');
  const [colorHsl, setColorHsl] = useState<string>('hsl(0,0,50)');
  const [flashOn, setFlashOn] = useState(false);

  const pulse = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(460)).current;
  const saveScale = useRef(new Animated.Value(1)).current;
  const retakeScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    if (!uri) return;
    sheetY.setValue(460);
    Animated.timing(sheetY, {
      toValue: 0,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [uri, sheetY]);

  const glowSize = Math.max(width, height) * 1.5;
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.08] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.6] });

  const frameWidth = width * 0.8;
  const frameHeight = height * 0.6;

  const styleType = useMemo(() => fitChoice.toLowerCase(), [fitChoice]);

  const takePhoto = async (): Promise<void> => {
    if (!cameraRef.current) return;
    const { data: captured } = await safeAsync(async () => {
      const shot = await cameraRef.current?.takePictureAsync({ quality: 1, skipProcessing: false });
      if (!shot?.uri) return null;

      const compressed = await ensureImageUnder4Mb(shot.uri);
      const auto = await autoTagClothing(compressed);
      const detected = categoryToLabel(auto.category);

      setDetectedLabel(detected);
      setCategoryLabel(detected);
      setPattern(auto.pattern);

      const color = randomColorFromUri(compressed);
      setColorHex(color.hex);
      setColorHsl(color.hsl);

      return compressed;
    }, 'AddItemScreen.capture');

    if (!captured) {
      Alert.alert('Capture failed', 'Please try taking the photo again.');
      return;
    }

    setUri(captured);
  };

  const retake = async (): Promise<void> => {
    if (uri) {
      await safeAsync(async () => FileSystem.deleteAsync(uri, { idempotent: true }), 'AddItemScreen.retakeCleanup');
    }
    setUri(null);
  };

  const save = async (): Promise<void> => {
    if (!uri) return;
    const { data: saved, error } = await safeAsync(async () => saveImageToAppDir(uri, 'closet'), 'AddItemScreen.saveImage');
    if (error || !saved) {
      Alert.alert('Save failed', 'Image save failed. Please retry.');
      return;
    }

    if (editingItem) {
      await updateItem(editingItem.id, {
        imagePath: saved,
        category: labelToCategory(categoryLabel),
        colorHsl,
        colorHex,
        pattern,
        styleType,
      });
      Alert.alert('Updated', 'Item updated in your closet.');
      navigation.goBack();
    } else {
      await addItem({
        id: `item-${Date.now()}`,
        imagePath: saved,
        category: labelToCategory(categoryLabel),
        colorHsl,
        colorHex,
        pattern,
        styleType,
        season: null,
        timesWorn: 0,
        lastWorn: null,
        createdAt: new Date().toISOString(),
      });

      Alert.alert('Added', 'Item saved to your closet.');
      navigation.goBack();
    }

    await safeAsync(async () => FileSystem.deleteAsync(uri, { idempotent: true }), 'AddItemScreen.cleanupTempUri');
    setUri(null);
  };

  if (!permission) {
    return <View style={styles.screen} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionWrap}>
        <Text style={styles.permissionText}>Camera access is required to scan items.</Text>
        <Pressable onPress={() => requestPermission()}>
          <LinearGradient colors={['#e6c487', '#c9a96e']} style={styles.permissionBtn}>
            <Text style={styles.permissionBtnText}>Enable Camera</Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        flash={flashOn ? 'on' : 'off'}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          {
            width: glowSize,
            height: glowSize,
            borderRadius: glowSize / 2,
            transform: [{ scale: glowScale }],
            opacity: glowOpacity,
          },
        ]}
      />

      <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
        <BlurView intensity={30} tint="dark" style={styles.iconBlur}>
          <MaterialIcons name="close" size={24} color="#e5e2e1" />
        </BlurView>
      </Pressable>

      <Pressable style={styles.flashBtn} onPress={() => setFlashOn((s) => !s)}>
        <BlurView intensity={30} tint="dark" style={styles.iconBlur}>
          <MaterialIcons name="flash-on" size={22} color="#e5e2e1" />
        </BlurView>
      </Pressable>

      <View style={styles.frameWrap} pointerEvents="none">
        <View style={[styles.overlay, { bottom: frameHeight + 8 }]} />
        <View style={[styles.overlay, { top: frameHeight + 8 }]} />
        <View style={[styles.overlayLeft, { width: (width - frameWidth) / 2 - 4 }]} />
        <View style={[styles.overlayRight, { width: (width - frameWidth) / 2 - 4 }]} />

        <View style={[styles.guideFrame, { width: frameWidth, height: frameHeight }]}> 
          <View style={[styles.corner, styles.cornerTopLeft]} />
          <View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          <View style={[styles.corner, styles.cornerBottomRight]} />
          <Text style={styles.frameLabel}>ALIGN GARMENT WITHIN FRAME</Text>
        </View>
      </View>

      {!uri ? (
        <Pressable style={styles.captureBtn} onPress={takePhoto}>
          <LinearGradient colors={['#e6c487', '#c9a96e']} style={styles.captureBtnInner}>
            <MaterialIcons name="photo-camera" size={24} color="#261900" />
          </LinearGradient>
        </Pressable>
      ) : null}

      {uri ? (
        <>
          <BlurView intensity={18} tint="dark" style={styles.scrim} />
          <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetY }] }]}>
            <View style={styles.handle} />

            <View style={styles.sheetHeaderRow}>
              <View style={styles.thumbWrap}>
                <Image source={{ uri }} style={styles.thumbImage} resizeMode="cover" />
              </View>

              <View style={styles.sheetHeaderTextWrap}>
                <Text style={styles.sheetTitle}>New Treasure</Text>
                <Text style={styles.sheetSubtitle}>
                  AI has detected: <Text style={styles.detectedText}>{detectedLabel}</Text>
                </Text>
              </View>
            </View>

            <Text style={styles.groupLabel}>CATEGORY</Text>
            <View style={styles.pillWrap}>
              {CATEGORY_OPTIONS.map((option) => {
                const selected = categoryLabel === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setCategoryLabel(option)}
                    style={[styles.pill, selected ? styles.pillSelected : styles.pillUnselected]}
                  >
                    <Text style={[styles.pillText, selected ? styles.pillTextSelected : styles.pillTextUnselected]}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.groupLabel}>FIT & OCCASION</Text>
            <View style={styles.pillWrap}>
              {FIT_OPTIONS.map((option) => {
                const selected = fitChoice === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setFitChoice(option)}
                    style={[styles.pill, selected ? styles.pillSelected : styles.pillUnselected]}
                  >
                    <Text style={[styles.pillText, selected ? styles.pillTextSelected : styles.pillTextUnselected]}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Animated.View style={{ transform: [{ scale: saveScale }] }}>
              <Pressable
                onPress={save}
                onPressIn={() => Animated.spring(saveScale, { toValue: 0.95, useNativeDriver: true, bounciness: 0 }).start()}
                onPressOut={() => Animated.spring(saveScale, { toValue: 1, useNativeDriver: true, bounciness: 0 }).start()}
              >
                <LinearGradient
                  colors={['#e6c487', '#c9a96e']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.saveBtn}
                >
                  <Text style={styles.saveBtnText}>Save to Closet</Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>

            <Animated.View style={{ transform: [{ scale: retakeScale }] }}>
              <Pressable
                onPress={retake}
                onPressIn={() => Animated.spring(retakeScale, { toValue: 0.95, useNativeDriver: true, bounciness: 0 }).start()}
                onPressOut={() => Animated.spring(retakeScale, { toValue: 1, useNativeDriver: true, bounciness: 0 }).start()}
                style={styles.retakeBtn}
              >
                <MaterialIcons name="replay" size={14} color="#e5e2e1" />
                <Text style={styles.retakeBtnText}>Retake</Text>
              </Pressable>
            </Animated.View>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.8,
  },
  glow: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -300,
    backgroundColor: 'rgba(230,196,135,0.05)',
    shadowColor: '#e6c487',
    shadowOpacity: 0.35,
    shadowRadius: 120,
    shadowOffset: { width: 0, height: 0 },
  },
  iconBlur: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(32,31,31,0.60)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  closeBtn: {
    position: 'absolute',
    top: 32,
    left: 24,
  },
  flashBtn: {
    position: 'absolute',
    top: 32,
    right: 24,
  },
  frameWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: 'rgba(14,14,14,0.50)',
  },
  overlayLeft: {
    position: 'absolute',
    left: 0,
    top: '20%',
    bottom: '20%',
    backgroundColor: 'rgba(14,14,14,0.50)',
  },
  overlayRight: {
    position: 'absolute',
    right: 0,
    top: '20%',
    bottom: '20%',
    backgroundColor: 'rgba(14,14,14,0.50)',
  },
  guideFrame: {
    borderWidth: 2,
    borderColor: 'rgba(230,196,135,0.40)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: '#e6c487',
  },
  cornerTopLeft: {
    top: -2,
    left: -2,
    borderTopWidth: 2,
    borderLeftWidth: 2,
  },
  cornerTopRight: {
    top: -2,
    right: -2,
    borderTopWidth: 2,
    borderRightWidth: 2,
  },
  cornerBottomLeft: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
  },
  cornerBottomRight: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 2,
    borderRightWidth: 2,
  },
  frameLabel: {
    color: 'rgba(230,196,135,0.70)',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  captureBtn: {
    position: 'absolute',
    bottom: 52,
    alignSelf: 'center',
  },
  captureBtnInner: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(14,14,14,0.40)',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.40)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#2a2a2a',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 48,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -10 },
    elevation: 20,
  },
  handle: {
    width: 48,
    height: 6,
    borderRadius: 9999,
    backgroundColor: 'rgba(77,70,58,0.30)',
    alignSelf: 'center',
    marginBottom: 32,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 24,
  },
  thumbWrap: {
    width: 96,
    height: 128,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.10)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  sheetHeaderTextWrap: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  sheetTitle: {
    color: '#e5e2e1',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 24,
    letterSpacing: -0.4,
  },
  sheetSubtitle: {
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  detectedText: {
    color: '#e6c487',
    fontFamily: 'Inter_400Regular',
    fontStyle: 'italic',
  },
  groupLabel: {
    marginBottom: 12,
    color: '#d0c5b5',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 22,
  },
  pill: {
    borderRadius: 9999,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  pillSelected: {
    backgroundColor: '#c9a96e',
  },
  pillUnselected: {
    backgroundColor: '#201f1f',
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.15)',
  },
  pillText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  pillTextSelected: {
    color: '#543d0c',
  },
  pillTextUnselected: {
    color: '#d0c5b5',
  },
  saveBtn: {
    borderRadius: 9999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#e6c487',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  saveBtnText: {
    color: '#261900',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  retakeBtn: {
    marginTop: 12,
    borderRadius: 9999,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.40)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  retakeBtnText: {
    color: '#e5e2e1',
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  permissionWrap: {
    flex: 1,
    backgroundColor: '#131313',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 14,
  },
  permissionText: {
    color: '#e5e2e1',
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    textAlign: 'center',
  },
  permissionBtn: {
    borderRadius: 9999,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  permissionBtnText: {
    color: '#261900',
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
    fontSize: 12,
    letterSpacing: 1,
  },
});

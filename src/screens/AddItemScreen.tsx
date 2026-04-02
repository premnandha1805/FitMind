import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
  useWindowDimensions,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { StackScreenProps } from '@react-navigation/stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { detectClothing, extractColorFromPixels } from '../services/visionEngine';
import { ensureImageUnder4Mb, saveImageToAppDir } from '../utils/imageUtils';
import { safeAsync } from '../utils/safeAsync';
import { useClosetStore } from '../store/useClosetStore';
import { RootStackParamList } from '../navigation/types';
import { normalizeClothingItem } from '../utils/normalizer';
import { Category, ClothingPattern, ClothingStyleType } from '../types/models';
import { normalizePattern, normalizeStyle } from '../constants/categoryMap';

type Props = StackScreenProps<RootStackParamList, 'AddItem'>;

type CategoryLabel = 'Top' | 'Bottom' | 'Shoes' | 'Accessory' | 'Outerwear';
type SeasonLabel = 'summer' | 'winter' | 'all-season';

const CATEGORY_OPTIONS: CategoryLabel[] = ['Top', 'Bottom', 'Shoes', 'Accessory', 'Outerwear'];
const STYLE_OPTIONS: ClothingStyleType[] = ['casual', 'formal', 'party', 'ethnic', 'professional', 'sports'];
const PATTERN_OPTIONS: ClothingPattern[] = ['solid', 'stripes', 'checks', 'floral', 'print'];
const SEASON_OPTIONS: SeasonLabel[] = ['summer', 'winter', 'all-season'];

function categoryToLabel(category?: Category): CategoryLabel {
  if (category === 'shoes') return 'Shoes';
  if (category === 'bottom') return 'Bottom';
  if (category === 'outerwear') return 'Outerwear';
  if (category === 'accessory') return 'Accessory';
  return 'Top';
}

function labelToCategory(label: CategoryLabel): Category {
  if (label === 'Shoes') return 'shoes';
  if (label === 'Bottom') return 'bottom';
  if (label === 'Outerwear') return 'outerwear';
  if (label === 'Accessory') return 'accessory';
  return 'top';
}

function confidenceBand(confidence: number): 'low' | 'medium' | 'high' {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}

function formatLabel(style: string): string {
  if (style === 'smart_casual') return 'Smart Casual';
  return style.charAt(0).toUpperCase() + style.slice(1);
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
  const [detectionConfidence, setDetectionConfidence] = useState<'low' | 'medium' | 'high'>('low');
  const [categoryLabel, setCategoryLabel] = useState<CategoryLabel>(categoryToLabel(route.params?.prefill?.category ?? editingItem?.category));
  const initialStyle = normalizeStyle(route.params?.prefill?.styleType ?? editingItem?.styleType ?? 'casual');
  const initialSeason = editingItem?.season === 'summer' || editingItem?.season === 'winter' || editingItem?.season === 'all-season'
    ? editingItem.season
    : 'all-season';
  const [styleSelections, setStyleSelections] = useState<ClothingStyleType[]>([initialStyle]);
  const [pattern, setPattern] = useState<ClothingPattern>(
    normalizePattern(route.params?.prefill?.pattern ?? editingItem?.pattern ?? 'solid')
  );
  const [season, setSeason] = useState<SeasonLabel>(initialSeason);
  const [colorHex, setColorHex] = useState<string>(route.params?.prefill?.colorHex ?? editingItem?.colorHex ?? '#808080');
  const [colorHsl, setColorHsl] = useState<string>((route.params?.prefill as any)?.colorHsl ?? editingItem?.colorHsl ?? 'hsl(0,0,50)');
  const [flashOn, setFlashOn] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const isWeb = Platform.OS === 'web';

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

  const styleType = styleSelections[0] ?? 'casual';
  const showDetectionHint = detectionConfidence === 'low';
  const hintAcknowledged = showDetectionHint && categoryLabel !== detectedLabel;

  const showToast = (message: string): void => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return;
    }
    Alert.alert('FitMind', message);
  };

  const toggleStyle = (style: ClothingStyleType): void => {
    setStyleSelections((current) => {
      if (current.includes(style)) {
        const next = current.filter((x) => x !== style);
        return next.length ? next : [style];
      }
      return [style, ...current.filter((x) => x !== style)];
    });
  };

  const openSystemSettings = async (): Promise<void> => {
    await safeAsync(async () => Linking.openSettings(), 'AddItemScreen.openSettings');
  };

  const processCapturedImage = async (rawUri: string): Promise<string | null> => {
    const { data: compressed } = await safeAsync(async () => ensureImageUnder4Mb(rawUri), 'AddItemScreen.compressImage');
    if (!compressed) return null;

    setUri(compressed);
    setIsAnalyzing(true);
    setErrorHint(null);

    const { data: analysis, error } = await safeAsync(async () => {
      const [auto, color] = await Promise.all([
        detectClothing(compressed),
        extractColorFromPixels(compressed),
      ]);
      return { auto, color };
    }, 'AddItemScreen.processCaptured');

    if (analysis?.auto && analysis.color) {
      const detected = categoryToLabel(analysis.auto.category);
      setDetectedLabel(detected);
      setDetectionConfidence(confidenceBand(analysis.auto.confidence));
      if (!(editingItem?.userCorrected === 1)) {
        setCategoryLabel(detected);
        setPattern(normalizePattern(analysis.auto.pattern));
        setStyleSelections([analysis.auto.style_type]);
        const nextSeason = analysis.auto.season === 'summer' || analysis.auto.season === 'winter' || analysis.auto.season === 'all-season'
          ? analysis.auto.season
          : 'all-season';
        setSeason(nextSeason);
      }
      setColorHex(analysis.color.hex);
      setColorHsl(analysis.color.hsl);
    }

    if (error) {
      setErrorHint("AI couldn't detect this item - please fill manually");
      setDetectionConfidence('low');
    }

    setIsAnalyzing(false);
    return compressed;
  };

  const pickFromGalleryNative = async (): Promise<string | null> => {
    const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!mediaPermission.granted) {
      setErrorHint('Gallery permission denied. Please enable photo access in Settings.');
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return null;
    return processCapturedImage(result.assets[0].uri);
  };

  const captureFromCameraNative = async (): Promise<string | null> => {
    const granted = permission?.granted ?? false;
    if (!granted) {
      const requested = await requestPermission();
      if (!requested.granted) {
        setCameraDenied(true);
        return null;
      }
      setCameraDenied(false);
    }

    if (!cameraRef.current) {
      setErrorHint('Camera unavailable right now. Please try again.');
      return null;
    }

    let shot: { uri: string } | null | undefined = null;
    try {
      shot = await cameraRef.current.takePictureAsync({ quality: 1, skipProcessing: false });
    } catch {
      setErrorHint('Failed to capture photo. Please try again.');
      return null;
    }
    if (!shot?.uri) return null;
    return processCapturedImage(shot.uri);
  };

  const pickPhotoOnWeb = async (): Promise<string | null> => {
    if (!isWeb) return null;
    const host = globalThis as unknown as {
      document?: {
        createElement: (tag: string) => {
          type: string;
          accept: string;
          onchange: ((this: unknown, ev: unknown) => void) | null;
          click: () => void;
          files?: ArrayLike<{ name?: string }>;
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

  const takePhoto = async (): Promise<void> => {
    if (isWeb) {
      const picked = await pickPhotoOnWeb();
      if (!picked) return;
      const processed = await processCapturedImage(picked);
      if (!processed) return;
      return;
    }

    await captureFromCameraNative();
  };

  const chooseFromGallery = async (): Promise<void> => {
    if (isWeb) {
      const picked = await pickPhotoOnWeb();
      if (!picked) return;
      const processed = await processCapturedImage(picked);
      if (!processed) return;
      return;
    }

    await pickFromGalleryNative();
  };

  const retake = async (): Promise<void> => {
    if (uri) {
      await safeAsync(async () => FileSystem.deleteAsync(uri, { idempotent: true }), 'AddItemScreen.retakeCleanup');
    }
    setUri(null);
    setIsAnalyzing(false);
    setErrorHint(null);
  };

  const save = async (): Promise<void> => {
    if (!uri || isAnalyzing || isSaving) return;
    setIsSaving(true);
    const { data: saved, error } = await safeAsync(async () => saveImageToAppDir(uri, 'closet'), 'AddItemScreen.saveImage');
    if (error || !saved) {
      setIsSaving(false);
      setErrorHint('Could not save image. Please try again.');
      return;
    }

    if (editingItem) {
      await updateItem(editingItem.id, normalizeClothingItem({
        ...editingItem,
        imagePath: saved,
        category: labelToCategory(categoryLabel),
        colorHsl,
        colorHex,
        pattern,
        styleType,
        season,
        userCorrected: 1,
      }));
      showToast('Item updated');
      await safeAsync(async () => FileSystem.deleteAsync(uri, { idempotent: true }), 'AddItemScreen.cleanupTempUri');
      setUri(null);
      setIsSaving(false);
      navigation.goBack();
    } else {
      await addItem(normalizeClothingItem({
        id: `item-${Date.now()}`,
        imagePath: saved,
        category: labelToCategory(categoryLabel),
        colorHsl,
        colorHex,
        pattern,
        styleType,
        season,
        userCorrected: 1,
        timesWorn: 0,
        lastWorn: null,
        createdAt: new Date().toISOString(),
      }));

      showToast('Saved to closet');
      await safeAsync(async () => FileSystem.deleteAsync(uri, { idempotent: true }), 'AddItemScreen.cleanupTempUri');
      setUri(null);
      setIsSaving(false);
      navigation.goBack();
    }
  };

  return (
    <View style={styles.screen}>
      {isWeb || !permission?.granted ? <View style={styles.cameraFallback} /> : (
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          flash={flashOn ? 'on' : 'off'}
        />
      )}

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

      {!isWeb && permission?.granted ? (
        <Pressable style={styles.flashBtn} onPress={() => setFlashOn((s) => !s)}>
          <BlurView intensity={30} tint="dark" style={styles.iconBlur}>
            <MaterialIcons name={flashOn ? 'flash-on' : 'flash-off'} size={22} color="#e5e2e1" />
          </BlurView>
        </Pressable>
      ) : null}

      {!isWeb && cameraDenied ? (
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionBannerText}>Camera permission denied</Text>
          <Pressable style={styles.permissionBannerBtn} onPress={openSystemSettings}>
            <Text style={styles.permissionBannerBtnText}>Open Settings</Text>
          </Pressable>
        </View>
      ) : null}

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
        <View style={styles.captureActionsWrap}>
          <Pressable style={styles.captureBtn} onPress={takePhoto}>
            <LinearGradient colors={['#e6c487', '#c9a96e']} style={styles.captureBtnInner}>
              <MaterialIcons name={isWeb ? 'upload-file' : 'photo-camera'} size={20} color="#261900" />
              <Text style={styles.captureBtnLabel}>Camera</Text>
            </LinearGradient>
          </Pressable>

          <Pressable style={styles.captureSecondaryBtn} onPress={chooseFromGallery}>
            <MaterialIcons name={isWeb ? 'upload-file' : 'photo-library'} size={20} color="#e5e2e1" />
            <Text style={styles.captureSecondaryText}>Gallery</Text>
          </Pressable>
        </View>
      ) : null}

      {uri ? (
        <>
          <BlurView intensity={18} tint="dark" style={styles.scrim} />
          <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetY }] }]}>
            <View style={styles.handle} />

            <View style={styles.previewWrap}>
              <Image source={{ uri }} style={styles.previewImage} resizeMode="cover" />
            </View>

            {isAnalyzing ? (
              <View style={styles.analyzingRow}>
                <ActivityIndicator color="#e6c487" size="small" />
                <Text style={styles.analyzingText}>Analyzing item...</Text>
              </View>
            ) : null}

            <View style={styles.sheetHeaderTextWrap}>
              <Text style={styles.sheetTitle}>{editingItem ? 'Edit Item' : 'New Item'}</Text>
              <Text style={styles.sheetSubtitle}>
                Auto-detected: <Text style={styles.detectedText}>{detectedLabel}</Text>
              </Text>
              <Text style={styles.sheetConfidence}>
                Confidence: <Text style={styles.detectedText}>{detectionConfidence.toUpperCase()}</Text>
              </Text>
            </View>

            <Text style={styles.groupLabel}>Category</Text>
            {errorHint ? (
              <View style={styles.errorHint}>
                <MaterialIcons name="info-outline" size={14} color="#e6c487" />
                <Text style={styles.errorHintText}>{errorHint}</Text>
              </View>
            ) : null}
            {showDetectionHint && !errorHint ? (
              <View style={[styles.detectionHint, hintAcknowledged ? styles.detectionHintAcknowledged : null]}>
                <MaterialIcons
                  name={hintAcknowledged ? 'check-circle' : 'info-outline'}
                  size={14}
                  color={hintAcknowledged ? '#95d5a8' : '#e6c487'}
                />
                <Text style={styles.detectionHintText}>
                  {hintAcknowledged
                    ? 'Thanks. Your manual category selection will be saved.'
                    : 'This detection has low confidence. Please confirm the category before saving.'}
                </Text>
              </View>
            ) : null}
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

            <Text style={styles.groupLabel}>Style (multi-select)</Text>
            <View style={styles.pillWrap}>
              {STYLE_OPTIONS.map((option) => {
                const selected = styleSelections.includes(option);
                return (
                  <Pressable
                    key={option}
                    onPress={() => toggleStyle(option)}
                    style={[styles.pill, selected ? styles.pillSelected : styles.pillUnselected]}
                  >
                    <Text style={[styles.pillText, selected ? styles.pillTextSelected : styles.pillTextUnselected]}>{formatLabel(option)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.groupLabel}>Pattern</Text>
            <View style={styles.pillWrap}>
              {PATTERN_OPTIONS.map((option) => {
                const selected = pattern === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setPattern(option)}
                    style={[styles.pill, selected ? styles.pillSelected : styles.pillUnselected]}
                  >
                    <Text style={[styles.pillText, selected ? styles.pillTextSelected : styles.pillTextUnselected]}>{formatLabel(option)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.groupLabel}>Season</Text>
            <View style={styles.pillWrap}>
              {SEASON_OPTIONS.map((option) => {
                const selected = season === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setSeason(option)}
                    style={[styles.pill, selected ? styles.pillSelected : styles.pillUnselected]}
                  >
                    <Text style={[styles.pillText, selected ? styles.pillTextSelected : styles.pillTextUnselected]}>{formatLabel(option)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Animated.View style={{ transform: [{ scale: saveScale }] }}>
              <Pressable
                onPress={save}
                disabled={isAnalyzing || isSaving}
                onPressIn={() => Animated.spring(saveScale, { toValue: 0.95, useNativeDriver: true, bounciness: 0 }).start()}
                onPressOut={() => Animated.spring(saveScale, { toValue: 1, useNativeDriver: true, bounciness: 0 }).start()}
              >
                <LinearGradient
                  colors={['#e6c487', '#c9a96e']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.saveBtn}
                >
                  {(isAnalyzing || isSaving) ? <ActivityIndicator color="#261900" size="small" /> : null}
                  <Text style={styles.saveBtnText}>{isAnalyzing ? 'Analyzing...' : isSaving ? 'Saving...' : 'Save to Closet'}</Text>
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
    backgroundColor: '#131313',
  },
  cameraFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1c1b1b',
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
  permissionBanner: {
    position: 'absolute',
    top: 96,
    left: 20,
    right: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(24,24,24,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(230,196,135,0.30)',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  permissionBannerText: {
    color: '#e5e2e1',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    flex: 1,
  },
  permissionBannerBtn: {
    borderRadius: 9999,
    backgroundColor: '#c9a96e',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  permissionBannerBtnText: {
    color: '#261900',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
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
    alignSelf: 'center',
  },
  captureActionsWrap: {
    position: 'absolute',
    bottom: 52,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 20,
  },
  captureSecondaryBtn: {
    height: 52,
    borderRadius: 9999,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(32,31,31,0.90)',
    borderWidth: 1,
    borderColor: 'rgba(229,226,225,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  captureSecondaryText: {
    color: '#e5e2e1',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  captureBtnInner: {
    width: 112,
    height: 78,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 4,
    borderColor: 'rgba(14,14,14,0.40)',
  },
  captureBtnLabel: {
    color: '#261900',
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
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
  previewWrap: {
    width: '100%',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.15)',
    marginBottom: 12,
  },
  previewImage: {
    width: '100%',
    height: 220,
  },
  analyzingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  analyzingText: {
    color: '#e6c487',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
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
  sheetConfidence: {
    color: '#a9a39a',
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  detectedText: {
    color: '#e6c487',
    fontFamily: 'Inter_400Regular',
    fontStyle: 'italic',
  },
  detectionHint: {
    marginTop: -2,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(230,196,135,0.35)',
    backgroundColor: 'rgba(230,196,135,0.08)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detectionHintAcknowledged: {
    borderColor: 'rgba(149,213,168,0.35)',
    backgroundColor: 'rgba(149,213,168,0.10)',
  },
  detectionHintText: {
    flex: 1,
    color: '#d0c5b5',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 18,
  },
  errorHint: {
    marginTop: -2,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.45)',
    backgroundColor: 'rgba(220,38,38,0.12)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorHintText: {
    flex: 1,
    color: '#f3d1d1',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 18,
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

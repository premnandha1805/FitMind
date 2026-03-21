import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Image, ScrollView, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { autoTagClothing } from '../services/mlkit';
import { ensureImageUnder4Mb, saveImageToAppDir } from '../utils/imageUtils';
import { safeAsync } from '../utils/safeAsync';
import { useClosetStore } from '../store/useClosetStore';
import { rgbToHsl, rgbToHex } from '../utils/colorUtils';

function randomColorFromUri(uri: string): { hex: string; hsl: string } {
  let hash = 0;
  for (let i = 0; i < uri.length; i += 1) hash = (hash + uri.charCodeAt(i) * (i + 1)) % 255;
  const r = hash;
  const g = (hash * 2) % 255;
  const b = (hash * 3) % 255;
  const hsl = rgbToHsl(r, g, b);
  return { hex: rgbToHex(r, g, b), hsl: `hsl(${hsl.h.toFixed(0)},${hsl.s.toFixed(0)},${hsl.l.toFixed(0)})` };
}

export default function AddItemScreen(): React.JSX.Element {
  const addItem = useClosetStore((s) => s.addItem);
  const [uri, setUri] = useState<string | null>(null);
  const [category, setCategory] = useState<'top' | 'bottom' | 'shoes' | 'accessory' | 'outerwear' | 'other'>('other');
  const [pattern, setPattern] = useState<string>('solid');
  const [styleType, setStyleType] = useState<string>('classic');
  const [colorHex, setColorHex] = useState<string>('#808080');
  const [colorHsl, setColorHsl] = useState<string>('hsl(0,0,50)');

  const pick = async (): Promise<void> => {
    await safeAsync(async () => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Allow gallery access to add clothing items.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (result.canceled) return;
      const original = result.assets[0].uri;
      const compressed = await ensureImageUnder4Mb(original);
      setUri(compressed);

      const auto = await autoTagClothing(compressed);
      setCategory(auto.category);
      setPattern(auto.pattern);

      const color = randomColorFromUri(compressed);
      setColorHex(color.hex);
      setColorHsl(color.hsl);
    }, 'AddItemScreen.pick');
  };

  const save = async (): Promise<void> => {
    if (!uri) return;
    const { data: saved, error } = await safeAsync(async () => saveImageToAppDir(uri, 'closet'), 'AddItemScreen.saveImage');
    if (error || !saved) {
      Alert.alert('Save failed', 'Image save failed. Please retry.');
      return;
    }

    await addItem({
      id: `item-${Date.now()}`,
      imagePath: saved,
      category,
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
    await safeAsync(async () => FileSystem.deleteAsync(uri, { idempotent: true }), 'AddItemScreen.cleanupTempUri');
    setUri(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Now let's build your digital wardrobe</Text>
      <Text style={styles.subtitle}>Add at least 6 items to get started</Text>
      <Pressable style={styles.btn} onPress={pick}><Text style={styles.btnText}>Add My First Item</Text></Pressable>
      {uri ? <Image source={{ uri }} style={styles.image} /> : null}
      <Text style={styles.label}>Category</Text>
      <TextInput value={category} onChangeText={(v) => setCategory(v as typeof category)} style={styles.input} />
      <Text style={styles.label}>Pattern</Text>
      <TextInput value={pattern} onChangeText={setPattern} style={styles.input} />
      <Text style={styles.label}>Style Type</Text>
      <TextInput value={styleType} onChangeText={setStyleType} style={styles.input} />
      <Text style={styles.label}>Color Hex</Text>
      <TextInput value={colorHex} onChangeText={setColorHex} style={styles.input} />
      <Pressable style={styles.btn} onPress={save}><Text style={styles.btnText}>Save Item</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  subtitle: { color: '#475569', marginBottom: 12 },
  btn: { backgroundColor: '#0f766e', borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontWeight: '700' },
  image: { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: '#e2e8f0', marginTop: 10 },
  label: { marginTop: 10, fontWeight: '700' },
  input: { marginTop: 6, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 10 },
});

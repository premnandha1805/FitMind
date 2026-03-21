import React from 'react';
import { Image, Pressable, Text, View, StyleSheet } from 'react-native';
import { ClothingItem as ClothingItemType } from '../types/models';

interface Props {
  item: ClothingItemType;
  onPress?: () => void;
}

export function ClothingItem({ item, onPress }: Props): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <Image source={{ uri: item.imagePath }} style={styles.image} />
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: item.colorHex }]} />
        <Text style={styles.badge}>{item.styleType}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, margin: 4, borderRadius: 10, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  image: { width: '100%', height: 110, backgroundColor: '#e5e7eb' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  badge: { fontSize: 11, color: '#334155', textTransform: 'capitalize' },
});

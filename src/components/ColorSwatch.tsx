import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

interface Props {
  color: string;
  selected: boolean;
  onPress: () => void;
}

export function ColorSwatch({ color, selected, onPress }: Props): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={[styles.swatch, { backgroundColor: color }, selected && styles.selected]}>
      <View />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  swatch: { width: 32, height: 32, borderRadius: 16, margin: 6, borderWidth: 1, borderColor: '#cbd5e1' },
  selected: { borderWidth: 3, borderColor: '#0f766e' },
});

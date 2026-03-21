import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
  item: string;
}

export function MissingItemCard({ item }: Props): React.JSX.Element {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>This look would be elevated with a {item}</Text>
      <Text style={styles.subtitle}>Consider adding one to your wardrobe</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    backgroundColor: '#fffbeb',
    padding: 10,
    marginTop: 8,
  },
  title: {
    color: '#92400e',
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 4,
    color: '#b45309',
  },
});

import React from 'react';
import { FlatList, Text, View, StyleSheet } from 'react-native';
import { useOutfitStore } from '../store/useOutfitStore';

export default function HistoryScreen(): React.JSX.Element {
  const outfits = useOutfitStore((s) => s.outfits);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>History</Text>
      <FlatList
        data={outfits}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.h}>{item.occasion}</Text>
            <Text>Score: {item.finalScore.toFixed(1)}/10</Text>
            <Text>Created: {new Date(item.createdAt).toLocaleString()}</Text>
          </View>
        )}
        ListEmptyComponent={<Text>No outfit history yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '900', marginBottom: 10 },
  card: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, marginBottom: 8 },
  h: { fontWeight: '700' },
});

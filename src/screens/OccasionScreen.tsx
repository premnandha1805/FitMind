import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { OCCASION_KEYWORDS } from '../constants/occasions';
import { useClosetStore } from '../store/useClosetStore';
import { useOutfitStore } from '../store/useOutfitStore';
import { useTasteStore } from '../store/useTasteStore';
import { useUserStore } from '../store/useUserStore';

function mapOccasion(input: string): string {
  const lower = input.toLowerCase();
  const hit = OCCASION_KEYWORDS.find((rule) => rule.words.some((word) => lower.includes(word)));
  return hit?.mapped ?? 'casual';
}

export default function OccasionScreen(): React.JSX.Element {
  const [eventText, setEventText] = useState('');
  const mapped = useMemo(() => mapOccasion(eventText), [eventText]);

  const items = useClosetStore((s) => s.items);
  const generate = useOutfitStore((s) => s.generate);
  const best = useOutfitStore((s) => s.outfits[0] ?? null);
  const taste = useTasteStore((s) => s.profile);
  const user = useUserStore((s) => s.profile);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Occasion Planner</Text>
      <TextInput
        placeholder="Describe your event..."
        value={eventText}
        onChangeText={setEventText}
        style={styles.input}
      />
      <Text style={styles.map}>Detected: {mapped}</Text>
      <Pressable
        style={styles.btn}
        onPress={async () => {
          if (!user || !taste) return;
          await generate(mapped, items, user, taste);
        }}
      >
        <Text style={styles.btnText}>Plan My Outfit</Text>
      </Pressable>

      {best ? (
        <View style={styles.card}>
          <Text style={styles.h}>Best match for {mapped}</Text>
          <Text>Perfect for {eventText || 'your event'}. The color combination is especially flattering for your tone.</Text>
          {best.reasons.map((reason) => <Text key={reason}>• {reason}</Text>)}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '900' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, padding: 10, marginTop: 10 },
  map: { marginTop: 8, color: '#475569' },
  btn: { marginTop: 10, backgroundColor: '#0f766e', borderRadius: 12, padding: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  card: { marginTop: 12, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12 },
  h: { fontWeight: '800', marginBottom: 6 },
});

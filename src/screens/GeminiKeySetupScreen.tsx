import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setGeminiKey, validateGeminiKey } from '../services/gemini';
import { safeAsync } from '../utils/safeAsync';
import { useResponsive } from '../utils/responsive';

interface Props {
  onValid: () => void;
}

export default function GeminiKeySetupScreen({ onValid }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { rs } = useResponsive();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: Math.max(24, insets.top + 12),
          paddingBottom: Math.max(24, insets.bottom + 10),
          paddingHorizontal: rs(24, 14, 28),
        },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={[styles.title, { fontSize: rs(24, 20, 26) }]}>Your Gemini API key is invalid.</Text>
        <Text style={styles.sub}>Get a free key at aistudio.google.com</Text>
        <TextInput
          value={key}
          onChangeText={setKey}
          placeholder="Paste Gemini key"
          placeholderTextColor="#998f81"
          autoCapitalize="none"
          style={styles.input}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={styles.btn}
          onPress={async () => {
            const { error: saveError } = await safeAsync(async () => setGeminiKey(key), 'GeminiKeySetup.saveKey');
            if (saveError) {
              setError('Could not save key. Please try again.');
              return;
            }
            const { data: valid } = await safeAsync(async () => validateGeminiKey(), 'GeminiKeySetup.validateKey');
            if (!valid) {
              setError('This key is invalid. Please check and retry.');
              return;
            }
            onValid();
          }}
        >
          <Text style={styles.btnText}>Save and Continue</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: 'center', backgroundColor: '#131313' },
  card: { backgroundColor: '#201f1f', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(77,70,58,0.20)', padding: 20 },
  title: { fontSize: 24, fontWeight: '900', color: '#e6c487' },
  sub: { marginTop: 8, color: '#d0c5b5' },
  input: { marginTop: 14, borderWidth: 1, borderColor: '#4d463a', borderRadius: 10, padding: 10, color: '#e5e2e1', backgroundColor: '#1c1b1b' },
  error: { marginTop: 8, color: '#dc2626' },
  btn: { marginTop: 14, backgroundColor: '#c9a96e', padding: 12, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#261900', fontWeight: '800' },
});

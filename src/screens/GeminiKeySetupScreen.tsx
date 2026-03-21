import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { setGeminiKey, validateGeminiKey } from '../services/gemini';
import { safeAsync } from '../utils/safeAsync';

interface Props {
  onValid: () => void;
}

export default function GeminiKeySetupScreen({ onValid }: Props): React.JSX.Element {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Gemini API key is invalid.</Text>
      <Text style={styles.sub}>Get a free key at aistudio.google.com</Text>
      <TextInput value={key} onChangeText={setKey} placeholder="Paste Gemini key" autoCapitalize="none" style={styles.input} />
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '900', color: '#0f172a' },
  sub: { marginTop: 8, color: '#475569' },
  input: { marginTop: 14, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 10 },
  error: { marginTop: 8, color: '#dc2626' },
  btn: { marginTop: 14, backgroundColor: '#0f766e', padding: 12, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800' },
});

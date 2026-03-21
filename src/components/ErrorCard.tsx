import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  icon: string;
  title: string;
  description: string;
  actionText: string;
  onAction: () => void;
}

export function ErrorCard({ icon, title, description, actionText, onAction }: Props): React.JSX.Element {
  return (
    <View style={styles.card}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <Pressable style={styles.button} onPress={onAction}>
        <Text style={styles.buttonText}>{actionText}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 12, padding: 12, marginVertical: 10 },
  icon: { fontSize: 18 },
  title: { marginTop: 6, fontWeight: '800', color: '#7c2d12' },
  description: { marginTop: 4, color: '#9a3412' },
  button: { marginTop: 10, backgroundColor: '#ea580c', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, alignSelf: 'flex-start' },
  buttonText: { color: '#fff', fontWeight: '700' },
});

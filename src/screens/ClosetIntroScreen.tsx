import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { CommonActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useResponsive } from '../utils/responsive';

type Props = StackScreenProps<RootStackParamList, 'ClosetIntro'>;

export default function ClosetIntroScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { rs } = useResponsive();

  const handleAddFirstItem = (): void => {
    navigation.dispatch(
      CommonActions.reset({
        index: 1,
        routes: [{ name: 'MainTabs' }, { name: 'AddItem' }],
      })
    );
  };

  return (
    <View style={[styles.screen, { paddingHorizontal: rs(24, 14, 28), paddingTop: insets.top, paddingBottom: Math.max(16, insets.bottom) }]}>
      <View style={styles.centerWrap}>
        <MaterialIcons name="checkroom" size={rs(64, 52, 72)} color="#e6c487" />
        <Text style={[styles.title, { fontSize: rs(28, 22, 32), lineHeight: rs(38, 30, 42) }]}>Now let's build your digital wardrobe</Text>
        <Text style={styles.subtitle}>Add at least 6 items to get started</Text>

        <Pressable style={styles.ctaPressable} onPress={handleAddFirstItem}>
          <LinearGradient
            colors={['#e6c487', '#c9a96e']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cta}
          >
            <Text style={styles.ctaText}>Add My First Item</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#131313',
    paddingHorizontal: 24,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 20,
    color: '#e5e2e1',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 28,
    lineHeight: 38,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 12,
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  ctaPressable: {
    marginTop: 30,
    width: '100%',
  },
  cta: {
    height: 56,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: '#261900',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

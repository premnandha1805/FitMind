import React, { useRef } from 'react';
import {
  Animated,
  Image,
  ImageStyle,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts as useInterFonts, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import {
  useFonts as usePlayfairFonts,
  PlayfairDisplay_700Bold_Italic,
} from '@expo-google-fonts/playfair-display';
import { useFonts as useNotoSerifFonts, NotoSerif_400Regular_Italic } from '@expo-google-fonts/noto-serif';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { RootStackParamList } from '../navigation/types';

type Props = StackScreenProps<RootStackParamList, 'Onboarding'>;

export default function OnboardingScreen({ navigation }: Props): React.JSX.Element {
  const [interLoaded] = useInterFonts({ Inter_400Regular, Inter_600SemiBold });
  const [playfairLoaded] = usePlayfairFonts({ PlayfairDisplay_700Bold_Italic });
  const [notoLoaded] = useNotoSerifFonts({ NotoSerif_400Regular_Italic });
  const ctaScale = useRef(new Animated.Value(1)).current;
  const webSilhouetteStyle: ImageStyle | undefined = Platform.OS === 'web'
    ? ({ filter: 'grayscale(100%)', mixBlendMode: 'luminosity' } as unknown as ImageStyle)
    : undefined;

  const animateCta = (toValue: number): void => {
    Animated.timing(ctaScale, {
      toValue,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  if (!interLoaded || !playfairLoaded || !notoLoaded) {
    return <View style={styles.loadingFill} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.backgroundBase} />
      <Svg style={styles.radialGlow}>
        <Defs>
          <RadialGradient id="bgGlow" cx="50%" cy="50%" rx="70%" ry="70%" fx="50%" fy="50%">
            <Stop offset="0%" stopColor="rgba(32,31,31,0.4)" />
            <Stop offset="70%" stopColor="rgba(32,31,31,0)" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#bgGlow)" />
      </Svg>

      <Image
        source={require('../../assets/icon.png')}
        resizeMode="cover"
        style={[styles.silhouette, webSilhouetteStyle]}
      />

      <View style={styles.content}>
        <View style={styles.topSection}>
          <Text style={styles.brand}>FitMind</Text>
          <Text style={styles.tagline}>Your AI stylist. Your wardrobe. Your rules.</Text>
        </View>

        <View style={styles.middleSection}>
          <View style={styles.valuePill}>
            <Ionicons name="sparkles" size={12} color="#e6c487" />
            <Text style={styles.pillText}>PERSONALIZED DIGITAL ATELIER</Text>
          </View>
        </View>

        <View style={styles.bottomSection}>
          <Animated.View style={[styles.ctaWrap, { transform: [{ scale: ctaScale }] }]}>
            <Pressable
              onPressIn={() => animateCta(0.98)}
              onPressOut={() => animateCta(1)}
              onPress={() => navigation.navigate('SkinTone')}
            >
              <LinearGradient
                colors={['#e6c487', '#c9a96e']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cta}
              >
                <Text style={styles.ctaText}>GET STARTED</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
          <Text style={styles.footer}>The Digital Atelier © 2024</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingFill: {
    flex: 1,
    backgroundColor: '#131313',
  },
  container: {
    flex: 1,
    backgroundColor: '#131313',
  },
  backgroundBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0D0D0D',
  },
  radialGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  silhouette: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.2,
    tintColor: '#e5e2e1',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 80,
    justifyContent: 'space-between',
  },
  topSection: {
    alignItems: 'center',
  },
  brand: {
    fontSize: 72,
    color: '#e6c487',
    fontFamily: 'PlayfairDisplay_700Bold_Italic',
    textShadowColor: 'rgba(230,196,135,0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  tagline: {
    marginTop: 8,
    color: '#d7c5a0',
    fontSize: 18,
    fontFamily: 'NotoSerif_400Regular_Italic',
  },
  middleSection: {
    alignItems: 'center',
  },
  valuePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(28,27,27,0.40)',
    borderColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  pillText: {
    color: '#998f81',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  bottomSection: {
    alignItems: 'center',
  },
  ctaWrap: {
    width: '100%',
    shadowColor: '#e6c487',
    shadowOpacity: 0.2,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  cta: {
    width: '100%',
    height: 56,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: '#261900',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontFamily: 'Inter_600SemiBold',
  },
  footer: {
    marginTop: 24,
    color: 'rgba(153,143,129,0.50)',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontFamily: 'Inter_400Regular',
  },
});

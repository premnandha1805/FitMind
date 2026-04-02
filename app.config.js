import dotenv from 'dotenv';

dotenv.config({ override: true });

export default {
  expo: {
    name: 'FitMind',
    slug: 'fitmind',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      softwareKeyboardLayoutMode: 'resize',
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: ['expo-sqlite', 'expo-secure-store', 'expo-font'],
    extra: {
      geminiApiKey: process.env.GEMINI_API_KEY,
    },
  },
};

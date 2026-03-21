import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Text, View, Pressable, StyleSheet } from 'react-native';
import OnboardingScreen from '../screens/OnboardingScreen';
import SkinToneScreen from '../screens/SkinToneScreen';
import StylePreferencesScreen from '../screens/StylePreferencesScreen';
import HomeScreen from '../screens/HomeScreen';
import StyleAdvisorScreen from '../screens/StyleAdvisorScreen';
import ClosetScreen from '../screens/ClosetScreen';
import AddItemScreen from '../screens/AddItemScreen';
import FitCheckScreen from '../screens/FitCheckScreen';
import OccasionScreen from '../screens/OccasionScreen';
import HistoryScreen from '../screens/HistoryScreen';
import ProfileScreen from '../screens/ProfileScreen';
import WhyThisOutfitScreen from '../screens/WhyThisOutfitScreen';
import { MainTabParamList, RootStackParamList } from './types';
import { useUserStore } from '../store/useUserStore';

const Stack = createStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

function ClosetIntroScreen({ navigation }: { navigation: { replace: (name: 'MainTabs') => void; navigate: (name: 'AddItem') => void } }): React.JSX.Element {
  return (
    <View style={styles.intro}>
      <Text style={styles.h}>Now let's build your digital wardrobe</Text>
      <Text style={styles.p}>Add at least 6 items to get started</Text>
      <Pressable style={styles.btn} onPress={() => navigation.navigate('AddItem')}><Text style={styles.btnText}>Add My First Item</Text></Pressable>
      <Pressable onPress={() => navigation.replace('MainTabs')}><Text style={styles.skip}>Skip for now</Text></Pressable>
    </View>
  );
}

function MainTabs(): React.JSX.Element {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Home: 'home-outline',
            StyleAdvisor: 'sparkles-outline',
            Occasion: 'calendar-outline',
            Closet: 'shirt-outline',
            FitCheck: 'camera-outline',
            History: 'time-outline',
            Profile: 'person-outline',
          };
          const iconName = icons[route.name] ?? 'ellipse-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="StyleAdvisor" component={StyleAdvisorScreen} options={{ title: 'Style Advisor' }} />
      <Tabs.Screen name="Occasion" component={OccasionScreen} />
      <Tabs.Screen name="Closet" component={ClosetScreen} />
      <Tabs.Screen name="FitCheck" component={FitCheckScreen} />
      <Tabs.Screen name="History" component={HistoryScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

export default function AppNavigator(): React.JSX.Element {
  const profile = useUserStore((s) => s.profile);
  const onboarded = profile?.onboarded === 1;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: true }}>
        {!onboarded ? (
          <>
            <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
            <Stack.Screen name="SkinTone" component={SkinToneScreen} options={{ title: 'Skin Tone' }} />
            <Stack.Screen name="StylePreferences" component={StylePreferencesScreen} options={{ title: 'Style Preferences' }} />
            <Stack.Screen name="ClosetIntro" component={ClosetIntroScreen} options={{ title: 'Closet Setup' }} />
            <Stack.Screen name="AddItem" component={AddItemScreen} options={{ title: 'Add Item' }} />
            <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="WhyThisOutfit" component={WhyThisOutfitScreen} options={{ title: 'Why This Outfit' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="SkinTone" component={SkinToneScreen} options={{ title: 'Skin Tone' }} />
            <Stack.Screen name="AddItem" component={AddItemScreen} options={{ title: 'Add Item' }} />
            <Stack.Screen name="WhyThisOutfit" component={WhyThisOutfitScreen} options={{ title: 'Why This Outfit' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  intro: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#f8fafc' },
  h: { fontSize: 26, fontWeight: '900', color: '#0f172a' },
  p: { marginTop: 8, color: '#475569' },
  btn: { marginTop: 16, backgroundColor: '#0f766e', borderRadius: 12, padding: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  skip: { marginTop: 12, color: '#0369a1', textAlign: 'center' },
});

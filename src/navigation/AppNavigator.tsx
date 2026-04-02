import React from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import OnboardingScreen from '../screens/OnboardingScreen';
import SkinToneScreen from '../screens/SkinToneScreen';
import StylePreferencesScreen from '../screens/StylePreferencesScreen';
import ClosetIntroScreen from '../screens/ClosetIntroScreen';
import HomeScreen from '../screens/HomeScreen';
import StyleAdvisorScreen from '../screens/StyleAdvisorScreen';
import ClosetScreen from '../screens/ClosetScreen';
import AddItemScreen from '../screens/AddItemScreen';
import FitCheckScreen from '../screens/FitCheckScreen';
import HistoryScreen from '../screens/HistoryScreen';
import ProfileScreen from '../screens/ProfileScreen';
import WhyThisOutfitScreen from '../screens/WhyThisOutfitScreen';
import { MainTabParamList, RootStackParamList } from './types';
import { useUserStore } from '../store/useUserStore';

const Stack = createStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

const navigationRef = createNavigationContainerRef<RootStackParamList>();

function MainTabs({ navigation }: StackScreenProps<RootStackParamList, 'MainTabs'>): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const [activeTab, setActiveTab] = React.useState<keyof MainTabParamList>('Home');

  return (
    <View style={styles.mainTabsWrap}>
      <Tabs.Navigator
        screenListeners={{
          state: (event) => {
            const tabState = event.data.state as { index: number; routes: Array<{ name: string }> } | undefined;
            const current = tabState?.routes?.[tabState.index]?.name;
            if (current) {
              setActiveTab(current as keyof MainTabParamList);
            }
          },
        }}
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: '#e6c487',
          tabBarInactiveTintColor: '#7f7a71',
          tabBarHideOnKeyboard: true,
          tabBarBackground: () => <View style={{ flex: 1, backgroundColor: 'rgba(20,20,20,0.90)' }} />,
          tabBarLabelStyle: {
            fontSize: compact ? 9 : 10,
            fontWeight: '700',
            marginBottom: 2,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
          },
          tabBarStyle: {
            position: 'absolute',
            left: 10,
            right: 10,
            bottom: 8,
            height: (compact ? 64 : 70) + insets.bottom,
            paddingTop: 6,
            paddingBottom: Math.max(insets.bottom, 10),
            backgroundColor: 'transparent',
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.08)',
            borderRadius: 28,
            overflow: 'hidden',
            elevation: 10,
            shadowColor: '#000',
            shadowOpacity: 0.28,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
          },
          tabBarItemStyle: {
            marginHorizontal: 2,
            marginTop: 2,
            borderRadius: 999,
          },
          tabBarActiveBackgroundColor: 'rgba(230,196,135,0.12)',
          tabBarIcon: ({ color, size }) => {
            const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
              Home: 'home-outline',
              StyleAdvisor: 'sparkles-outline',
              Closet: 'shirt-outline',
              FitCheck: 'camera-outline',
              History: 'time-outline',
            };
            const iconName = icons[route.name] ?? 'ellipse-outline';
            const iconSize = compact ? Math.max(17, size - 3) : size;
            return <Ionicons name={iconName} size={iconSize} color={color} />;
          },
        })}
      >
        <Tabs.Screen name="Home" component={HomeScreen} />
        <Tabs.Screen name="StyleAdvisor" component={StyleAdvisorScreen} options={{ title: 'Advisor' }} />
        <Tabs.Screen name="Closet" component={ClosetScreen} />
        <Tabs.Screen name="FitCheck" component={FitCheckScreen} />
        <Tabs.Screen name="History" component={HistoryScreen} />
      </Tabs.Navigator>

      {activeTab !== 'Closet' && activeTab !== 'StyleAdvisor' ? (
        <Pressable
          style={[styles.profileFloatingBtn, { top: insets.top + 10 }]}
          onPress={() => navigation.navigate('Profile')}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
          <Ionicons name="person-outline" size={18} color="#e6c487" />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function AppNavigator(): React.JSX.Element {
  const profile = useUserStore((s) => s.profile);
  const onboarded = profile?.onboarded === 1;

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        const state = navigationRef.getState();
        console.log('Registered screens:', state?.routeNames ?? []);
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: true }}>
        {!onboarded ? (
          <>
            <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
            <Stack.Screen name="SkinTone" component={SkinToneScreen} options={{ headerShown: false }} />
            <Stack.Screen name="StylePreferences" component={StylePreferencesScreen} options={{ headerShown: false }} />
            <Stack.Screen name="ClosetIntro" component={ClosetIntroScreen} options={{ headerShown: false }} />
            <Stack.Screen name="AddItem" component={AddItemScreen} options={{ title: 'Add Item' }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
            <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="WhyThisOutfit" component={WhyThisOutfitScreen} options={{ title: 'Why This Outfit' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
            <Stack.Screen name="SkinTone" component={SkinToneScreen} options={{ headerShown: false }} />
            <Stack.Screen name="AddItem" component={AddItemScreen} options={{ title: 'Add Item' }} />
            <Stack.Screen name="WhyThisOutfit" component={WhyThisOutfitScreen} options={{ title: 'Why This Outfit' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  mainTabsWrap: {
    flex: 1,
  },
  profileFloatingBtn: {
    position: 'absolute',
    right: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,16,16,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(230,196,135,0.35)',
    zIndex: 60,
    elevation: 12,
  },
});

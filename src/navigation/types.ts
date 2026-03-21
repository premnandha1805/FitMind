export type RootStackParamList = {
  Onboarding: undefined;
  SkinTone: { returnToProfile?: boolean } | undefined;
  StylePreferences: undefined;
  ClosetIntro: undefined;
  MainTabs: undefined;
  AddItem: undefined;
  WhyThisOutfit: { outfitId: string };
};

export type MainTabParamList = {
  Home: undefined;
  StyleAdvisor: undefined;
  Closet: undefined;
  FitCheck: undefined;
  Occasion: undefined;
  History: undefined;
  Profile: undefined;
};

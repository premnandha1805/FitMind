export type RootStackParamList = {
  Onboarding: undefined;
  SkinTone: { returnToProfile?: boolean } | undefined;
  StylePreferences: undefined;
  ClosetIntro: undefined;
  MainTabs: undefined;
  Profile: undefined;
  AddItem:
    | {
      existingItemId?: string;
      prefill?: {
        category?: 'top' | 'bottom' | 'shoes' | 'accessory' | 'outerwear';
        pattern?: string;
        styleType?: string;
        colorHex?: string;
        season?: string;
        userCorrected?: number;
        timesWorn?: number;
      };
    }
    | undefined;
  WhyThisOutfit: { outfitId: string };
};

export type MainTabParamList = {
  Home: undefined;
  StyleAdvisor: { initialMode?: 'chat' | 'planner' } | undefined;
  Closet: undefined;
  FitCheck: undefined;
  History: undefined;
};

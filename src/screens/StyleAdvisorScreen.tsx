import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MainTabParamList } from '../navigation/types';
import { executeSqlWithRetry } from '../db/queries';
import { AdvisorMessage } from '../components/AdvisorMessage';
import { MissingItemCard } from '../components/MissingItemCard';
import {
  AdvisorResponse,
  ScenarioContext,
  buildAdvisorResponse,
  extractScenarioContext,
  filterClosetForScenario,
  generateScenarioOutfit,
  handleVideoCallMode,
} from '../services/scenarioEngine';
import { recordWorn } from '../services/feedbackEngine';
import { useClosetStore } from '../store/useClosetStore';
import { useTasteStore } from '../store/useTasteStore';
import { useUserStore } from '../store/useUserStore';
import { Outfit } from '../types/models';
import { safeAsync } from '../utils/safeAsync';

type ErrorType = 'gemini' | 'offline' | 'rate_limit' | 'closet';

interface UserMessage {
  id: string;
  type: 'user';
  text: string;
}

interface TypingMessage {
  id: string;
  type: 'typing';
}

interface ThinkingMessage {
  id: string;
  type: 'thinking';
  text: string;
}

interface AdvisorChatMessage {
  id: string;
  type: 'advisor';
  response: AdvisorResponse;
  context: ScenarioContext;
  usedOutfitKeys: string[];
  originalPrompt: string;
  isRefreshing: boolean;
  usedFallback: boolean;
}

interface ErrorMessage {
  id: string;
  type: 'error';
  errorType: ErrorType;
  text: string;
  prompt?: string;
  context?: ScenarioContext;
}

type ChatMessage = UserMessage | TypingMessage | ThinkingMessage | AdvisorChatMessage | ErrorMessage;

const QUICK_CHIPS: Array<{ label: string; prompt: string }> = [
  { label: 'Job Interview', prompt: 'I have a job interview tomorrow' },
  { label: 'First Date', prompt: 'Going on a first date tonight' },
  { label: 'Wedding Guest', prompt: 'Attending a wedding as a guest' },
  { label: 'Office Casual', prompt: 'Casual Friday at the office' },
  { label: 'Night Out', prompt: 'Going out with friends tonight' },
  { label: 'Festive/Ethnic', prompt: 'Attending a traditional festival' },
];

const PLANNER_OCCASIONS = ['Work', 'Date', 'Wedding', 'Party', 'Travel', 'Casual'] as const;
const PLANNER_TIMES = ['Morning', 'Afternoon', 'Evening'] as const;
const PLANNER_WEATHER = ['Warm', 'Crisp', 'Cold'] as const;
const TAB_BAR_CLEARANCE = 92;

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function outfitKey(outfit: Outfit | null): string | null {
  if (!outfit) return null;
  return [...outfit.itemIds].sort().join('|');
}

function mapEngineError(error: string): ErrorType {
  if (error === 'NO_INTERNET' || error.toLowerCase().includes('internet')) {
    return 'offline';
  }
  if (error === 'RATE_LIMIT' || error.includes('429') || error.toLowerCase().includes('daily limit')) {
    return 'rate_limit';
  }
  return 'gemini';
}

function TypingDots(): React.JSX.Element {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      })
    ).start();
  }, [anim]);

  return (
    <View style={styles.typingCard}>
      <View style={styles.typingWrap}>
        {[0, 1, 2].map((index) => {
          const progress = anim.interpolate({
            inputRange: [0, 0.33, 0.66, 1],
            outputRange: index === 0 ? [0, 1, 0, 0] : index === 1 ? [0, 0, 1, 0] : [0, 0, 0, 1],
          });

          const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.2] });
          const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

          return <Animated.View key={index} style={[styles.dot, { opacity, transform: [{ scale }] }]} />;
        })}
      </View>
      <Text style={styles.typingLabel}>Styling your moment...</Text>
    </View>
  );
}

function ConfettiOverlay({ visible }: { visible: boolean }): React.JSX.Element | null {
  const values = useMemo(() => Array.from({ length: 12 }, () => new Animated.Value(0)), []);

  useEffect(() => {
    if (!visible) return;
    values.forEach((value, idx) => {
      value.setValue(0);
      Animated.timing(value, {
        toValue: 1,
        duration: 1300 + idx * 30,
        useNativeDriver: true,
      }).start();
    });
  }, [visible, values]);

  if (!visible) return null;

  return (
    <View pointerEvents="none" style={styles.confettiLayer}>
      {values.map((value, idx) => {
        const translateY = value.interpolate({ inputRange: [0, 1], outputRange: [-20, 400] });
        const rotate = value.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '200deg'] });
        return (
          <Animated.View
            key={idx}
            style={[
              styles.confetti,
              {
                left: `${(idx * 8) + 5}%`,
                backgroundColor: idx % 2 === 0 ? '#0f766e' : '#f59e0b',
                transform: [{ translateY }, { rotate }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

export default function StyleAdvisorScreen(): React.JSX.Element {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const scrollRef = useRef<ScrollView | null>(null);
  const [input, setInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const [headerPressed, setHeaderPressed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [confettiVisible, setConfettiVisible] = useState(false);
  const [advisorMode, setAdvisorMode] = useState<'chat' | 'planner'>('chat');
  const [plannerOccasion, setPlannerOccasion] = useState<(typeof PLANNER_OCCASIONS)[number]>('Casual');
  const [plannerTime, setPlannerTime] = useState<(typeof PLANNER_TIMES)[number]>('Evening');
  const [plannerWeather, setPlannerWeather] = useState<(typeof PLANNER_WEATHER)[number]>('Crisp');
  const [plannerNotes, setPlannerNotes] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputHeight, setInputHeight] = useState(44);

  const scrollToLatest = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const closetItems = useClosetStore((s) => s.items);
  const loadItems = useClosetStore((s) => s.loadItems);
  const user = useUserStore((s) => s.profile);
  const tasteProfile = useTasteStore((s) => s.profile);
  const refreshTaste = useTasteStore((s) => s.refresh);

  useEffect(() => {
    safeAsync(async () => {
      if (!closetItems.length) {
        await loadItems();
      }
      if (!tasteProfile) {
        await refreshTaste();
      }
    }, 'StyleAdvisorScreen.bootstrap');
  }, [closetItems.length, loadItems, refreshTaste, tasteProfile]);

  useEffect(() => {
    const params = route.params as MainTabParamList['StyleAdvisor'];
    if (params?.initialMode === 'planner') {
      setAdvisorMode('planner');
    }
  }, [route.params]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
      scrollToLatest(false);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollToLatest]);

  useEffect(() => {
    scrollToLatest();
  }, [messages.length, submitting, advisorMode, scrollToLatest]);

  useEffect(() => {
    if (inputFocused) {
      scrollToLatest(false);
    }
  }, [input, inputFocused, scrollToLatest]);

  const startConfetti = (): void => {
    setConfettiVisible(true);
    setTimeout(() => setConfettiVisible(false), 1500);
  };

  const appendMessage = (message: ChatMessage): void => {
    setMessages((prev) => [...prev, message]);
  };

  const replaceMessage = (id: string, next: ChatMessage): void => {
    setMessages((prev) => prev.map((msg) => (msg.id === id ? next : msg)));
  };

  const updateAdvisorMessage = (id: string, patch: Partial<AdvisorChatMessage>): void => {
    setMessages((prev) => prev.map((msg) => {
      if (msg.id !== id || msg.type !== 'advisor') return msg;
      return { ...msg, ...patch };
    }));
  };

  const persistOutfitForFeedback = async (outfit: Outfit): Promise<void> => {
    await executeSqlWithRetry(
      `INSERT OR REPLACE INTO outfits
       (id, occasion, item_ids, color_score, skin_score, gemini_score, final_score, worn_on, liked, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        outfit.id,
        outfit.occasion,
        JSON.stringify(outfit.itemIds),
        Math.round(outfit.colorScore),
        Math.round(outfit.skinScore),
        Math.round(outfit.geminiScore),
        Math.round(outfit.finalScore),
        outfit.wornOn,
        outfit.liked,
        outfit.createdAt,
      ]
    );
  };

  const runScenario = async (
    userPrompt: string,
    contextOverride?: ScenarioContext,
    usedOutfitKeys: string[] = [],
    targetMessageId?: string
  ): Promise<void> => {
    if (!user || !tasteProfile) {
      return;
    }

    const typingId = targetMessageId ?? makeId('typing');
    if (!targetMessageId) {
      appendMessage({ id: typingId, type: 'typing' });
    } else {
      replaceMessage(typingId, { id: typingId, type: 'typing' });
    }

    setSubmitting(true);

    try {
      const extraction = contextOverride
        ? { context: contextOverride, usedFallback: false }
        : await extractScenarioContext(
          userPrompt,
          user.skinToneId,
          user.skinUndertone,
          tasteProfile.styleIdentity,
          tasteProfile.lovedColors
        );

      replaceMessage(typingId, {
        id: typingId,
        type: 'thinking',
        text: 'Analyzing your situation and checking your wardrobe...',
      });

      const filtered = filterClosetForScenario(extraction.context, closetItems);
      const result = await generateScenarioOutfit(
        filtered.items,
        extraction.context,
        user,
        tasteProfile,
        usedOutfitKeys
      );

      const built = buildAdvisorResponse(result, extraction.context, closetItems);
      const response = handleVideoCallMode(built);
      const key = outfitKey(response.outfit);
      const nextUsed = key ? [...usedOutfitKeys, key] : usedOutfitKeys;

      replaceMessage(typingId, {
        id: typingId,
        type: 'advisor',
        response,
        context: extraction.context,
        usedOutfitKeys: nextUsed,
        originalPrompt: userPrompt,
        isRefreshing: false,
        usedFallback: extraction.usedFallback,
      });
    } catch (error) {
      const errorText = String(error ?? '');
      const mapped = mapEngineError(errorText);
      if (mapped === 'gemini') {
        console.error('[Screen] Error:', error);
      } else {
        console.info('[Screen] Handled:', errorText);
      }
      const fallbackContext: ScenarioContext = contextOverride ?? {
        event_type: 'general event',
        industry_context: 'general',
        formality: 5,
        setting: 'indoor',
        culture_context: 'general',
        weather_relevant: false,
        upper_body_only: false,
        time_of_day: 'evening',
        avoid_colors: [],
        priority_attributes: [],
        occasion_category: 'casual',
        power_level: 'approachable',
        confidence_tip: 'Pick one clean silhouette and a calm base color.',
        dress_code: 'smart casual',
        missing_item_suggestions: [],
        styling_notes: 'Keep the look clean, balanced, and context-appropriate.',
      };

      replaceMessage(typingId, {
        id: typingId,
        type: 'advisor',
        response: {
          outfit: null,
          explanation: ['Using local fallback guidance while network is unstable.'],
          confidenceTip: fallbackContext.confidence_tip,
          missingItems: [],
          videoCallMode: false,
          formality: fallbackContext.formality,
          eventType: fallbackContext.event_type,
          allScores: null,
          closestOutfit: null,
          closestExplanation: [],
        },
        context: fallbackContext,
        usedOutfitKeys,
        originalPrompt: userPrompt,
        isRefreshing: false,
        usedFallback: true,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const sendPrompt = async (prompt: string): Promise<void> => {
    const trimmed = prompt.trim();
    if (!trimmed || submitting) return;

    setInput('');
    setInputHeight(44);
    Keyboard.dismiss();

    appendMessage({ id: makeId('user'), type: 'user', text: trimmed });
    scrollToLatest(false);

    if (closetItems.length < 6) {
      appendMessage({
        id: makeId('closet-error'),
        type: 'error',
        errorType: 'closet',
        text: 'Your closet needs at least 6 items for suggestions.',
      });
      return;
    }

    await runScenario(trimmed);
  };

  const onTryDifferent = async (msg: AdvisorChatMessage): Promise<void> => {
    updateAdvisorMessage(msg.id, { isRefreshing: true });
    await runScenario(msg.originalPrompt, msg.context, msg.usedOutfitKeys);
    updateAdvisorMessage(msg.id, { isRefreshing: false });
  };

  const onPerfect = async (msg: AdvisorChatMessage): Promise<void> => {
    if (!msg.response.outfit) return;
    const selectedOutfit = msg.response.outfit;
    await safeAsync(async () => {
      await persistOutfitForFeedback(selectedOutfit);
      await recordWorn(selectedOutfit.id);
      startConfetti();
      appendMessage({
        id: makeId('advisor-celebration'),
        type: 'thinking',
        text: `Great choice! Have a wonderful ${msg.response.eventType}!`,
      });
    }, 'StyleAdvisorScreen.onPerfect');
  };

  const renderError = (msg: ErrorMessage): React.JSX.Element => (
    <View style={styles.errorBubble}>
      <View style={styles.errorHeader}>
        <Ionicons
          name={msg.errorType === 'offline' ? 'wifi' : msg.errorType === 'rate_limit' ? 'alert-circle' : 'sparkles'}
          size={16}
          color="#e6c487"
        />
        <Text style={styles.errorText}>{msg.text}</Text>
      </View>

      {msg.errorType === 'closet' ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Add more clothes to your closet first</Text>
          <Text style={styles.emptySub}>I need at least 6 items to suggest complete outfits</Text>
          <Pressable style={styles.linkBtn} onPress={() => navigation.navigate('Closet' as never)}>
            <Text style={styles.linkBtnText}>Go to Closet</Text>
          </Pressable>
        </View>
      ) : null}

      {msg.errorType === 'rate_limit' ? (
        <Pressable
          style={styles.linkBtn}
          onPress={() => {
            setAdvisorMode('planner');
            scrollRef.current?.scrollTo({ y: 0, animated: true });
          }}
        >
          <Text style={styles.linkBtnText}>Open Quick Occasion Planner</Text>
        </Pressable>
      ) : null}

      {msg.prompt ? (
        <Pressable
          style={styles.retryBtn}
          onPress={() => {
            void runScenario(msg.prompt ?? '', msg.context);
          }}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 8 : 0}
    >
      <ConfettiOverlay visible={confettiVisible} />

      <BlurView intensity={20} tint="dark" style={[styles.header, { paddingTop: insets.top }] }>
        <View style={styles.headerInner}>
          <View style={styles.headerLeft}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={14} color="#e6c487" />
            </View>
            <Text style={styles.headerLeftText}>Advisor</Text>
          </View>

          <View style={styles.headerCenter}>
            <Text style={[styles.brandText, { fontSize: compact ? 20 : 24 }]}>FitMind</Text>
            <MaterialIcons name="auto-awesome" size={18} color="#e6c487" style={styles.brandIcon} />
          </View>

          <Pressable
            style={[styles.headerIconBtn, { transform: [{ scale: headerPressed ? 0.95 : 1 }] }]}
            onPressIn={() => setHeaderPressed(true)}
            onPressOut={() => setHeaderPressed(false)}
            onPress={() => navigation.navigate('Profile' as never)}
          >
            <Ionicons name="person-outline" size={18} color="#d0c5b5" />
          </Pressable>
        </View>
      </BlurView>

      <ScrollView
        ref={(r) => { scrollRef.current = r; }}
        style={styles.chat}
        contentContainerStyle={[
          styles.chatContent,
          {
            paddingBottom: advisorMode === 'planner'
              ? Math.max(220, insets.bottom + TAB_BAR_CLEARANCE + 120 + (Platform.OS === 'android' ? Math.max(0, keyboardHeight - insets.bottom) : 0))
              : Math.max(170, insets.bottom + TAB_BAR_CLEARANCE + 70 + (Platform.OS === 'android' ? Math.max(0, keyboardHeight - insets.bottom) : 0)),
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        <View style={styles.welcomeWrap}>
          <Text style={styles.welcomeTitle}>Style Advisor</Text>
          <Text style={styles.welcomeSubtitle}>
            Describe your occasion, and I&apos;ll style you with confidence.
          </Text>
        </View>

        <View style={styles.modeSwitchRow}>
          <Pressable
            style={[styles.modeSwitchBtn, advisorMode === 'chat' ? styles.modeSwitchBtnActive : null]}
            onPress={() => setAdvisorMode('chat')}
          >
            <Text style={[styles.modeSwitchText, advisorMode === 'chat' ? styles.modeSwitchTextActive : null]}>Advisor Chat</Text>
          </Pressable>
          <Pressable
            style={[styles.modeSwitchBtn, advisorMode === 'planner' ? styles.modeSwitchBtnActive : null]}
            onPress={() => setAdvisorMode('planner')}
          >
            <Text style={[styles.modeSwitchText, advisorMode === 'planner' ? styles.modeSwitchTextActive : null]}>Occasion Planner</Text>
          </Pressable>
        </View>

        {advisorMode === 'planner' ? (
          <View style={styles.plannerCard}>
            <Text style={styles.plannerTitle}>Build Your Occasion</Text>

            <Text style={styles.plannerLabel}>Occasion</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.plannerChipRow}
            >
              {PLANNER_OCCASIONS.map((option) => {
                const active = plannerOccasion === option;
                return (
                  <Pressable
                    key={option}
                    style={[styles.plannerChip, active ? styles.plannerChipActive : null]}
                    onPress={() => setPlannerOccasion(option)}
                  >
                    <Text style={[styles.plannerChipText, active ? styles.plannerChipTextActive : null]}>{option}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={[styles.plannerContextRow, { flexDirection: compact ? 'column' : 'row' }]}>
              <View style={styles.plannerContextCol}>
                <Text style={styles.plannerLabel}>Time</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.plannerChipRow}
                >
                  {PLANNER_TIMES.map((option) => {
                    const active = plannerTime === option;
                    return (
                      <Pressable
                        key={option}
                        style={[styles.plannerChip, active ? styles.plannerChipActive : null]}
                        onPress={() => setPlannerTime(option)}
                      >
                        <Text style={[styles.plannerChipText, active ? styles.plannerChipTextActive : null]}>{option}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.plannerContextCol}>
                <Text style={styles.plannerLabel}>Weather</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.plannerChipRow}
                >
                  {PLANNER_WEATHER.map((option) => {
                    const active = plannerWeather === option;
                    return (
                      <Pressable
                        key={option}
                        style={[styles.plannerChip, active ? styles.plannerChipActive : null]}
                        onPress={() => setPlannerWeather(option)}
                      >
                        <Text style={[styles.plannerChipText, active ? styles.plannerChipTextActive : null]}>{option}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>

            <View style={styles.plannerInputWrap}>
              <TextInput
                value={plannerNotes}
                onChangeText={setPlannerNotes}
                placeholder="Add details (venue, vibe, dress code)"
                placeholderTextColor="rgba(208,197,181,0.80)"
                style={styles.plannerInput}
              />
            </View>

            <Pressable
              style={styles.plannerGenerateBtn}
              onPress={() => {
                const prompt = `Create an outfit for ${plannerOccasion}, ${plannerTime}, ${plannerWeather}. ${plannerNotes}`;
                void sendPrompt(prompt);
              }}
              disabled={submitting}
            >
              <Text style={styles.plannerGenerateText}>Generate From Planner</Text>
            </Pressable>
          </View>
        ) : null}

        {messages.map((msg) => {
          if (msg.type === 'user') {
            return (
              <View key={msg.id} style={styles.userRow}>
                <View style={styles.userBubble}><Text style={styles.userText}>{msg.text}</Text></View>
              </View>
            );
          }

          if (msg.type === 'typing') {
            return (
              <View key={msg.id} style={styles.advisorBubble}>
                <TypingDots />
              </View>
            );
          }

          if (msg.type === 'thinking') {
            return (
              <View key={msg.id} style={styles.advisorBubble}>
                <Text style={styles.thinkingText}>{msg.text}</Text>
              </View>
            );
          }

          if (msg.type === 'error') {
            return <View key={msg.id}>{renderError(msg)}</View>;
          }

          if (msg.type === 'advisor') {
            const noPerfectMatch = msg.response.outfit === null;
            return (
              <View key={msg.id}>
                {msg.usedFallback ? (
                  <View style={styles.fallbackBanner}>
                    <Text style={styles.fallbackText}>
                      I understood this as a {msg.context.occasion_category} occasion. Here's my suggestion:
                    </Text>
                  </View>
                ) : null}

                {noPerfectMatch ? (
                  <View style={styles.noMatchBox}>
                    <Text style={styles.noMatchTitle}>I couldn't find a perfect match in your closet for this situation.</Text>
                    {msg.response.missingItems.map((item) => <MissingItemCard key={`${msg.id}-${item}`} item={item} />)}
                    {msg.response.closestOutfit ? (
                      <Text style={styles.closestText}>Here's the closest I could find:</Text>
                    ) : null}
                  </View>
                ) : null}

                <AdvisorMessage
                  response={msg.response}
                  closetItems={closetItems}
                  onTryDifferent={() => { void onTryDifferent(msg); }}
                  onPerfect={() => { void onPerfect(msg); }}
                  isRefreshing={msg.isRefreshing}
                />
              </View>
            );
          }

          return null;
        })}
      </ScrollView>

      <View
        style={[
          styles.inputWrap,
          {
            paddingBottom: Math.max(
              10,
              insets.bottom + TAB_BAR_CLEARANCE - 16 + (Platform.OS === 'android' ? Math.max(0, keyboardHeight - insets.bottom) : 0)
            ),
          },
        ]}
      >
        <LinearGradient colors={['#131313', 'rgba(19,19,19,0)']} start={{ x: 0, y: 1 }} end={{ x: 0, y: 0 }} style={styles.chipsGradient}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {QUICK_CHIPS.map((chip) => {
              const active = selectedChip === chip.label;

              return (
                <Pressable
                  key={chip.label}
                  style={[styles.chip, active ? styles.chipActive : null]}
                  onPress={() => {
                    setSelectedChip(chip.label);
                    setInput(chip.prompt);
                    // Small delay so user sees it filled
                    setTimeout(() => {
                      void sendPrompt(chip.prompt);
                    }, 150);
                  }}
                >
                  <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{chip.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </LinearGradient>

        <View style={[styles.inputRow, inputFocused ? styles.inputRowFocused : null]}>
          <View style={styles.inputIconWrap}>
            <MaterialIcons name="auto-fix-high" size={16} color="#e6c487" />
          </View>
          <TextInput
            value={input}
            onChangeText={(text) => {
              setInput(text);
              if (inputFocused) {
                scrollToLatest(false);
              }
            }}
            placeholder="Describe your situation..."
            placeholderTextColor="rgba(208,197,181,0.80)"
            style={styles.input}
            editable={!submitting}
            multiline
            blurOnSubmit={false}
            textAlignVertical="top"
            onContentSizeChange={(event) => {
              const next = Math.max(44, Math.min(120, Math.ceil(event.nativeEvent.contentSize.height + 10)));
              setInputHeight(next);
            }}
            scrollEnabled={inputHeight >= 120}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
          />
          <Pressable style={styles.sendBtn} disabled={submitting} onPress={() => { void sendPrompt(input); }}>
            <MaterialIcons name="arrow-upward" size={18} color="#1f1f1f" />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#131313' },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(230,196,135,0.20)',
    backgroundColor: 'rgba(19,19,19,0.85)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  headerInner: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: 88,
  },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(230,196,135,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(230,196,135,0.20)',
  },
  headerLeftText: {
    color: '#d0c5b5',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    color: '#e6c487',
    fontFamily: 'PlayfairDisplay_700Bold_Italic',
    fontSize: 24,
  },
  brandIcon: {
    position: 'absolute',
    right: -20,
    top: 6,
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#353534',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chat: { flex: 1 },
  chatContent: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 16 },
  welcomeWrap: { marginBottom: 16 },
  welcomeTitle: {
    color: '#e6c487',
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 24,
    marginBottom: 4,
  },
  welcomeSubtitle: {
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  modeSwitchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  modeSwitchBtn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#4d463a',
    backgroundColor: '#2a2a2a',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeSwitchBtnActive: {
    borderColor: '#e6c487',
    backgroundColor: 'rgba(230,196,135,0.12)',
  },
  modeSwitchText: {
    color: '#d0c5b5',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modeSwitchTextActive: {
    color: '#f0ede9',
  },
  plannerCard: {
    borderWidth: 1,
    borderColor: 'rgba(230,196,135,0.20)',
    borderRadius: 16,
    backgroundColor: '#201f1f',
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  plannerTitle: {
    color: '#e6c487',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 20,
  },
  plannerLabel: {
    color: '#d0c5b5',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  plannerChipRow: {
    gap: 8,
    paddingVertical: 2,
    paddingRight: 8,
  },
  plannerChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#4d463a',
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  plannerChipActive: {
    borderColor: '#e6c487',
    backgroundColor: 'rgba(230,196,135,0.12)',
  },
  plannerChipText: {
    color: '#d0c5b5',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  plannerChipTextActive: {
    color: '#f0ede9',
  },
  plannerContextRow: {
    gap: 10,
  },
  plannerContextCol: {
    flex: 1,
    gap: 6,
  },
  plannerInputWrap: {
    borderWidth: 1,
    borderColor: '#4d463a',
    borderRadius: 12,
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 12,
  },
  plannerInput: {
    color: '#f0ede9',
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    paddingVertical: 10,
  },
  plannerGenerateBtn: {
    borderRadius: 999,
    backgroundColor: '#c9a96e',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  plannerGenerateText: {
    color: '#261900',
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  userRow: { alignItems: 'flex-end', marginBottom: 10 },
  userBubble: {
    maxWidth: '85%',
    backgroundColor: '#c9a96e',
    borderRadius: 16,
    borderBottomRightRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userText: {
    color: '#261900',
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 21,
  },
  advisorBubble: { marginBottom: 10 },
  typingCard: {
    backgroundColor: '#201f1f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(230,196,135,0.20)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  typingWrap: { flexDirection: 'row', gap: 6, alignItems: 'center', height: 18 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#e6c487' },
  typingLabel: {
    color: '#d0c5b5',
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  thinkingText: {
    color: '#d0c5b5',
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 21,
    backgroundColor: '#201f1f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(230,196,135,0.20)',
    padding: 14,
  },
  inputWrap: {
    backgroundColor: '#131313',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  chipsGradient: {
    marginTop: 2,
    marginBottom: 8,
    paddingTop: 4,
  },
  chipsRow: { paddingBottom: 8, gap: 8, paddingRight: 8 },
  chip: {
    backgroundColor: '#2a2a2a',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#4d463a',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    borderColor: '#e6c487',
    backgroundColor: 'rgba(230,196,135,0.12)',
  },
  chipText: {
    color: '#d0c5b5',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  chipTextActive: {
    color: '#f0ede9',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: '#2a2a2a',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#4d463a',
    paddingLeft: 8,
    paddingRight: 4,
    paddingTop: 6,
    paddingBottom: 6,
  },
  inputRowFocused: {
    borderColor: '#e6c487',
  },
  inputIconWrap: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    color: '#e5e2e1',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    minHeight: 44,
    maxHeight: 120,
    paddingTop: 10,
    paddingBottom: 10,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e6c487',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  fallbackBanner: {
    borderWidth: 1,
    borderColor: 'rgba(230,196,135,0.20)',
    borderRadius: 12,
    backgroundColor: '#201f1f',
    padding: 12,
    marginBottom: 8,
  },
  fallbackText: {
    color: '#d0c5b5',
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 20,
  },
  noMatchBox: {
    borderWidth: 1,
    borderColor: 'rgba(230,196,135,0.20)',
    borderRadius: 12,
    backgroundColor: '#201f1f',
    padding: 12,
    marginBottom: 8,
  },
  noMatchTitle: {
    color: '#e5e2e1',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 21,
  },
  closestText: {
    marginTop: 8,
    color: '#d0c5b5',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  errorBubble: {
    backgroundColor: '#201f1f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(230,196,135,0.20)',
    padding: 14,
    marginBottom: 10,
  },
  errorHeader: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  errorText: {
    color: '#e5e2e1',
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 21,
  },
  retryBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#4d463a',
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retryText: { color: '#e5e2e1', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  linkBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#2a2a2a',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#4d463a',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  linkBtnText: { color: '#e6c487', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  emptyState: { marginTop: 8 },
  emptyTitle: { fontFamily: 'Inter_700Bold', color: '#e5e2e1', fontSize: 14 },
  emptySub: { marginTop: 4, color: '#d0c5b5', fontFamily: 'Inter_400Regular', fontSize: 13 },
  confettiLayer: { ...StyleSheet.absoluteFillObject, zIndex: 50 },
  confetti: { position: 'absolute', top: -10, width: 8, height: 14, borderRadius: 2 },
});

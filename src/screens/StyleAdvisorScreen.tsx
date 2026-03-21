import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
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
    <View style={styles.typingWrap}>
      {[0, 1, 2].map((index) => {
        const opacity = anim.interpolate({
          inputRange: [0, 0.33, 0.66, 1],
          outputRange: index === 0 ? [0.3, 1, 0.3, 0.3] : index === 1 ? [0.3, 0.3, 1, 0.3] : [0.3, 0.3, 0.3, 1],
        });
        return <Animated.View key={index} style={[styles.dot, { opacity }]} />;
      })}
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
  const scrollRef = useRef<ScrollView | null>(null);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [confettiVisible, setConfettiVisible] = useState(false);

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
        : await extractScenarioContext(userPrompt, user.skinToneId, user.skinUndertone);

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
      const message = error instanceof Error ? error.message : 'Unknown error';
      const errorType = mapEngineError(message);

      if (errorType === 'offline') {
        replaceMessage(typingId, {
          id: typingId,
          type: 'error',
          errorType,
          text: 'Style Advisor needs internet to understand your situation. Please check your connection.',
          prompt: userPrompt,
          context: contextOverride,
        });
      } else if (errorType === 'rate_limit') {
        replaceMessage(typingId, {
          id: typingId,
          type: 'error',
          errorType,
          text: "I've used today's AI quota. You can still use Quick Occasion Planner without internet.",
          prompt: userPrompt,
          context: contextOverride,
        });
      } else {
        replaceMessage(typingId, {
          id: typingId,
          type: 'error',
          errorType,
          text: 'I had trouble analyzing your situation. Tap to try again.',
          prompt: userPrompt,
          context: contextOverride,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const sendPrompt = async (prompt: string): Promise<void> => {
    const trimmed = prompt.trim();
    if (!trimmed || submitting) return;

    setInput('');
    Keyboard.dismiss();

    appendMessage({ id: makeId('user'), type: 'user', text: trimmed });

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
    <View style={styles.advisorBubble}>
      <View style={styles.errorHeader}>
        <Ionicons
          name={msg.errorType === 'offline' ? 'wifi' : msg.errorType === 'rate_limit' ? 'alert-circle' : 'sparkles'}
          size={16}
          color={msg.errorType === 'offline' ? '#0369a1' : '#b45309'}
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
        <Pressable style={styles.linkBtn} onPress={() => navigation.navigate('Occasion' as never)}>
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
    <View style={styles.screen}>
      <ConfettiOverlay visible={confettiVisible} />

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Ionicons name="sparkles" size={20} color="#0f766e" />
          <Text style={styles.title}>Style Advisor</Text>
        </View>
        <Text style={styles.subtitle}>Describe any situation - I'll style you perfectly</Text>
      </View>

      <ScrollView
        ref={(r) => { scrollRef.current = r; }}
        style={styles.chat}
        contentContainerStyle={styles.chatContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
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

      <View style={styles.inputWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {QUICK_CHIPS.map((chip) => (
            <Pressable
              key={chip.label}
              style={styles.chip}
              onPress={() => {
                setInput(chip.prompt);
                void sendPrompt(chip.prompt);
              }}
            >
              <Text style={styles.chipText}>{chip.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Describe your situation..."
            style={styles.input}
            editable={!submitting}
            onSubmitEditing={() => { void sendPrompt(input); }}
          />
          <Pressable style={styles.sendBtn} disabled={submitting} onPress={() => { void sendPrompt(input); }}>
            <Ionicons name="arrow-up" size={18} color="#ffffff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, backgroundColor: '#ffffff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 22, fontWeight: '900', color: '#0f172a' },
  subtitle: { marginTop: 4, color: '#475569' },
  chat: { flex: 1 },
  chatContent: { padding: 12, paddingBottom: 18 },
  userRow: { alignItems: 'flex-end', marginBottom: 10 },
  userBubble: { maxWidth: '86%', backgroundColor: '#0f766e', borderRadius: 14, borderBottomRightRadius: 4, padding: 10 },
  userText: { color: '#ffffff', fontWeight: '600' },
  advisorBubble: { maxWidth: '95%', backgroundColor: '#ffffff', borderRadius: 14, borderBottomLeftRadius: 4, padding: 10, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 10 },
  typingWrap: { flexDirection: 'row', gap: 6, alignItems: 'center', height: 18 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#0f766e' },
  thinkingText: { color: '#334155', fontWeight: '600' },
  inputWrap: { paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  chipsRow: { paddingBottom: 8, gap: 8, paddingRight: 8 },
  chip: { backgroundColor: '#ecfeff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: '#99f6e4' },
  chipText: { color: '#115e59', fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#f8fafc' },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#0f766e', alignItems: 'center', justifyContent: 'center' },
  fallbackBanner: { borderWidth: 1, borderColor: '#fde68a', borderRadius: 10, backgroundColor: '#fffbeb', padding: 10, marginBottom: 8 },
  fallbackText: { color: '#92400e', fontWeight: '600' },
  noMatchBox: { borderWidth: 1, borderColor: '#f1f5f9', borderRadius: 12, backgroundColor: '#ffffff', padding: 10, marginBottom: 8 },
  noMatchTitle: { color: '#0f172a', fontWeight: '700' },
  closestText: { marginTop: 8, color: '#475569', fontWeight: '700' },
  errorHeader: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  errorText: { color: '#334155', flex: 1, fontWeight: '600' },
  retryBtn: { marginTop: 10, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  retryText: { color: '#334155', fontWeight: '700' },
  linkBtn: { marginTop: 10, alignSelf: 'flex-start', backgroundColor: '#ecfeff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  linkBtnText: { color: '#0f766e', fontWeight: '700' },
  emptyState: { marginTop: 8 },
  emptyTitle: { fontWeight: '700', color: '#0f172a' },
  emptySub: { marginTop: 4, color: '#475569' },
  confettiLayer: { ...StyleSheet.absoluteFillObject, zIndex: 50 },
  confetti: { position: 'absolute', top: -10, width: 8, height: 14, borderRadius: 2 },
});

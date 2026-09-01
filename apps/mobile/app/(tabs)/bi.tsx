import { useCallback, useEffect, useRef, useState } from 'react';
import {
    View, Text, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from 'expo-router';
import { BarChart3, Zap, Sparkles, PenSquare, ChevronLeft } from 'lucide-react-native';
import { agentClient } from 'core';
import type { AgentEvent, Widget } from 'core';
import { MessageBubble, type ChatMessage } from '../../src/components/assistant/MessageBubble';
import { ApprovalCard } from '../../src/components/assistant/ApprovalCard';
import { Composer } from '../../src/components/assistant/Composer';
import { colors, fonts } from '../../src/theme/tokens';

const uid = () => Math.random().toString(36).slice(2);
const DEFAULT_MODEL = 'default';

type TabId = 'assistant' | 'insights' | 'automations';
const TABS: { id: TabId; label: string }[] = [
    { id: 'assistant', label: 'Assistant' },
    { id: 'insights', label: 'Data Insights' },
    { id: 'automations', label: 'Automations' },
];

interface PendingApproval {
    threadId: string;
    callId: string;
    toolName: string;
    proposal: { summary: string; preview: { label: string; value: string }[]; warning?: string };
    status: 'pending' | 'approving' | 'approved' | 'declined';
}

/**
 * Business Intelligence — mirrors apps/web/src/pages/Intelligence.tsx: the
 * page title, the three-tab pill row, and Data Insights / Automations as the
 * same placeholders web shows (the assistant can build a chart on request
 * instead — same line web uses).
 */
export default function BiScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const [tab, setTab] = useState<TabId>('assistant');

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [threadId, setThreadId] = useState<string | null>(null);
    const [pending, setPending] = useState<PendingApproval | null>(null);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const listRef = useRef<FlatList<ChatMessage>>(null);

    // Web keeps the shared tab row visible until a conversation has actually
    // started, then swaps it for AssistantChat's own back button. Same rule here.
    const inChat = tab === 'assistant' && messages.length > 0;

    // The equivalent of web's chat view taking over the whole page: once a
    // conversation starts, the bottom tab bar is real screen space the chat
    // needs back, so it's hidden at the parent Tabs navigator rather than
    // just visually — this is the same navigator every other tab shares.
    useEffect(() => {
        // navigation here is this screen's own entry in the Tabs navigator
        // (bi.tsx is a direct Tabs.Screen), so setOptions targets the tab
        // bar's style while this screen is focused -- no getParent() needed;
        // that would reach the root Stack instead, which has no tab bar.
        navigation.setOptions({
            tabBarStyle: inChat ? { display: 'none' } : undefined,
        });
        return () => { navigation.setOptions({ tabBarStyle: undefined }); };
    }, [inChat, navigation]);

    const patch = (id: string, fn: (m: ChatMessage) => ChatMessage) =>
        setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));

    const applyEvent = useCallback((assistantId: string, event: AgentEvent) => {
        switch (event.type) {
            case 'thread':
                setThreadId(event.threadId);
                break;
            case 'status':
                patch(assistantId, (m) => ({ ...m, activity: event.phase }));
                break;
            case 'text':
                patch(assistantId, (m) => ({ ...m, content: m.content + event.delta, streaming: true }));
                break;
            case 'widget':
                patch(assistantId, (m) => ({ ...m, widgets: [...m.widgets, event.widget as Widget] }));
                break;
            case 'approval_request':
                setPending({
                    threadId: threadId ?? '',
                    callId: event.callId,
                    toolName: event.toolName,
                    proposal: event.proposal,
                    status: 'pending',
                });
                break;
            case 'done':
                patch(assistantId, (m) => ({ ...m, streaming: false }));
                setBusy(false);
                break;
            case 'error':
                patch(assistantId, (m) => ({
                    ...m,
                    streaming: false,
                    content: m.content || `Something went wrong: ${event.message}`,
                }));
                setBusy(false);
                break;
        }
        listRef.current?.scrollToEnd({ animated: true });
    }, [threadId]);

    const send = useCallback(() => {
        const trimmed = input.trim();
        if (!trimmed || busy) return;

        const assistantId = uid();
        setInput('');
        setBusy(true);
        setMessages((prev) => [
            ...prev,
            { id: uid(), role: 'user', content: trimmed, widgets: [] },
            { id: assistantId, role: 'assistant', content: '', widgets: [], streaming: true, activity: 'thinking' },
        ]);

        const controller = new AbortController();
        abortRef.current = controller;
        agentClient.chat(
            { message: trimmed, threadId, model: DEFAULT_MODEL },
            (event) => applyEvent(assistantId, event),
            controller.signal,
        );
    }, [input, busy, threadId, applyEvent]);

    const stop = () => {
        abortRef.current?.abort();
        setBusy(false);
    };

    const decide = (approved: boolean) => {
        if (!pending) return;
        setPending({ ...pending, status: 'approving' });
        const assistantId = uid();
        setMessages((prev) => [
            ...prev,
            { id: assistantId, role: 'assistant', content: '', widgets: [], streaming: true, activity: 'working' },
        ]);
        agentClient.approve(
            { threadId: pending.threadId, callId: pending.callId, approved, model: DEFAULT_MODEL },
            (event) => {
                applyEvent(assistantId, event);
                if (event.type === 'done') {
                    setPending((p) => (p ? { ...p, status: approved ? 'approved' : 'declined' } : p));
                }
            },
        );
    };

    const newChat = () => {
        setMessages([]);
        setThreadId(null);
        setPending(null);
        setInput('');
    };

    return (
        <KeyboardAvoidingView
            style={styles.root}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={insets.top}
        >
            {inChat ? (
                <View style={[styles.chatHeader, { paddingTop: insets.top + 12 }]}>
                    <Pressable onPress={newChat} hitSlop={10} accessibilityLabel="Back to Business Intelligence">
                        <ChevronLeft size={22} color={colors.textMuted} />
                    </Pressable>
                    <Text style={styles.chatHeaderTitle} numberOfLines={1}>Assistant</Text>
                    <Pressable onPress={newChat} hitSlop={10} accessibilityLabel="New conversation">
                        <PenSquare size={19} color={colors.textMuted} />
                    </Pressable>
                </View>
            ) : (
                <>
                    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
                        <Text style={styles.title}>Business Intelligence</Text>
                    </View>
                    <View style={styles.tabRow}>
                        {TABS.map((t) => (
                            <Pressable
                                key={t.id}
                                onPress={() => setTab(t.id)}
                                style={[styles.tabPill, tab === t.id && styles.tabPillActive]}
                            >
                                <Text style={[styles.tabPillText, tab === t.id && styles.tabPillTextActive]}>
                                    {t.label}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                </>
            )}

            {tab === 'assistant' && (
                <>
                    {messages.length === 0 ? (
                        <View style={styles.hero}>
                            <View style={styles.heroIcon}><Sparkles size={26} color={colors.blue} /></View>
                            <Text style={styles.heroTitle}>Ask about your business</Text>
                            <Text style={styles.heroBody}>
                                Spending trends, category breakdowns, a chart for the board meeting — ask in plain language.
                            </Text>
                        </View>
                    ) : (
                        <FlatList
                            ref={listRef}
                            data={messages}
                            keyExtractor={(m) => m.id}
                            contentContainerStyle={styles.list}
                            renderItem={({ item }) => <MessageBubble message={item} />}
                            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
                        />
                    )}

                    {pending && (
                        <View style={styles.approvalWrap}>
                            <ApprovalCard
                                toolName={pending.toolName}
                                proposal={pending.proposal}
                                status={pending.status}
                                onDecide={decide}
                            />
                        </View>
                    )}

                    <Composer value={input} onChange={setInput} onSend={send} onStop={stop} busy={busy} />
                    <View style={{ height: insets.bottom + 12 }} />
                </>
            )}

            {tab === 'insights' && (
                <Placeholder
                    icon={<BarChart3 size={30} color={colors.blue} />}
                    tint={colors.tabActiveBg}
                    title="Financial Insights"
                    body="A visual dashboard of trends and forecasting is on the way. In the meantime, ask the Assistant for any chart you need — it can build them on request."
                />
            )}

            {tab === 'automations' && (
                <Placeholder
                    icon={<Zap size={30} color="#A855F7" />}
                    tint="#FAF5FF"
                    title="Process Automations"
                    body="Smart workflows for requisition approvals and budget tracking are coming soon."
                />
            )}
        </KeyboardAvoidingView>
    );
}

const Placeholder: React.FC<{ icon: React.ReactNode; tint: string; title: string; body: string }> = ({ icon, tint, title, body }) => (
    <View style={styles.placeholderRoot}>
        <View style={[styles.placeholderIcon, { backgroundColor: tint }]}>{icon}</View>
        <Text style={styles.placeholderTitle}>{title}</Text>
        <Text style={styles.placeholderBody}>{body}</Text>
    </View>
);

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    header: { paddingHorizontal: 20, paddingBottom: 12 },
    title: { fontFamily: fonts.display, fontSize: 26, color: '#000000' },
    tabRow: {
        flexDirection: 'row', marginHorizontal: 16, marginBottom: 6, padding: 4,
        backgroundColor: colors.canvasAlt, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
    },
    tabPill: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
    tabPillActive: { backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
    tabPillText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textFaint },
    tabPillTextActive: { color: colors.navy },
    chatHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingBottom: 12,
    },
    chatHeaderTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 48, gap: 12 },
    heroIcon: {
        width: 56, height: 56, borderRadius: 28, backgroundColor: colors.tabActiveBg,
        alignItems: 'center', justifyContent: 'center',
    },
    heroTitle: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text, textAlign: 'center' },
    heroBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
    list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
    approvalWrap: { paddingHorizontal: 16 },
    placeholderRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 6 },
    placeholderIcon: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    placeholderTitle: { fontFamily: fonts.display, fontSize: 21, color: colors.navy, marginBottom: 4 },
    placeholderBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19, maxWidth: 320 },
});

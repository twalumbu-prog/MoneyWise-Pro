import { useCallback, useRef, useState } from 'react';
import {
    View, Text, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sparkles, PenSquare } from 'lucide-react-native';
import { agentClient } from 'core';
import type { AgentEvent, Widget } from 'core';
import { MessageBubble, type ChatMessage } from '../../src/components/assistant/MessageBubble';
import { ApprovalCard } from '../../src/components/assistant/ApprovalCard';
import { Composer } from '../../src/components/assistant/Composer';
import { colors, fonts } from '../../src/theme/tokens';

const uid = () => Math.random().toString(36).slice(2);
const DEFAULT_MODEL = 'default';

interface PendingApproval {
    threadId: string;
    callId: string;
    toolName: string;
    proposal: { summary: string; preview: { label: string; value: string }[]; warning?: string };
    status: 'pending' | 'approving' | 'approved' | 'declined';
}

/**
 * Business Intelligence — the streaming assistant. Ported logic, native UI: the
 * event handling below mirrors apps/web/src/components/assistant/AssistantChat.tsx
 * almost line for line, because the wire contract is core's and must not drift,
 * but every visual piece is a native component.
 *
 * "Insights" and "Automations" tabs are placeholders on web too — ask the
 * assistant for a chart or report instead, same as there.
 */
export default function BiScreen() {
    const insets = useSafeAreaInsets();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [threadId, setThreadId] = useState<string | null>(null);
    const [pending, setPending] = useState<PendingApproval | null>(null);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const listRef = useRef<FlatList<ChatMessage>>(null);

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
            <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
                <Text style={styles.title}>Assistant</Text>
                <Pressable onPress={newChat} hitSlop={10} accessibilityLabel="New conversation">
                    <PenSquare size={20} color={colors.textMuted} />
                </Pressable>
            </View>

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
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingBottom: 12,
    },
    title: { fontFamily: fonts.display, fontSize: 26, color: '#000000' },
    hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 48, gap: 12 },
    heroIcon: {
        width: 56, height: 56, borderRadius: 28, backgroundColor: colors.tabActiveBg,
        alignItems: 'center', justifyContent: 'center',
    },
    heroTitle: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text, textAlign: 'center' },
    heroBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
    list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
    approvalWrap: { paddingHorizontal: 16 },
});

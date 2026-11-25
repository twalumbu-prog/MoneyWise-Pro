import { useCallback, useEffect, useState } from 'react';
import {
    View, Text, ScrollView, Pressable, StyleSheet, TextInput, KeyboardAvoidingView, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Inbox, CalendarDays, User, ArrowDownToLine, ArrowLeftRight, ArrowUp, Mic, Sprout, Settings } from 'lucide-react-native';
import { AnimatedSegmented, AnimatedTabContent } from '../components/AnimatedTabs';
import { GrowPanel, useGrowSettings } from '../components/grow/GrowPanel';
import { useDictation } from '../hooks/useDictation';
import { VoiceWave } from '../components/assistant/VoiceWave';
import { TourTarget } from '../components/walkthrough/TourTarget';
import { AccountsCard } from '../components/home/AccountsCard';
import { HomeInsightsCard } from '../components/home/HomeInsightsCard';
import { OtherServicesCard } from '../components/home/OtherServicesCard';
import { ReceiveMoneySheet } from '../components/home/ReceiveMoneySheet';
import { QuickAddMenu } from '../components/home/QuickAddSheet';
import { cardShadow } from '../components/home/HomeCard';
import { AccountMenuSheet } from '../components/requisitions/AccountMenuSheet';
import { WalkthroughCard } from '../components/walkthrough/WalkthroughCard';
import { FinishSetupCard } from '../components/onboarding/personal/FinishSetupCard';
import { useAttentionCount } from '../hooks/useBadgeSync';
import { queueAssistantPrompt } from '../lib/assistantHandoff';
import { colors, fonts, radius } from '../theme/tokens';

type HomeMode = 'home' | 'grow';

/**
 * Home — a MoneyWise personal account's first tab, with a Home | Grow toggle under the header. Home: the wallets and their balances, Receive / Send, where this month's money went,
 * the other services, and a box to ask the Assistant anything. Grow: the net-worth plan. The header stays; only its title changes. The Inbox (requests and notifications) is behind the bell.
 */
export function HomeScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();
    const attention = useAttentionCount();
    const [receiveOpen, setReceiveOpen] = useState(false);
    const [quickAddOpen, setQuickAddOpen] = useState(false);
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);
    const [question, setQuestion] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [mode, setMode] = useState<HomeMode>('home');
    const navigation = useNavigation();
    const { hasPlan: growHasPlan, openSettings: openGrowSettings } = useGrowSettings();

    // Grow takes the whole screen: the bottom tab bar goes away while it shows (and always returns).
    useEffect(() => {
        navigation.setOptions({ tabBarStyle: mode === 'grow' ? { display: 'none' } : undefined });
        return () => navigation.setOptions({ tabBarStyle: undefined });
    }, [mode, navigation]);
    const { listening, level, toggle: toggleDictation, stop: stopDictation } = useDictation(question, setQuestion);

    const ask = () => {
        // Sending (by the button or the keyboard's Send key) closes the microphone, so nothing is dictated into the cleared box.
        stopDictation();
        const q = question.trim();
        if (!q) return;
        queueAssistantPrompt(q);
        setQuestion('');
        router.navigate('/bi');
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([
            qc.invalidateQueries({ queryKey: ['cashbook-entries', 'overview'] }),
            qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('home-') }),
            qc.invalidateQueries({ queryKey: ['requisitions'] }),
            qc.invalidateQueries({ queryKey: ['savings'] }),
            qc.invalidateQueries({ queryKey: ['badge-total'] }),
        ]);
        setRefreshing(false);
    }, [qc]);

    return (
        <KeyboardAvoidingView style={[styles.root, mode === 'grow' && { backgroundColor: '#FFFFFF' }, { paddingTop: insets.top }]} behavior="padding">
            <View style={styles.header}>
                <Text style={styles.title}>{mode === 'grow' ? 'Grow' : '📮 Home'}</Text>
                <View style={styles.actions}>
                    {mode === 'grow' ? (
                        <>
                            {/* Inbox goes; the Grow settings gear takes the calendar's place */}
                            <View style={styles.iconSlot} />
                            {growHasPlan ? (
                                <Pressable style={styles.iconBtn} onPress={openGrowSettings} accessibilityRole="button" accessibilityLabel="Grow plan settings">
                                    <Settings size={18} color={colors.textMuted} />
                                </Pressable>
                            ) : (
                                <View style={styles.iconSlot} />
                            )}
                        </>
                    ) : (
                        <>
                            <Pressable style={styles.iconBtn} onPress={() => router.navigate('/inbox')} accessibilityRole="button" accessibilityLabel={attention > 0 ? `Inbox, ${attention} need attention` : 'Inbox'}>
                                <Inbox size={18} color={colors.textMuted} />
                                {attention > 0 && (
                                    <View style={styles.badge}><Text style={styles.badgeText}>{attention > 99 ? '99+' : attention}</Text></View>
                                )}
                            </Pressable>
                            <Pressable style={styles.iconBtn} onPress={() => router.push('/schedules')} accessibilityRole="button" accessibilityLabel="Schedules">
                                <CalendarDays size={18} color={colors.textMuted} />
                            </Pressable>
                        </>
                    )}
                    <Pressable style={styles.iconBtn} onPress={() => setAccountMenuOpen(true)} accessibilityRole="button" accessibilityLabel="Account and Organizations">
                        <User size={18} color={colors.textMuted} />
                    </Pressable>
                </View>
            </View>

            {/* Home | Grow */}
            <View style={styles.toggleWrap}>
                <AnimatedSegmented
                    value={mode}
                    onChange={(v) => setMode(v as HomeMode)}
                    trackStyle={styles.segment}
                    indicatorStyle={styles.segmentIndicator}
                    itemStyle={styles.segmentBtn}
                    items={(['home', 'grow'] as HomeMode[]).map((v) => ({
                        value: v,
                        content: (
                            <View style={styles.segmentInner}>
                                {v === 'grow' && <Sprout size={15} color={mode === 'grow' ? '#16A34A' : colors.textMuted} />}
                                <Text style={[styles.segmentText, mode === v && styles.segmentTextActive]}>{v === 'home' ? 'Home' : 'Grow'}</Text>
                            </View>
                        ),
                    }))}
                />
            </View>

            <AnimatedTabContent tabKey={mode} index={mode === 'grow' ? 1 : 0} style={{ flex: 1 }}>
            {mode === 'grow' ? (
                <GrowPanel embedded />
            ) : (
            <View style={{ flex: 1 }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />}
            >
                <FinishSetupCard />
                <WalkthroughCard />
                <AccountsCard />

                <View style={styles.quick}>
                    <Pressable onPress={() => setReceiveOpen(true)} style={({ pressed }) => [styles.quickHalf, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Receive money">
                        <ArrowDownToLine size={16} color="#000000" strokeWidth={1.8} />
                        <Text style={styles.quickText}>Receive Money</Text>
                    </Pressable>
                    <View style={styles.quickDivider} />
                    <TourTarget id="inbox-new" style={{ flex: 1 }}>
                        <Pressable onPress={() => router.push('/requisition/new')} style={({ pressed }) => [styles.quickHalf, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Send money">
                            <ArrowLeftRight size={16} color="#000000" strokeWidth={1.8} />
                            <Text style={styles.quickText}>Send Money</Text>
                        </Pressable>
                    </TourTarget>
                </View>

                <HomeInsightsCard />
                <OtherServicesCard />
            </ScrollView>

            <View style={styles.assistantWrap}>
                <View style={styles.assistant}>
                    <TextInput
                        style={styles.assistantInput}
                        value={question}
                        onChangeText={setQuestion}
                        placeholder="Ask me to do anything"
                        placeholderTextColor="#D6D3D1"
                        returnKeyType="send"
                        onSubmitEditing={ask}
                        accessibilityLabel="Ask the Assistant"
                    />
                    <Pressable
                        style={[styles.mic, listening && styles.micListening]}
                        onPress={toggleDictation}
                        accessibilityRole="button"
                        accessibilityLabel={listening ? 'Stop dictation' : 'Dictate'}
                    >
                        {listening ? <VoiceWave level={level} /> : <Mic size={15} color={colors.textMuted} />}
                    </Pressable>
                    <Pressable onPress={ask} disabled={!question.trim()} style={[styles.send, !question.trim() && styles.sendDisabled]} accessibilityRole="button" accessibilityLabel="Send to the Assistant">
                        <ArrowUp size={17} color="#FFFFFF" />
                    </Pressable>
                </View>
            </View>
            </View>
            )}
            </AnimatedTabContent>

            {/* The + and the bubble menu that grows out of it (Home only, not Grow) */}
            {mode === 'home' && <QuickAddMenu open={quickAddOpen} onOpenChange={setQuickAddOpen} bottom={88} />}
            <ReceiveMoneySheet visible={receiveOpen} onClose={() => setReceiveOpen(false)} />
            <AccountMenuSheet visible={accountMenuOpen} onClose={() => setAccountMenuOpen(false)} />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, marginBottom: 4 },
    title: { fontFamily: fonts.advercase, fontSize: 30, color: '#000000' },
    actions: { flexDirection: 'row', gap: 8 },
    iconSlot: { width: 40, height: 40 },
    toggleWrap: { paddingHorizontal: 20, paddingBottom: 12 },
    segment: { flexDirection: 'row', padding: 4, backgroundColor: colors.chipActiveBg, borderRadius: radius.pill },
    segmentBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center' },
    segmentIndicator: {
        borderRadius: radius.pill, backgroundColor: colors.surface,
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    segmentInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    segmentText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    segmentTextActive: { color: colors.text },
    // Exactly the Inbox page's header buttons: 40pt circles, hairline border, 18pt icon.
    iconBtn: {
        width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
        borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    },
    badge: {
        position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
        backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.canvas,
    },
    badgeText: { fontFamily: fonts.bodyBold, fontSize: 10, color: '#FFFFFF' },
    scroll: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16, gap: 16 },
    quick: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 24, borderWidth: 1, borderColor: '#E4E4E7', minHeight: 64,
        ...cardShadow,
    },
    quickHalf: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 20 },
    quickText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: '#000000' },
    quickDivider: { width: StyleSheet.hairlineWidth * 2, height: 22, backgroundColor: '#D4D4D4' },
    // Same look as the Schedules + button; sits just above the Assistant box, on the right.
    fab: {
        position: 'absolute', right: 20, bottom: 88, width: 56, height: 56, borderRadius: 28,
        backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center',
        shadowColor: colors.blue, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
    assistantWrap: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
    assistant: {
        flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderRadius: 32, minHeight: 56, paddingLeft: 24, paddingRight: 11,
        borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', ...cardShadow,
    },
    assistantInput: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text, paddingVertical: 10, letterSpacing: 0 },
    // The Assistant composer's own mic and send buttons.
    mic: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center' },
    micListening: { backgroundColor: '#EF4444' },
    send: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    sendDisabled: { opacity: 0.3 },
});

import { useCallback, useState } from 'react';
import {
    View, Text, ScrollView, Pressable, StyleSheet, TextInput, KeyboardAvoidingView, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Inbox, CalendarDays, User, ArrowDownToLine, ArrowLeftRight, SendHorizontal } from 'lucide-react-native';
import { TourTarget } from '../components/walkthrough/TourTarget';
import { AccountsCard } from '../components/home/AccountsCard';
import { FinancialOverviewCard } from '../components/home/FinancialOverviewCard';
import { OtherServicesCard } from '../components/home/OtherServicesCard';
import { ReceiveMoneySheet } from '../components/home/ReceiveMoneySheet';
import { cardShadow } from '../components/home/HomeCard';
import { AccountMenuSheet } from '../components/requisitions/AccountMenuSheet';
import { WalkthroughCard } from '../components/walkthrough/WalkthroughCard';
import { useAttentionCount } from '../hooks/useBadgeSync';
import { queueAssistantPrompt } from '../lib/assistantHandoff';
import { colors, fonts } from '../theme/tokens';

/**
 * Home — a MoneyWise personal account's first tab: the wallets and their balances, Receive / Send, where this month's money went,
 * the other services, and a box to ask the Assistant anything. The Inbox (requests and notifications) is behind the bell.
 */
export function HomeScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();
    const attention = useAttentionCount();
    const [receiveOpen, setReceiveOpen] = useState(false);
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);
    const [question, setQuestion] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    const ask = () => {
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
            qc.invalidateQueries({ queryKey: ['home-overview'] }),
            qc.invalidateQueries({ queryKey: ['badge-total'] }),
        ]);
        setRefreshing(false);
    }, [qc]);

    return (
        <KeyboardAvoidingView style={[styles.root, { paddingTop: insets.top }]} behavior="padding">
            <View style={styles.header}>
                <Text style={styles.title}>📮 Home</Text>
                <View style={styles.actions}>
                    <Pressable style={styles.iconBtn} onPress={() => router.navigate('/inbox')} accessibilityRole="button" accessibilityLabel={attention > 0 ? `Inbox, ${attention} need attention` : 'Inbox'}>
                        <Inbox size={18} color={colors.textMuted} />
                        {attention > 0 && (
                            <View style={styles.badge}><Text style={styles.badgeText}>{attention > 99 ? '99+' : attention}</Text></View>
                        )}
                    </Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => router.push('/schedules')} accessibilityRole="button" accessibilityLabel="Schedules">
                        <CalendarDays size={18} color={colors.textMuted} />
                    </Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => setAccountMenuOpen(true)} accessibilityRole="button" accessibilityLabel="Account and Organizations">
                        <User size={18} color={colors.textMuted} />
                    </Pressable>
                </View>
            </View>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />}
            >
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

                <FinancialOverviewCard />
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
                    <Pressable onPress={ask} disabled={!question.trim()} style={({ pressed }) => [styles.send, !question.trim() && { opacity: 0.45 }, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel="Send to the Assistant">
                        <SendHorizontal size={20} color="#FFFFFF" strokeWidth={2} />
                    </Pressable>
                </View>
            </View>

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
    assistantWrap: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
    assistant: {
        flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 32, minHeight: 56, paddingLeft: 24, paddingRight: 8,
        borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', ...cardShadow,
    },
    assistantInput: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text, paddingVertical: 10 },
    send: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
});

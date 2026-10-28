import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Animated, Easing, ActivityIndicator, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Check, X, PiggyBank, TrendingUp, AlertTriangle, Tag } from 'lucide-react-native';
import { requisitionService, formatKwacha, type SendSummary } from 'core';
import { onSendResult, type SendResultPayload } from '../../lib/sendResult';
import { extractEmojiAndName } from '../../utils/emoji';
import { colors, fonts, radius } from '../../theme/tokens';

const CARD_WIDTH = Math.min(340, Dimensions.get('window').width - 48);

/**
 * The "money sent" popup. It confirms the payment, then — once the payment has been filed under one of the person's accounts —
 * counts that account's spending for the month up to its new total (with a bar against the budget, when there is one). A
 * notification box slides in from the top saying how much of the budget is left; its ✕ dismisses it.
 */
export const SendResultHost: React.FC = () => {
    const insets = useSafeAreaInsets();
    const [payload, setPayload] = useState<SendResultPayload | null>(null);
    const [summary, setSummary] = useState<SendSummary | null>(null);
    const [failed, setFailed] = useState(false);
    const [noteOpen, setNoteOpen] = useState(true);
    const [shown, setShown] = useState(0);              // the spend figure while it counts up

    const fade = useRef(new Animated.Value(0)).current;
    const pop = useRef(new Animated.Value(0)).current;  // the success tick
    const count = useRef(new Animated.Value(0)).current; // 0 → 1: spend counts up, bar fills
    const noteY = useRef(new Animated.Value(0)).current; // 0 hidden → 1 shown
    const run = useRef(0);

    const close = useCallback(() => {
        run.current++;
        Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => setPayload(null));
    }, [fade]);

    useEffect(() => onSendResult(async (p) => {
        const mine = ++run.current;
        setPayload(p); setSummary(null); setFailed(false); setNoteOpen(true); setShown(0);
        fade.setValue(0); pop.setValue(0); count.setValue(0); noteY.setValue(0);
        Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
        Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
        try {
            const s = await requisitionService.getSendSummary(p.requisitionId);
            if (run.current !== mine) return;
            setSummary(s);
            if (s.status !== 'ready') setFailed(true);
        } catch {
            if (run.current === mine) setFailed(true);
        }
    }), [fade, pop, count, noteY]);

    // The summary arrived: count the spend up, fill the bar, then bring in the budget note.
    useEffect(() => {
        if (!summary || summary.status !== 'ready' || summary.spentBefore === null || summary.spentAfter === null) return;
        const from = summary.spentBefore, to = summary.spentAfter;
        setShown(from);
        const id = count.addListener(({ value }) => setShown(from + (to - from) * value));
        const mine = run.current;
        Animated.sequence([
            Animated.delay(250),
            Animated.timing(count, { toValue: 1, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        ]).start(() => {
            if (run.current !== mine) return;
            setShown(to);
            Animated.spring(noteY, { toValue: 1, friction: 8, tension: 70, useNativeDriver: true }).start();
        });
        return () => count.removeListener(id);
    }, [summary, count, noteY]);

    if (!payload) return null;

    const ready = summary?.status === 'ready' && !!summary.account;
    const account = ready ? extractEmojiAndName(summary!.account!.name) : null;
    const budget = ready ? summary!.budget : null;
    const pct = (v: number) => (budget ? Math.min(1, v / budget.amount) : 0);
    const barColor = !budget ? colors.blue : budget.over ? colors.danger : budget.percentUsed >= 80 ? '#F59E0B' : colors.blue;
    const barWidth = budget && summary
        ? count.interpolate({ inputRange: [0, 1], outputRange: [`${pct(summary.spentBefore ?? 0) * 100}%`, `${pct(summary.spentAfter ?? 0) * 100}%`] })
        : '0%';

    const tone = !budget ? 'neutral' : budget.over ? 'over' : budget.percentUsed >= 80 ? 'warn' : 'ok';
    const toneStyle = { neutral: styles.noteNeutral, ok: styles.noteOk, warn: styles.noteWarn, over: styles.noteOver }[tone];
    const NoteIcon = tone === 'over' || tone === 'warn' ? AlertTriangle : budget ? PiggyBank : Tag;
    const noteColor = { neutral: colors.textMuted, ok: colors.blue, warn: '#B45309', over: colors.danger }[tone];

    return (
        <Modal visible transparent animationType="none" onRequestClose={close} statusBarTranslucent>
            <Animated.View style={[styles.backdrop, { opacity: fade }]}>
                <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
            </Animated.View>

            {/* The budget note: slides in from the top once the numbers have settled. ✕ closes just this note. */}
            {ready && noteOpen && (
                <Animated.View
                    pointerEvents="box-none"
                    style={[styles.noteWrap, { top: insets.top + 8, opacity: noteY, transform: [{ translateY: noteY.interpolate({ inputRange: [0, 1], outputRange: [-140, 0] }) }] }]}
                >
                    <View style={[styles.note, toneStyle]}>
                        <View style={[styles.noteIcon, { backgroundColor: noteColor + '1A' }]}><NoteIcon size={18} color={noteColor} /></View>
                        <View style={{ flex: 1, paddingRight: 20 }}>
                            <Text style={styles.noteTitle}>{budget ? 'Budget update' : 'No budget yet'}</Text>
                            {budget ? (
                                <>
                                    <Text style={styles.noteBody}>
                                        {budget.over
                                            ? `You're ${formatKwacha(Math.abs(budget.remaining))} over your ${account!.cleanName} budget`
                                            : `${formatKwacha(budget.remaining)} left in your ${account!.cleanName} budget`}
                                    </Text>
                                    <Text style={styles.noteSub}>{formatKwacha(summary!.spentAfter ?? 0)} of {formatKwacha(budget.amount)} used this month ({budget.percentUsed}%)</Text>
                                </>
                            ) : (
                                <>
                                    <Text style={styles.noteBody}>There's no budget for {account!.cleanName} this month.</Text>
                                    <Pressable onPress={() => { close(); router.push('/budgets'); }} hitSlop={8}><Text style={styles.noteLink}>Set a budget</Text></Pressable>
                                </>
                            )}
                        </View>
                        <Pressable onPress={() => setNoteOpen(false)} hitSlop={10} style={styles.noteClose} accessibilityLabel="Dismiss">
                            <X size={15} color={colors.textMuted} />
                        </Pressable>
                    </View>
                </Animated.View>
            )}

            <View style={styles.center} pointerEvents="box-none">
                <Animated.View style={[styles.card, { opacity: fade, transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] }]}>
                    <Animated.View style={[styles.tick, { transform: [{ scale: pop }] }]}>
                        <Check size={30} color="#FFFFFF" strokeWidth={3} />
                    </Animated.View>
                    <Text style={styles.title}>Money sent</Text>
                    <Text style={styles.amount}>{formatKwacha(payload.amount)}</Text>
                    {!!payload.recipient && <Text style={styles.to} numberOfLines={1}>to {payload.recipient}</Text>}

                    <View style={styles.divider} />

                    {ready ? (
                        <View style={{ alignSelf: 'stretch', gap: 10 }}>
                            <View style={styles.acctRow}>
                                <View style={styles.emoji}><Text style={{ fontSize: 18 }}>{account!.emoji ?? '🏷️'}</Text></View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.filed}>Filed under</Text>
                                    <Text style={styles.acctName} numberOfLines={2}>{account!.cleanName}</Text>
                                </View>
                                <View style={styles.chip}><TrendingUp size={12} color={colors.blue} /><Text style={styles.chipText}>+{formatKwacha(summary!.amount)}</Text></View>
                            </View>
                            <Text style={styles.spentLabel}>Spent on {account!.cleanName} in {summary!.month}</Text>
                            <Text style={styles.spent}>{formatKwacha(shown)}</Text>
                            {budget && (
                                <View>
                                    <View style={styles.track}><Animated.View style={[styles.fill, { width: barWidth as any, backgroundColor: barColor }]} /></View>
                                    <Text style={styles.budgetOf}>of {formatKwacha(budget.amount)} budget</Text>
                                </View>
                            )}
                        </View>
                    ) : failed ? (
                        <Text style={styles.waiting}>It's being filed under the right account — you'll see it in Reporting in a moment.</Text>
                    ) : (
                        <View style={styles.waitingRow}>
                            <ActivityIndicator size="small" color={colors.blue} />
                            <Text style={styles.waiting}>Sorting it into your accounts…</Text>
                        </View>
                    )}

                    <Pressable onPress={close} style={({ pressed }) => [styles.done, pressed && { opacity: 0.85 }]} accessibilityRole="button">
                        <Text style={styles.doneText}>Done</Text>
                    </Pressable>
                </Animated.View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,30,45,0.55)' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    card: { width: CARD_WIDTH, backgroundColor: colors.surface, borderRadius: 28, paddingHorizontal: 22, paddingTop: 26, paddingBottom: 18, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
    tick: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.positive, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    title: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' },
    amount: { fontFamily: fonts.bodyBold, fontSize: 30, color: '#000000', marginTop: 2 },
    to: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 2, maxWidth: CARD_WIDTH - 44 },
    divider: { alignSelf: 'stretch', height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.border, marginVertical: 16 },
    acctRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    emoji: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.tabActiveBg, alignItems: 'center', justifyContent: 'center' },
    filed: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    acctName: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#000000' },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.tabActiveBg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
    chipText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.blue },
    spentLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
    spent: { fontFamily: fonts.bodyBold, fontSize: 28, color: colors.navy, marginTop: -4 },
    track: { height: 8, backgroundColor: '#E5E7EB', borderRadius: 8, overflow: 'hidden' },
    fill: { height: 8, borderRadius: 8 },
    budgetOf: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textFaint, marginTop: 5, textAlign: 'right' },
    waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
    waiting: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
    done: { alignSelf: 'stretch', marginTop: 18, minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    doneText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
    noteWrap: { position: 'absolute', left: 16, right: 16 },
    note: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 20, borderWidth: 1, backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
    noteNeutral: { borderColor: colors.border },
    noteOk: { borderColor: '#BFDBFE' },
    noteWarn: { borderColor: '#FCD34D' },
    noteOver: { borderColor: '#FCA5A5' },
    noteIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    noteTitle: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textFaint, letterSpacing: 0.5, textTransform: 'uppercase' },
    noteBody: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: '#000000', marginTop: 2, lineHeight: 19 },
    noteSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
    noteLink: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue, marginTop: 4 },
    noteClose: { position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center' },
});

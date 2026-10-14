import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, CheckCircle2, Circle, Trophy, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWalkthrough } from '../../hooks/useWalkthrough';
import { useWalkthroughUi, walkthroughUi } from '../../lib/walkthroughUi';
import { colors, fonts, radius } from '../../theme/tokens';

/** The two sheets behind the Inbox walkthrough card: one step's guide, and the full checklist. Mount once on the Inbox. */
export const WalkthroughModals: React.FC = () => {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const ui = useWalkthroughUi();
    const { tasks, completed, total, type, hidden, skip, unskip, setCardHidden } = useWalkthrough();

    const step = ui.step ? tasks.find((t) => t.id === ui.step) ?? null : null;
    const stepIndex = step ? tasks.findIndex((t) => t.id === step.id) + 1 : 0;
    const pct = total ? Math.round((completed / total) * 100) : 0;

    const go = (route: string) => { walkthroughUi.closeStep(); walkthroughUi.closeList(); router.push(route as any); };

    return (
        <>
            {/* ── One step ── */}
            <Modal visible={!!step} animationType="slide" transparent onRequestClose={walkthroughUi.closeStep} statusBarTranslucent>
                <Pressable style={styles.overlay} onPress={walkthroughUi.closeStep}>
                    <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => undefined}>
                        {step && (
                            <>
                                <View style={styles.sheetTop}>
                                    <View style={styles.stepIcon}><step.icon size={22} color={colors.blue} strokeWidth={1.8} /></View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.kicker}>STEP {stepIndex} OF {total}</Text>
                                        <Text style={styles.stepTitle}>{step.title}</Text>
                                    </View>
                                    <Pressable onPress={walkthroughUi.closeStep} hitSlop={10} accessibilityLabel="Close"><X size={20} color={colors.textMuted} /></Pressable>
                                </View>

                                <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                                    <Text style={styles.why}>{step.why}</Text>
                                    <Text style={styles.label}>HOW IT WORKS</Text>
                                    {step.how.map((line, i) => (
                                        <View key={i} style={styles.howRow}>
                                            <View style={styles.howNum}><Text style={styles.howNumText}>{i + 1}</Text></View>
                                            <Text style={styles.howText}>{line}</Text>
                                        </View>
                                    ))}
                                </ScrollView>

                                {step.complete ? (
                                    <View style={styles.doneRow}>
                                        <CheckCircle2 size={18} color={colors.positiveInk} />
                                        <Text style={styles.doneText}>You've already done this step.</Text>
                                    </View>
                                ) : (
                                    <>
                                        <Pressable style={({ pressed }) => [styles.cta, pressed && { opacity: 0.88 }]} onPress={() => go(step.route)}>
                                            <Text style={styles.ctaText}>{step.cta}</Text>
                                            <ArrowRight size={18} color="#FFFFFF" />
                                        </Pressable>
                                        <Pressable onPress={() => { skip(step.id); walkthroughUi.closeStep(); }} style={styles.skipBtn} hitSlop={8}>
                                            <Text style={styles.skipText}>Skip this step</Text>
                                        </Pressable>
                                    </>
                                )}
                            </>
                        )}
                    </Pressable>
                </Pressable>
            </Modal>

            {/* ── The whole checklist ── */}
            <Modal visible={ui.list} animationType="slide" transparent onRequestClose={walkthroughUi.closeList} statusBarTranslucent>
                <Pressable style={styles.overlay} onPress={walkthroughUi.closeList}>
                    <Pressable style={[styles.sheet, styles.listSheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => undefined}>
                        <View style={styles.sheetTop}>
                            <View style={styles.stepIcon}><Trophy size={22} color={colors.blue} strokeWidth={1.8} /></View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.stepTitle}>{type === 'PERSONAL' ? 'Get the most out of Moneywise' : 'Set up your business'}</Text>
                                <Text style={styles.sub}>{completed} of {total} steps completed</Text>
                            </View>
                            <Pressable onPress={walkthroughUi.closeList} hitSlop={10} accessibilityLabel="Close"><X size={20} color={colors.textMuted} /></Pressable>
                        </View>
                        <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>

                        <ScrollView style={{ marginTop: 6 }} showsVerticalScrollIndicator={false}>
                            {tasks.map((t) => (
                                <Pressable
                                    key={t.id}
                                    style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.canvas }]}
                                    onPress={() => walkthroughUi.openStep(t.id)}
                                >
                                    {t.complete
                                        ? <CheckCircle2 size={22} color={colors.positiveInk} />
                                        : <Circle size={22} color={t.skipped ? colors.textFaint : '#525252'} strokeWidth={1.6} />}
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.itemTitle, t.complete && styles.itemTitleDone]}>{t.title}</Text>
                                        <Text style={styles.itemBlurb} numberOfLines={2}>{t.blurb}</Text>
                                    </View>
                                    {t.skipped && !t.complete && (
                                        <Pressable onPress={() => unskip(t.id)} hitSlop={8}><Text style={styles.undo}>Skipped · Undo</Text></Pressable>
                                    )}
                                </Pressable>
                            ))}
                        </ScrollView>

                        <View style={styles.prefRow}>
                            <Text style={styles.prefText}>Show this on my Inbox</Text>
                            <Switch value={!hidden} onValueChange={(v) => setCardHidden(!v)} trackColor={{ true: colors.blue, false: colors.borderStrong }} />
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>
        </>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 22, gap: 12 },
    listSheet: { maxHeight: '86%' },
    sheetTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    stepIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.tabActiveBg, alignItems: 'center', justifyContent: 'center' },
    kicker: { fontFamily: fonts.bodyBold, fontSize: 10.5, letterSpacing: 0.8, color: colors.blue },
    stepTitle: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text },
    sub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
    why: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: '#374151', marginBottom: 14 },
    label: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.7, color: colors.textFaint, marginBottom: 8 },
    howRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
    howNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.tabActiveBg, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    howNumText: { fontFamily: fonts.bodyBold, fontSize: 11.5, color: colors.blue },
    howText: { flex: 1, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20, color: colors.text },
    cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.blue, borderRadius: radius.pill, minHeight: 50, marginTop: 4 },
    ctaText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
    skipBtn: { alignItems: 'center', paddingVertical: 4 },
    skipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    doneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
    doneText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.positiveInk },
    track: { height: 4, borderRadius: 12, backgroundColor: '#E5E5E5', overflow: 'hidden' },
    fill: { height: 4, borderRadius: 60, backgroundColor: '#60A5FA' },
    item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 6, borderRadius: 12 },
    itemTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    itemTitleDone: { color: colors.textFaint, textDecorationLine: 'line-through' },
    itemBlurb: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textMuted, marginTop: 1 },
    undo: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: colors.blue },
    prefRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
    prefText: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.text },
});

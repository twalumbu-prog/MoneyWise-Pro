import { useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { X } from 'lucide-react-native';
import { formatKwacha } from 'core';
import { colors, fonts, radius } from '../../theme/tokens';

const ACCENT = colors.blue;

export type PaymentPhase = 'initiating' | 'confirm' | 'polling' | 'success';

function maskPhone(phone: string): string {
    const clean = (phone || '').replace(/[^0-9]/g, '');
    if (clean.length < 7) return phone;
    return `${clean.slice(0, 3)} ••• ${clean.slice(-4)}`;
}

/**
 * Native port of apps/web/src/components/PaymentWaitingScreen.tsx, scoped to
 * the four phases InvestPaymentFlow actually drives (initiating/confirm/
 * polling/success) — web's failed/cancelled/recheck states belong to the real
 * Collections polling loop on QuickPay, which this simulated invest deposit
 * never enters.
 */
export const PaymentWaitingScreen: React.FC<{
    phase: PaymentPhase;
    amount: number;
    businessName: string;
    payerPhone: string;
    operator: string | null;
    elapsedSeconds: number;
    reference?: string | null;
    onCancel: () => void;
    onDone: () => void;
}> = ({ phase, amount, businessName, payerPhone, operator, elapsedSeconds, reference, onCancel, onDone }) => {
    const insets = useSafeAreaInsets();
    const opLabel = operator ? operator.toUpperCase() : 'MOBILE MONEY';
    const showSpinner = phase === 'initiating' || phase === 'confirm' || phase === 'polling';

    const spin = useRef(new Animated.Value(0)).current;
    const breathe = useRef(new Animated.Value(0)).current;
    const pop = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }),
        );
        loop.start();
        return () => loop.stop();
    }, [spin]);

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(breathe, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(breathe, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [breathe]);

    useEffect(() => {
        if (phase !== 'success') return;
        pop.setValue(0);
        Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
    }, [phase, pop]);

    const pollingSub = useMemo(() => {
        const tips = ['Verifying with the network…', 'Confirming your payment…', 'Almost there…'];
        const tick = Math.floor(Math.max(0, elapsedSeconds) / 4);
        return tips[tick % tips.length];
    }, [elapsedSeconds]);

    const { title, sub } = useMemo(() => {
        switch (phase) {
            case 'initiating': return { title: 'Setting up your payment', sub: `Securely reaching ${opLabel}…` };
            case 'confirm': return { title: 'Approve on your phone', sub: `Open the prompt on ${maskPhone(payerPhone)} and enter your PIN to approve.` };
            case 'polling': return { title: 'Confirming your payment', sub: pollingSub };
            case 'success': return { title: 'Payment successful', sub: `${formatKwacha(amount)} paid to ${businessName}.` };
        }
    }, [phase, opLabel, payerPhone, pollingSub, amount, businessName]);

    const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
    const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] });

    return (
        <View style={styles.root}>
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <View style={{ width: 34 }} />
                <Text style={styles.headerLabel}>Send money</Text>
                <Pressable onPress={phase === 'success' ? onDone : onCancel} style={styles.headerBtn} hitSlop={8}>
                    <X size={14} color={colors.textFaint} />
                </Pressable>
            </View>

            <View style={styles.orbWrap}>
                <View style={styles.orbInner}>
                    {showSpinner && (
                        <Animated.View style={[StyleSheet.absoluteFillObject, { transform: [{ rotate }] }]}>
                            <Svg width={92} height={92} viewBox="0 0 92 92">
                                <Circle cx={46} cy={46} r={41} fill="none" stroke={ACCENT} strokeWidth={2.5} strokeLinecap="round" strokeDasharray="60 198" />
                            </Svg>
                        </Animated.View>
                    )}
                    <Animated.View style={[styles.orbCore, { transform: [{ scale }] }]}>
                        <Text style={styles.orbCoreText}>ZMW</Text>
                    </Animated.View>
                    {phase === 'success' && (
                        <Animated.View style={[styles.successBadge, { transform: [{ scale: pop }] }]}>
                            <Svg width={34} height={34} viewBox="0 0 34 34">
                                <Path d="M9 17.5 L15 23.5 L25.5 12" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
                            </Svg>
                        </Animated.View>
                    )}
                </View>
            </View>

            <View style={styles.headingWrap}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.sub}>{sub}</Text>
            </View>

            <View style={styles.panel}>
                {phase === 'initiating' && (
                    <>
                        <View style={styles.progressTrack}><View style={styles.progressBar} /></View>
                        <View style={styles.secureRow}>
                            <Text style={styles.secureText}>🔒 Encrypted &amp; secured</Text>
                        </View>
                    </>
                )}

                {phase === 'confirm' && (
                    <>
                        <View style={styles.pinCard}>
                            <View style={styles.pinCardTop}>
                                <View style={styles.pinDot} />
                                <Text style={styles.pinCardTopText}>{opLabel} · MOBILE MONEY</Text>
                            </View>
                            <Text style={styles.pinCardBody}>
                                Pay{'\n'}Amount: <Text style={styles.pinCardBold}>{formatKwacha(amount)}</Text>{'\n'}
                                To: {businessName}{'\n'}Enter PIN to confirm:
                            </Text>
                            <Text style={styles.pinDots}>● ● ● |</Text>
                        </View>
                        <Text style={styles.waitingText}>Waiting for your approval on your phone</Text>
                    </>
                )}

                {phase === 'polling' && (
                    <>
                        <View style={styles.progressTrack}><View style={styles.progressBar} /></View>
                        <Text style={styles.pollingText}>Keep this screen open — it updates automatically.</Text>
                        <Pressable style={styles.cancelBtn} onPress={onCancel}>
                            <Text style={styles.cancelBtnText}>Cancel payment</Text>
                        </Pressable>
                    </>
                )}

                {phase === 'success' && (
                    <>
                        <View style={styles.successCard}>
                            <SummaryLine label="Amount" value={formatKwacha(amount)} />
                            <SummaryLine label="Paid to" value={businessName} />
                            <SummaryLine label="Reference" value={reference ? `#${reference}` : '—'} mono last />
                        </View>
                        <Pressable style={styles.doneBtn} onPress={onDone}>
                            <Text style={styles.doneBtnText}>View receipt</Text>
                        </Pressable>
                    </>
                )}
            </View>
        </View>
    );
};

const SummaryLine: React.FC<{ label: string; value: string; mono?: boolean; last?: boolean }> = ({ label, value, mono, last }) => (
    <View style={[styles.summaryRow, !last && styles.summaryRowBorder]}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={[styles.summaryValue, mono && styles.summaryValueMono]}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    root: { flex: 1, paddingHorizontal: 24, paddingBottom: 24 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 16 },
    headerLabel: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted, letterSpacing: 0.3 },
    headerBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center' },
    orbWrap: { alignItems: 'center', justifyContent: 'center', height: 100 },
    orbInner: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center' },
    orbCore: {
        width: 92, height: 92, borderRadius: 46, backgroundColor: '#F7F8FA', borderWidth: 1, borderColor: '#ECEEF1',
        alignItems: 'center', justifyContent: 'center', position: 'absolute',
    },
    orbCoreText: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#AEB4BE', letterSpacing: 0.3 },
    successBadge: {
        position: 'absolute', width: 98, height: 98, borderRadius: 49, backgroundColor: ACCENT,
        alignItems: 'center', justifyContent: 'center', top: -3, left: -3,
    },
    headingWrap: { marginTop: 20, alignItems: 'center', minHeight: 52 },
    title: { fontFamily: fonts.bodyBold, fontSize: 19, color: colors.text, letterSpacing: -0.3, textAlign: 'center' },
    sub: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 6, textAlign: 'center', maxWidth: 280, lineHeight: 19 },
    panel: { flex: 1, justifyContent: 'flex-end', gap: 12 },
    progressTrack: { height: 6, borderRadius: 6, backgroundColor: '#EEF1F5', overflow: 'hidden' },
    progressBar: { width: '40%', height: '100%', borderRadius: 6, backgroundColor: ACCENT },
    secureRow: { alignItems: 'center' },
    secureText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textFaint },
    pinCard: { borderRadius: 16, backgroundColor: '#F7F8FA', borderWidth: 1.5, borderColor: '#DCE6FB', padding: 16 },
    pinCardTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    pinDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT },
    pinCardTopText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, letterSpacing: 0.4 },
    pinCardBody: { fontFamily: fonts.body, fontSize: 12.5, color: '#3A424E', lineHeight: 20 },
    pinCardBold: { fontFamily: fonts.bodyBold, color: colors.text },
    pinDots: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text, letterSpacing: 5, marginTop: 8 },
    waitingText: { fontFamily: fonts.bodyBold, fontSize: 13, color: ACCENT, textAlign: 'center' },
    pollingText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textFaint, textAlign: 'center' },
    cancelBtn: {
        borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 13,
        alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
    },
    cancelBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    successCard: { borderRadius: 16, backgroundColor: '#F4F8FF', borderWidth: 1, borderColor: '#DBE6FB', padding: 16 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
    summaryRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E7EEFA' },
    summaryLabel: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textMuted },
    summaryValue: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.text },
    summaryValueMono: { fontFamily: fonts.body },
    doneBtn: { backgroundColor: ACCENT, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
    doneBtnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#FFFFFF' },
});

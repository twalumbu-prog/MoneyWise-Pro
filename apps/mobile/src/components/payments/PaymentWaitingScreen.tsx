import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { X } from 'lucide-react-native';
import { formatKwacha } from 'core';
import { colors, fonts, radius } from '../../theme/tokens';

const ACCENT = colors.blue;

export type PaymentPhase = 'initiating' | 'confirm' | 'polling' | 'success' | 'failed' | 'cancelled';

function maskPhone(phone: string): string {
    const clean = (phone || '').replace(/[^0-9]/g, '');
    if (clean.length < 7) return phone;
    return `${clean.slice(0, 3)} ••• ${clean.slice(-4)}`;
}

/**
 * Native port of apps/web/src/components/PaymentWaitingScreen.tsx with the same motion: spinning
 * ring + breathing orb, a sliding indeterminate bar, the glowing PIN card with a blinking cursor,
 * a pulse ring on "waiting", panels rising in on every phase change, the tick popping in on
 * success and a shaking red badge on decline. Driven by useMobileMoneyCollection.
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
    /** Header caption (defaults to "Send money"). */
    headerLabel?: string;
    /** Label of the success button (defaults to "View receipt"). */
    doneLabel?: string;
    /** failed phase: why it stopped. `declined` = the payer refused / the network rejected it. */
    failureMessage?: string | null;
    declined?: boolean;
    /** failed / cancelled: ask Lenco again whether the payment actually went through. */
    onRecheck?: () => void;
    rechecking?: boolean;
    recheckNote?: string | null;
    /** failed / cancelled: start a fresh attempt. */
    onRetry?: () => void;
}> = ({
    phase, amount, businessName, payerPhone, operator, elapsedSeconds, reference, onCancel, onDone,
    headerLabel = 'Send money', doneLabel = 'View receipt', failureMessage, declined, onRecheck, rechecking, recheckNote, onRetry,
}) => {
    const insets = useSafeAreaInsets();
    const opLabel = operator ? operator.toUpperCase() : 'MOBILE MONEY';
    const showSpinner = phase === 'initiating' || phase === 'confirm' || phase === 'polling';

    const spin = useRef(new Animated.Value(0)).current;
    const breathe = useRef(new Animated.Value(0)).current;
    const pop = useRef(new Animated.Value(0)).current;
    const bar = useRef(new Animated.Value(0)).current;
    const blink = useRef(new Animated.Value(0)).current;
    const ring = useRef(new Animated.Value(0)).current;
    const rise = useRef(new Animated.Value(0)).current;
    const shake = useRef(new Animated.Value(0)).current;
    const attn = useRef(new Animated.Value(0)).current; // JS-driven: colours can't use the native driver
    const [trackW, setTrackW] = useState(0);

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
        const loops = [
            Animated.loop(Animated.timing(bar, { toValue: 1, duration: 1250, easing: Easing.linear, useNativeDriver: true })),
            Animated.loop(Animated.sequence([
                Animated.timing(blink, { toValue: 1, duration: 500, useNativeDriver: true }),
                Animated.timing(blink, { toValue: 0, duration: 500, useNativeDriver: true }),
            ])),
            Animated.loop(Animated.timing(ring, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true })),
        ];
        loops.push(Animated.loop(Animated.sequence([
            Animated.timing(attn, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
            Animated.timing(attn, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ])));
        loops.forEach((l) => l.start());
        return () => loops.forEach((l) => l.stop());
    }, [bar, blink, ring, attn]);

    // Every phase change rises in, like the web panels.
    useEffect(() => {
        rise.setValue(0);
        Animated.timing(rise, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }, [phase, rise]);

    const failedBadge = phase === 'failed' && !!declined;
    useEffect(() => {
        if (phase !== 'success' && !failedBadge) return;
        pop.setValue(0);
        Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
        if (failedBadge) {
            shake.setValue(0);
            Animated.sequence([
                Animated.delay(280),
                Animated.timing(shake, { toValue: 1, duration: 500, easing: Easing.linear, useNativeDriver: true }),
            ]).start();
        }
    }, [phase, failedBadge, pop, shake]);

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
            case 'failed': return declined
                ? { title: 'Payment not completed', sub: failureMessage || 'The payment was declined or not approved on your phone. Nothing was charged.' }
                : { title: 'Still confirming', sub: failureMessage || 'This is taking longer than usual. If you approved the prompt, it may still be processing.' };
            case 'cancelled': return { title: 'Payment stopped', sub: 'We stopped waiting. If the prompt is still on your phone and you approve it, the money will still arrive and be recorded.' };
        }
    }, [phase, opLabel, payerPhone, pollingSub, amount, businessName, declined, failureMessage]);

    const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
    const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] });
    const barX = bar.interpolate({ inputRange: [0, 1], outputRange: [-0.4 * trackW, trackW] });
    const glow = attn.interpolate({ inputRange: [0, 1], outputRange: ['#DCE6FB', '#8FB6FF'] });
    const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.7, 2.4] });
    const ringOpacity = ring.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0, 0] });
    const riseStyle = { opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] };
    const shakeX = shake.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [0, -6, 6, -4, 4, 0] });
    const Bar = () => (
        <View style={styles.progressTrack} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
            <Animated.View style={[styles.progressBar, { transform: [{ translateX: barX }] }]} />
        </View>
    );
    const canRecheckWhileWaiting = !!onRecheck && elapsedSeconds >= 20;

    return (
        <View style={styles.root}>
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <View style={{ width: 34 }} />
                <Text style={styles.headerLabel}>{headerLabel}</Text>
                <Pressable onPress={phase === 'success' || phase === 'failed' || phase === 'cancelled' ? onDone : onCancel} style={styles.headerBtn} hitSlop={8}>
                    <X size={14} color={colors.textFaint} />
                </Pressable>
            </View>

            <View style={styles.orbWrap}>
                <View style={styles.orbInner}>
                    {showSpinner && (
                        <Animated.View style={[StyleSheet.absoluteFillObject, { zIndex: 2, transform: [{ rotate }] }]}>
                            <Svg width={92} height={92} viewBox="0 0 92 92">
                                <Circle cx={46} cy={46} r={41} fill="none" stroke={ACCENT} strokeWidth={2.5} strokeLinecap="round" strokeDasharray="60 198" />
                            </Svg>
                        </Animated.View>
                    )}
                    <Animated.View style={[styles.orbCore, { transform: [{ scale }] }]}>
                        <Text style={styles.orbCoreText}>ZMW</Text>
                    </Animated.View>
                    {failedBadge && (
                        <Animated.View style={[styles.successBadge, { backgroundColor: '#E5484D', transform: [{ scale: pop }, { translateX: shakeX }] }]}>
                            <Svg width={30} height={30} viewBox="0 0 30 30">
                                <Path d="M9 9 L21 21 M21 9 L9 21" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" />
                            </Svg>
                        </Animated.View>
                    )}
                    {phase === 'success' && (
                        <Animated.View style={[styles.successBadge, { transform: [{ scale: pop }] }]}>
                            <Svg width={34} height={34} viewBox="0 0 34 34">
                                <Path d="M9 17.5 L15 23.5 L25.5 12" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
                            </Svg>
                        </Animated.View>
                    )}
                </View>
            </View>

            <Animated.View style={[styles.headingWrap, riseStyle]}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.sub}>{sub}</Text>
            </Animated.View>

            <Animated.View style={[styles.panel, riseStyle]}>
                {phase === 'initiating' && (
                    <>
                        <Bar />
                        <View style={styles.secureRow}>
                            <Text style={styles.secureText}>🔒 Encrypted &amp; secured</Text>
                        </View>
                    </>
                )}

                {phase === 'confirm' && (
                    <>
                        <Animated.View style={[styles.pinCard, { borderColor: glow }]}>
                            <View style={styles.pinCardTop}>
                                <Animated.View style={[styles.pinDot, { opacity: blink }]} />
                                <Text style={styles.pinCardTopText}>{opLabel} · MOBILE MONEY</Text>
                            </View>
                            <Text style={styles.pinCardBody}>
                                Pay{'\n'}Amount: <Text style={styles.pinCardBold}>{formatKwacha(amount)}</Text>{'\n'}
                                To: {businessName}{'\n'}Enter PIN to confirm:
                            </Text>
                            <View style={styles.pinRow}>
                                <Text style={styles.pinDots}>● ● ●</Text>
                                <Animated.View style={[styles.pinCursor, { opacity: blink }]} />
                            </View>
                        </Animated.View>
                        <View style={styles.waitingRow}>
                            <View style={styles.ringWrap}>
                                <Animated.View style={[styles.ringPulse, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
                                <View style={styles.ringDot} />
                            </View>
                            <Text style={styles.waitingText}>Waiting for your approval on your phone</Text>
                        </View>
                        {canRecheckWhileWaiting && <RecheckLink onPress={onRecheck!} rechecking={rechecking} />}
                        {!!recheckNote && <Text style={styles.noteText}>{recheckNote}</Text>}
                        <Pressable style={styles.cancelBtn} onPress={onCancel}>
                            <Text style={styles.cancelBtnText}>Cancel payment</Text>
                        </Pressable>
                    </>
                )}

                {phase === 'polling' && (
                    <>
                        <Bar />
                        <Text style={styles.pollingText}>Keep this screen open — it updates automatically.</Text>
                        {canRecheckWhileWaiting && <RecheckLink onPress={onRecheck!} rechecking={rechecking} />}
                        {!!recheckNote && <Text style={styles.noteText}>{recheckNote}</Text>}
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
                            <Text style={styles.doneBtnText}>{doneLabel}</Text>
                        </Pressable>
                    </>
                )}

                {(phase === 'failed' || phase === 'cancelled') && (
                    <>
                        {!!recheckNote && <Text style={styles.noteText}>{recheckNote}</Text>}
                        {!declined && onRecheck && (
                            <Pressable style={[styles.doneBtn, styles.rowCenter, rechecking && { opacity: 0.7 }]} onPress={onRecheck} disabled={rechecking}>
                                {rechecking && <ActivityIndicator size="small" color="#FFFFFF" />}
                                <Text style={styles.doneBtnText}>{rechecking ? 'Checking with Lenco…' : 'Check payment status'}</Text>
                            </Pressable>
                        )}
                        {onRetry && (
                            <Pressable style={declined || !onRecheck ? styles.doneBtn : styles.cancelBtn} onPress={onRetry}>
                                <Text style={declined || !onRecheck ? styles.doneBtnText : styles.cancelBtnText}>Try again</Text>
                            </Pressable>
                        )}
                        <Pressable style={styles.cancelBtn} onPress={onDone}>
                            <Text style={styles.cancelBtnText}>Close</Text>
                        </Pressable>
                    </>
                )}
            </Animated.View>
        </View>
    );
};

const RecheckLink: React.FC<{ onPress: () => void; rechecking?: boolean }> = ({ onPress, rechecking }) => (
    <Pressable style={[styles.linkBtn, styles.rowCenter]} onPress={onPress} disabled={rechecking} hitSlop={6}>
        {rechecking && <ActivityIndicator size="small" color={ACCENT} />}
        <Text style={styles.linkBtnText}>{rechecking ? 'Checking with Lenco…' : 'Already approved? Check payment status'}</Text>
    </Pressable>
);

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
    progressBar: { width: '40%', height: '100%', borderRadius: 6, backgroundColor: ACCENT, position: 'absolute', left: 0, top: 0 },
    secureRow: { alignItems: 'center' },
    secureText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textFaint },
    pinCard: { borderRadius: 16, backgroundColor: '#F7F8FA', borderWidth: 1.5, borderColor: '#DCE6FB', padding: 16 },
    pinCardTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    pinDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT },
    pinCardTopText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, letterSpacing: 0.4 },
    pinCardBody: { fontFamily: fonts.body, fontSize: 12.5, color: '#3A424E', lineHeight: 20 },
    pinCardBold: { fontFamily: fonts.bodyBold, color: colors.text },
    pinDots: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text, letterSpacing: 5 },
    pinRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 8 },
    pinCursor: { width: 9, height: 17, backgroundColor: ACCENT },
    waitingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
    ringWrap: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
    ringPulse: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: ACCENT },
    ringDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT },
    noteText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: '#9A5B00', textAlign: 'center', lineHeight: 18, backgroundColor: '#FFF7E6', borderRadius: radius.md, padding: 12, overflow: 'hidden' },
    linkBtn: { paddingVertical: 8 },
    linkBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: ACCENT },
    rowCenter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
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

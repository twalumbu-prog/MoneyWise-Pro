import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Animated, Easing, Platform, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Copy, Check, EyeOff } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { fonts } from '../../theme/tokens';

const SHOW_SECONDS = 30;
/** Sample digits for the preview. The real number, expiry and code come from the card issuer once cards open. */
const SAMPLE = { number: '0000 0000 0000 0000', expiry: '00/00', cvv: '000' };

/**
 * Card details: the card spins, rises onto the screen and turns to show its number, expiry and security code. It turns back
 * by itself after 30 seconds. The details here are a preview with sample digits, ready to be replaced by the issuer's.
 */
export function CardDetailsReveal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    const { userName } = useAuth();
    const { width } = useWindowDimensions();
    const cardW = Math.min(width - 40, 380);
    const cardH = Math.round(cardW / 1.586);

    const rise = useRef(new Animated.Value(0)).current;
    const spin = useRef(new Animated.Value(0)).current;
    const [secs, setSecs] = useState(SHOW_SECONDS);
    const [copied, setCopied] = useState<string | null>(null);
    const closing = useRef(false);

    const hide = useCallback(() => {
        if (closing.current) return;
        closing.current = true;
        Animated.parallel([
            Animated.timing(spin, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
            Animated.timing(rise, { toValue: 0, duration: 520, delay: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        ]).start(() => { closing.current = false; onClose(); });
    }, [onClose, rise, spin]);

    useEffect(() => {
        if (!visible) return;
        closing.current = false;
        rise.setValue(0); spin.setValue(0); setSecs(SHOW_SECONDS); setCopied(null);
        Animated.parallel([
            Animated.timing(rise, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(spin, { toValue: 1, duration: 1250, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        const t = setInterval(() => setSecs((n) => n - 1), 1000);
        return () => clearInterval(t);
    }, [visible, rise, spin]);

    useEffect(() => { if (visible && secs <= 0) hide(); }, [secs, visible, hide]);

    const copy = async (key: string, value: string) => {
        await Clipboard.setStringAsync(value.replace(/\s/g, ''));
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400);
    };

    // One and a half turns: the front shows for the first moments, the back lands facing you.
    const frontRot = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '540deg'] });
    const backRot = spin.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '720deg'] });
    const lift = rise.interpolate({ inputRange: [0, 1], outputRange: [140, 0] });
    const grow = rise.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });

    const Row = ({ k, label, value }: { k: string; label: string; value: string }) => (
        <View style={s.row}>
            <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>{label}</Text>
                <Text style={s.rowValue}>{value}</Text>
            </View>
            <Pressable onPress={() => copy(k, value)} hitSlop={8} style={s.copyBtn} accessibilityLabel={`Copy ${label}`}>
                {copied === k ? <Check size={14} color="#FFFFFF" /> : <Copy size={14} color="#FFFFFF" />}
            </Pressable>
        </View>
    );

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={hide} statusBarTranslucent>
            <Animated.View style={[s.backdrop, { opacity: rise }]}>
                <Pressable style={StyleSheet.absoluteFill} onPress={hide} accessibilityLabel="Hide card details" />
            </Animated.View>
            <View style={s.center} pointerEvents="box-none">
                <Animated.View style={{ width: cardW, height: cardH, opacity: rise, transform: [{ perspective: 1400 }, { translateY: lift }, { scale: grow }] }}>
                    {/* Front */}
                    <Animated.View style={[s.face, { transform: [{ perspective: 1400 }, { rotateY: frontRot }] }]}>
                        <LinearGradient colors={['#1A6BE0', '#0842A0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.faceInner}>
                            <View style={s.glow} />
                            <Text style={s.visa}>VISA</Text>
                            <View style={s.chip} />
                            <Text style={s.frontLabel}>Virtual card</Text>
                        </LinearGradient>
                    </Animated.View>
                    {/* Back: the details */}
                    <Animated.View style={[s.face, { transform: [{ perspective: 1400 }, { rotateY: backRot }] }]}>
                        <LinearGradient colors={['#12151B', '#05070A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.faceInner, { justifyContent: 'space-between' }]}>
                            <View style={s.backTop}>
                                <Text style={s.visaSmall}>VISA</Text>
                                <View style={s.preview}><Text style={s.previewText}>Preview · sample details</Text></View>
                            </View>
                            <Row k="number" label="CARD NUMBER" value={SAMPLE.number} />
                            <View style={{ flexDirection: 'row', gap: 18 }}>
                                <View style={{ flex: 1 }}><Row k="exp" label="EXPIRY" value={SAMPLE.expiry} /></View>
                                <View style={{ flex: 1 }}><Row k="cvv" label="SECURITY CODE" value={SAMPLE.cvv} /></View>
                            </View>
                            <Text style={s.holder} numberOfLines={1}>{(userName || 'CARD HOLDER').toUpperCase()}</Text>
                        </LinearGradient>
                    </Animated.View>
                </Animated.View>

                <Animated.View style={[s.footer, { opacity: rise }]}>
                    <Text style={s.hides}>Hides in {Math.max(secs, 0)}s</Text>
                    <Pressable style={s.hideBtn} onPress={hide} accessibilityRole="button"><EyeOff size={16} color="#1F1F1F" /><Text style={s.hideText}>Hide details</Text></Pressable>
                    <Text style={s.note}>Sample digits for now. Your real number, expiry and code appear here once cards open.</Text>
                </Animated.View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,10,14,0.72)' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    face: { ...StyleSheet.absoluteFillObject, backfaceVisibility: 'hidden', borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 22, shadowOffset: { width: 0, height: 14 }, elevation: 12 },
    faceInner: { flex: 1, padding: 18, borderRadius: 20 },
    glow: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,255,255,0.07)', right: -90, top: -110 },
    visa: { fontFamily: fonts.bodyBold, fontSize: 24, color: '#FFFFFF', fontStyle: 'italic', letterSpacing: 0.5 },
    chip: { position: 'absolute', right: 18, top: 18, width: 38, height: 28, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.28)' },
    frontLabel: { position: 'absolute', left: 18, bottom: 16, fontFamily: fonts.bodyMedium, fontSize: 12, color: 'rgba(255,255,255,0.8)' },
    backTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    visaSmall: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF', fontStyle: 'italic' },
    preview: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    previewText: { fontFamily: fonts.bodyBold, fontSize: 9.5, color: '#FFFFFF' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowLabel: { fontFamily: fonts.body, fontSize: 8.5, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.8 },
    rowValue: { fontFamily: fonts.bodyBold, fontSize: 17, color: '#FFFFFF', letterSpacing: 1.4, marginTop: 2 },
    copyBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
    holder: { fontFamily: fonts.bodyMedium, fontSize: 11, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.8 },
    footer: { alignItems: 'center', gap: 12, marginTop: 28, maxWidth: 360 },
    hides: { fontFamily: fonts.bodyMedium, fontSize: 12, color: 'rgba(255,255,255,0.75)' },
    hideBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 22, paddingVertical: 12 },
    hideText: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#1F1F1F' },
    note: { fontFamily: fonts.body, fontSize: 11, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 15 },
});

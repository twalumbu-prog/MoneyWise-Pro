import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ShieldCheck, Snowflake, Globe, Gauge, CreditCard, Lock, MoreHorizontal, ChevronRight, Receipt, X } from 'lucide-react-native';
import { AppleLogo, GoogleG, MastercardLogo } from './PayLogos';
import { CardDetailsReveal } from './CardDetailsReveal';
import { colors, fonts, radius } from '../../theme/tokens';

/** Flip to true once cards can be issued: the payment history then appears under the wallet. */
const CARD_ACTIVATED = false;

const PERKS = [
    { icon: Globe, title: 'Pay anywhere online', text: 'Subscriptions, ads, flights and international shops that take Visa.' },
    { icon: Gauge, title: 'You set the limit', text: 'Choose what the card can spend each month and stop it overspending.' },
    { icon: Snowflake, title: 'Freeze in a tap', text: 'Lost track of a charge? Freeze the card instantly and unfreeze when you are ready.' },
    { icon: ShieldCheck, title: 'Keeps your wallet safe', text: 'Shops never see your wallet or your real card details.' },
];

/**
 * The wallet: Visa, Apple Pay, Google Pay and Mastercard spread left to right, each one's logo showing, with a see-through
 * glass pocket in front. Colours stay inside the app's palette: blue, black and white.
 */
const CARD_H = 118;
function WalletVisual() {
    const [w, setW] = useState(0);
    // Stacked behind one another like cards in a wallet: each sits a little lower and further right than the one before, so every logo shows.
    const cardW = Math.round(w * 0.78);
    const lefts = [0, 0.07, 0.13, 0.2];
    const rot = ['-8deg', '-3deg', '3deg', '8deg'];
    const top = [8, 36, 64, 92];
    const glass = Platform.OS === 'web' ? ({ backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)' } as any) : null;
    const cards = [
        { key: 'visa', bg: ['#1A6BE0', '#0842A0'] as [string, string], logo: <Text style={s.visa}>VISA</Text> },
        { key: 'apple', bg: ['#1B1C1F', '#000000'] as [string, string], logo: <View style={s.logoRow}><AppleLogo size={20} /><Text style={[s.payText, { color: '#FFFFFF' }]}>Pay</Text></View> },
        { key: 'google', bg: ['#FFFFFF', '#F4F6FA'] as [string, string], logo: <View style={s.logoRow}><GoogleG size={20} /><Text style={[s.payText, { color: '#3C4043' }]}>Pay</Text></View>, border: true },
        { key: 'mc', bg: ['#E3ECFF', '#A9C0F8'] as [string, string], logo: <MastercardLogo width={42} />, border: true },
    ];
    return (
        <View style={s.wallet} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
            {w > 0 && cards.map((c, i) => (
                <LinearGradient key={c.key} colors={c.bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={[s.card, c.border && s.cardBorder, { width: cardW, left: Math.round(w * lefts[i]), top: top[i], zIndex: i, transform: [{ rotate: rot[i] }] }]}>
                    {c.logo}
                </LinearGradient>
            ))}

            {/* Glass pocket: the cards behind show through */}
            <View style={[s.pocket, glass]}>
                <LinearGradient colors={['rgba(28,32,42,0.46)', 'rgba(28,32,42,0.26)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <View style={s.pocketEdge} />
                <View style={s.stitch} />
                <Text style={s.pocketLabel}>Virtual card balance</Text>
                <Text style={s.pocketAmount}>K0<Text style={s.pocketCents}>.00</Text></Text>
                <View style={s.pocketBadge}><Lock size={11} color="#FFFFFF" /><Text style={s.pocketBadgeText}>Not activated</Text></View>
            </View>
        </View>
    );
}

/** The Virtual Card tab on Wallet: the card in its wallet, a way in to the setup, and what you get. */
export function VirtualCardTab() {
    const router = useRouter();
    const [moreOpen, setMoreOpen] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const setup = () => router.push('/wallet/virtual-card' as any);

    return (
        <View style={s.root}>
            <WalletVisual />

            <View style={s.soon}><Text style={s.soonText}>Virtual cards are coming soon. Set yours up now and you will be first in line.</Text></View>

            <Pressable style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]} onPress={setup} accessibilityRole="button">
                <CreditCard size={18} color="#FFFFFF" />
                <Text style={s.ctaText}>Get your virtual card</Text>
            </Pressable>

            <View style={s.actions}>
                <Pressable style={({ pressed }) => [s.action, pressed && { opacity: 0.8 }]} onPress={() => setDetailsOpen(true)} accessibilityRole="button" accessibilityLabel="Show card details">
                    <CreditCard size={18} color={colors.text} /><Text style={[s.actionText, { color: colors.text }]}>Card details</Text>
                </Pressable>
                <Pressable style={({ pressed }) => [s.action, pressed && { opacity: 0.8 }]} onPress={() => setMoreOpen(true)} accessibilityRole="button" accessibilityLabel="More card options">
                    <MoreHorizontal size={18} color={colors.text} /><Text style={[s.actionText, { color: colors.text }]}>More</Text>
                </Pressable>
            </View>

            {CARD_ACTIVATED ? (
                <View style={s.panel}>
                    <Text style={s.panelTitle}>Payment history</Text>
                    <View style={s.empty}>
                        <View style={s.emptyIcon}><Receipt size={20} color={colors.textFaint} /></View>
                        <Text style={s.emptyTitle}>No payments yet</Text>
                        <Text style={s.emptyText}>Every payment you make with the card will show here, with the shop and the date.</Text>
                    </View>
                </View>
            ) : null}

            <View style={s.panel}>
                <Text style={s.panelTitle}>What you get</Text>
                {PERKS.map((p) => (
                    <View key={p.title} style={s.perk}>
                        <View style={s.perkIcon}><p.icon size={18} color={colors.blue} /></View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.perkTitle}>{p.title}</Text>
                            <Text style={s.perkText}>{p.text}</Text>
                        </View>
                    </View>
                ))}
            </View>

            <CardDetailsReveal visible={detailsOpen} onClose={() => setDetailsOpen(false)} />

            <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
                <Pressable style={s.backdrop} onPress={() => setMoreOpen(false)}>
                    <Pressable style={s.sheet} onPress={() => undefined}>
                        <View style={s.sheetHead}>
                            <Text style={s.sheetTitle}>More</Text>
                            <Pressable onPress={() => setMoreOpen(false)} hitSlop={10} accessibilityLabel="Close"><X size={20} color={colors.textMuted} /></Pressable>
                        </View>
                        <Pressable style={s.sheetRow} onPress={() => { setMoreOpen(false); setup(); }}>
                            <View style={s.sheetIcon}><Gauge size={18} color={colors.blue} /></View>
                            <View style={{ flex: 1 }}><Text style={s.sheetRowTitle}>Card limits</Text><Text style={s.sheetRowText}>Choose what the card can spend each month.</Text></View>
                            <ChevronRight size={18} color={colors.textFaint} />
                        </Pressable>
                        <View style={[s.sheetRow, { opacity: 0.55 }]}>
                            <View style={s.sheetIcon}><Snowflake size={18} color={colors.blue} /></View>
                            <View style={{ flex: 1 }}><Text style={s.sheetRowTitle}>Freeze card</Text><Text style={s.sheetRowText}>Available once your card is active.</Text></View>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    // Same side margins as the tab control above, so everything lines up edge to edge with it.
    root: { gap: 16, marginHorizontal: 20, marginTop: 6 },
    wallet: { height: 232, borderRadius: 28 },
    card: { position: 'absolute', height: CARD_H, borderRadius: 16, padding: 14 },
    cardBorder: { borderWidth: 1, borderColor: '#DCE3EE' },
    logoRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    payText: { fontFamily: fonts.bodyBold, fontSize: 17, letterSpacing: 0.2 },
    visa: { fontFamily: fonts.bodyBold, fontSize: 20, color: '#FFFFFF', fontStyle: 'italic', letterSpacing: 0.5 },
    pocket: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 102, zIndex: 20, borderRadius: 26, alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' },
    pocketEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1.5, backgroundColor: 'rgba(255,255,255,0.6)' },
    stitch: { position: 'absolute', top: 9, left: 11, right: 11, bottom: 9, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.4)' },
    pocketLabel: { fontFamily: fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.9)' },
    pocketAmount: { fontFamily: fonts.bodyBold, fontSize: 32, color: '#FFFFFF', letterSpacing: -0.5 },
    pocketCents: { color: 'rgba(255,255,255,0.65)' },
    pocketBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    pocketBadgeText: { fontFamily: fonts.bodyBold, fontSize: 10.5, color: '#FFFFFF' },
    soon: { backgroundColor: '#EAF1FF', borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11 },
    soonText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.blue, lineHeight: 17 },
    cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.blue, borderRadius: radius.pill, paddingVertical: 15 },
    ctaText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
    actions: { flexDirection: 'row', gap: 10 },
    action: { flex: 1, height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
    actionText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textMuted },
    panel: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border },
    panelTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
    empty: { alignItems: 'center', gap: 6, paddingVertical: 14 },
    emptyIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F3F4', alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    emptyText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 17, maxWidth: 260 },
    perk: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    perkIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
    perkTitle: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.text },
    perkText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: 2 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, gap: 6 },
    sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    sheetTitle: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
    sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    sheetIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
    sheetRowTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    sheetRowText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
});

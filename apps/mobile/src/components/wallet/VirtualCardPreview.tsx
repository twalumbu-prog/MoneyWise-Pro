import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock } from 'lucide-react-native';
import { fonts } from '../../theme/tokens';

export type CardTheme = 'red' | 'blue' | 'black';
export const CARD_THEMES: Record<CardTheme, { label: string; colors: [string, string]; swatch: string }> = {
    red: { label: 'Red', colors: ['#D32F2F', '#7F1D1D'], swatch: '#C62828' },
    blue: { label: 'Blue', colors: ['#1A6BE0', '#0842A0'], swatch: '#0B57D0' },
    black: { label: 'Black', colors: ['#2B2F36', '#0B0D10'], swatch: '#1F2937' },
};

/**
 * The virtual card as it will look: a Visa card with the number hidden until the card is activated.
 * Shown on the Virtual Card tab and, with the person's choices applied, through the setup steps.
 */
export function VirtualCardPreview({ theme = 'red', name, currency = 'ZMW', locked = true, number = '•••• •••• •••• ••••' }: { theme?: CardTheme; name?: string; currency?: string; locked?: boolean; number?: string }) {
    const t = CARD_THEMES[theme];
    return (
        <LinearGradient colors={t.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
            <View style={styles.glowA} /><View style={styles.glowB} />
            <View style={styles.top}>
                <Text style={styles.visa}>VISA</Text>
                <View style={styles.badge}>
                    {locked ? <Lock size={11} color="#FFFFFF" /> : null}
                    <Text style={styles.badgeText}>{locked ? 'Not activated' : 'Virtual'}</Text>
                </View>
            </View>
            <View style={styles.chip}><View style={styles.chipLine} /><View style={[styles.chipLine, { top: 17 }]} /></View>
            <View style={styles.bottom}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.label}>CARD NUMBER</Text>
                    <Text style={styles.number}>{number}</Text>
                    {name ? <Text style={styles.holder} numberOfLines={1}>{name.toUpperCase()}</Text> : null}
                </View>
                <View style={styles.meta}><Text style={styles.label}>EXP.</Text><Text style={styles.metaValue}>--/--</Text></View>
                <View style={styles.meta}><Text style={styles.label}>CVV</Text><Text style={styles.metaValue}>•••</Text></View>
                <View style={styles.meta}><Text style={styles.label}>{currency}</Text></View>
            </View>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    card: { borderRadius: 20, padding: 18, height: 200, overflow: 'hidden', justifyContent: 'space-between' },
    glowA: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,255,255,0.07)', right: -90, top: -110 },
    glowB: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.05)', left: -80, bottom: -130 },
    top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    visa: { fontFamily: fonts.bodyBold, fontSize: 20, color: '#FFFFFF', fontStyle: 'italic', letterSpacing: 0.5 },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
    badgeText: { fontFamily: fonts.bodyBold, fontSize: 10.5, color: '#FFFFFF' },
    chip: { width: 38, height: 30, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
    chipLine: { position: 'absolute', left: 0, right: 0, top: 8, height: 1.5, backgroundColor: 'rgba(255,255,255,0.35)' },
    bottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 14 },
    label: { fontFamily: fonts.body, fontSize: 8.5, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.8 },
    number: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF', letterSpacing: 1.5, marginTop: 3 },
    holder: { fontFamily: fonts.bodyMedium, fontSize: 10.5, color: 'rgba(255,255,255,0.85)', marginTop: 5, letterSpacing: 0.6 },
    meta: { alignItems: 'flex-start' },
    metaValue: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#FFFFFF', marginTop: 3 },
});

import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PlusCircle } from 'lucide-react-native';
import { formatKwacha } from 'core';
import { MoneywiseMark } from '../icons/MoneywiseMark';
import { colors, fonts } from '../../theme/tokens';

// Hugs its content exactly: paddingVertical(18)*2 + nameRow(20) + gap(12) +
// balance(38) + gap(12) + footer(16) + gap(8) + dots(6) = 148. Every summand
// is a real, fixed style below (explicit lineHeight on every text row) —
// if any of those change, recompute this by hand; there's no dynamic
// measurement here; AddWalletCard and the loading skeleton must match it.
export const CARD_HEIGHT = 148;
export const CARD_GAP = 16;

/** One carousel card, matching the web's `calc(100vw - 2.5rem)`. */
export function useCardWidth(): number {
    const { width } = useWindowDimensions();
    return width - 40;
}

export interface WalletCardDots {
    count: number;
    active: number;
    onSelect: (index: number) => void;
}

/**
 * The dark wallet card from the mobile web ledger: gradient from slate-900 to
 * blue-950, name + brand mark up top (same line), balance large, organisation
 * along the bottom, and — when there's more than one card — the carousel's
 * page-dot indicator inside the card itself, below the org/brand row (the
 * active dot is white), matching web's CashLedger mobile card exactly.
 */
export const WalletCard: React.FC<{
    name: string;
    balance: number;
    organizationName?: string | null;
    dots?: WalletCardDots;
}> = ({ name, balance, organizationName, dots }) => {
    const width = useCardWidth();
    return (
        <LinearGradient
            colors={['#0F172A', '#172554']}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.card, { width }]}
        >
            <View style={styles.topGroup}>
                <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>{name.toUpperCase()}</Text>
                    <MoneywiseMark color="#FFFFFF" height={20} />
                </View>
                <Text
                    style={styles.balance}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                >
                    {formatKwacha(balance)}
                </Text>
                <View style={styles.footer}>
                    <Text style={styles.org} numberOfLines={1}>
                        {(organizationName || 'MoneyWise').toUpperCase()}
                    </Text>
                    <Text style={styles.brand}>Moneywise</Text>
                </View>
            </View>

            {dots && dots.count > 1 && (
                <View style={styles.dots}>
                    {Array.from({ length: dots.count }).map((_, i) => (
                        <Pressable
                            key={i}
                            onPress={() => dots.onSelect(i)}
                            hitSlop={6}
                            accessibilityLabel={`Go to card ${i + 1}`}
                            style={[styles.dot, i === dots.active && styles.dotActive]}
                        />
                    ))}
                </View>
            )}
        </LinearGradient>
    );
};

/** Trailing "add wallet" affordance — hidden from requestors, as on web. */
export const AddWalletCard: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => {
    const width = useCardWidth();
    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [styles.addCard, { width }, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            <PlusCircle size={28} color={colors.textFaint} strokeWidth={2.5} />
            <Text style={styles.addLabel}>{label.toUpperCase()}</Text>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    card: {
        height: CARD_HEIGHT, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 18,
        // Explicit gap (not space-between) between topGroup and dots — the
        // card's fixed height above is calculated to hug exactly this,
        // padding included, rather than stretching content to fill leftover
        // space.
        gap: 8,
    },
    topGroup: { gap: 12 },
    nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    name: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: '#FFFFFF', letterSpacing: 0.6, lineHeight: 16 },
    balance: { fontFamily: fonts.bodyBold, fontSize: 34, color: '#FFFFFF', letterSpacing: -0.8, lineHeight: 38 },
    footer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    org: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 11, color: '#94A3B8', letterSpacing: 0.6, lineHeight: 14 },
    brand: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#94A3B8', lineHeight: 16 },
    dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
    dotActive: { backgroundColor: '#FFFFFF', transform: [{ scale: 1.15 }] },
    addCard: {
        height: CARD_HEIGHT, borderRadius: 18, borderWidth: 2, borderStyle: 'dashed',
        borderColor: colors.borderStrong, backgroundColor: colors.surface,
        alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    addLabel: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textFaint, letterSpacing: 1.4 },
});

import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PlusCircle } from 'lucide-react-native';
import { formatKwacha } from 'core';
import { colors, fonts } from '../../theme/tokens';

export const CARD_HEIGHT = 176;
export const CARD_GAP = 16;

/** One carousel card, matching the web's `calc(100vw - 2.5rem)`. */
export function useCardWidth(): number {
    const { width } = useWindowDimensions();
    return width - 40;
}

/**
 * The dark wallet card from the mobile web ledger: gradient from slate-900 to
 * blue-950, name up top, balance large, organisation along the bottom.
 */
export const WalletCard: React.FC<{
    name: string;
    balance: number;
    organizationName?: string | null;
}> = ({ name, balance, organizationName }) => {
    const width = useCardWidth();
    return (
        <LinearGradient
            colors={['#0F172A', '#172554']}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.card, { width }]}
        >
            <Text style={styles.name} numberOfLines={1}>{name.toUpperCase()}</Text>
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
        height: CARD_HEIGHT, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 20,
        justifyContent: 'space-between',
    },
    name: { fontFamily: fonts.body, fontSize: 12, color: '#FFFFFF', letterSpacing: 0.6, lineHeight: 16 },
    balance: { fontFamily: fonts.bodyBold, fontSize: 34, color: '#FFFFFF', letterSpacing: -0.8, lineHeight: 38 },
    footer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    org: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 11, color: '#94A3B8', letterSpacing: 0.6 },
    brand: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#94A3B8' },
    addCard: {
        height: CARD_HEIGHT, borderRadius: 18, borderWidth: 2, borderStyle: 'dashed',
        borderColor: colors.borderStrong, backgroundColor: colors.surface,
        alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    addLabel: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textFaint, letterSpacing: 1.4 },
});

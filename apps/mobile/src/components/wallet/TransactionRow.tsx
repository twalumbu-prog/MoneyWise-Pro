import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { formatKwacha, formatShortDate } from 'core';
import type { CashbookEntry } from 'core';
import { colors, fonts } from '../../theme/tokens';

/**
 * A ledger line. Double-entry means every row carries both a debit and a credit
 * column and exactly one is non-zero, so direction is read off which side is
 * populated rather than from a sign — matching how the web ledger renders it.
 */
export const TransactionRow: React.FC<{
    entry: CashbookEntry;
    onPress: () => void;
}> = ({ entry, onPress }) => {
    const isInflow = (entry.debit ?? 0) > 0;
    const amount = isInflow ? entry.debit : entry.credit;

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [styles.root, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${entry.description}, ${isInflow ? 'received' : 'paid'} ${formatKwacha(amount)}`}
        >
            <View style={[styles.icon, isInflow ? styles.iconIn : styles.iconOut]}>
                {isInflow
                    ? <ArrowDownLeft size={16} color={colors.positive} strokeWidth={2} />
                    : <ArrowUpRight size={16} color={colors.textMuted} strokeWidth={2} />}
            </View>

            <View style={styles.main}>
                <Text style={styles.description} numberOfLines={1}>{entry.description}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                    {formatShortDate(entry.date)}
                    {entry.reference_number ? ` · ${entry.reference_number}` : ''}
                </Text>
            </View>

            <View style={styles.right}>
                <Text style={[styles.amount, isInflow && styles.amountIn]}>
                    {isInflow ? '+' : '−'}{formatKwacha(amount).replace('K', 'K')}
                </Text>
                {entry.status === 'PENDING' && <Text style={styles.pending}>Pending</Text>}
            </View>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    root: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
    pressed: { opacity: 0.6 },
    icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    iconIn: { backgroundColor: '#E4FAF1' },
    iconOut: { backgroundColor: colors.canvasAlt },
    main: { flex: 1, gap: 2 },
    description: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    meta: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    right: { alignItems: 'flex-end', gap: 2 },
    amount: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    amountIn: { color: colors.positiveInk },
    pending: { fontFamily: fonts.body, fontSize: 10, color: colors.warn },
});

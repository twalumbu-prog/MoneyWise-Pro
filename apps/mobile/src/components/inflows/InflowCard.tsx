import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Clock, CheckCircle2, Check, AlertCircle, RotateCcw } from 'lucide-react-native';
import { getStatusConfig, formatKwacha } from 'core';
import { ACCOUNT_TYPE_LABEL, inflowTitle, type InflowRow } from './inflowUtils';
import { colors, fonts } from '../../theme/tokens';

const STATUS_ICON = { clock: Clock, 'check-circle': CheckCircle2, check: Check, alert: AlertCircle, rotate: RotateCcw };
const STATUS_ICON_COLOR = { clock: colors.blue, 'check-circle': colors.blue, check: '#059669', alert: colors.danger, rotate: colors.textFaint };

/**
 * Native port of apps/web/src/components/InflowInbox.tsx's row, restyled to
 * match RequisitionRow's typography/rhythm exactly (Inbox > Outflows) so the
 * two tabs read as one consistent list: a bold small-caps identity line up
 * top (source, with the same NEW pill treatment as a requisition's
 * requestor), the description against the amount in the same black/medium
 * weight, then the status glyph line.
 */
export const InflowCard: React.FC<{ row: InflowRow; onPress: () => void }> = ({ row, onPress }) => {
    const status = row.status || 'COMPLETED';
    const source = ACCOUNT_TYPE_LABEL[row.account_type || ''] || 'Inflow';
    const cfg = getStatusConfig(status);
    const StatusIcon = STATUS_ICON[cfg.iconType];
    const isNew = !!row.has_unread_updates;

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [styles.root, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${source}, ${inflowTitle(row.description)}, ${formatKwacha(row.debit || 0)}, ${cfg.label}`}
        >
            <View style={styles.topLine}>
                <Text style={[styles.source, isNew && styles.sourceNew]} numberOfLines={1}>
                    {source}
                </Text>
                {isNew && (
                    <View style={styles.newPill}>
                        <Text style={styles.newPillText}>NEW</Text>
                    </View>
                )}
            </View>

            <View style={styles.midLine}>
                <Text style={styles.title} numberOfLines={2}>{inflowTitle(row.description)}</Text>
                <Text style={styles.amount}>+{formatKwacha(row.debit || 0)}</Text>
            </View>

            <View style={styles.metaLine}>
                <Text style={styles.meta} numberOfLines={1}>{row.reference_number || 'Receipt'}</Text>
                <Text style={styles.date}>{new Date(row.date).toLocaleDateString('en-GB')}</Text>
            </View>

            <View style={styles.statusLine}>
                <StatusIcon size={11} color={STATUS_ICON_COLOR[cfg.iconType]} />
                <Text style={styles.statusLabel}>{cfg.label}</Text>
            </View>
        </Pressable>
    );
};

// Mirrors RequisitionRow.tsx's styles 1:1 (topLine/midLine/statusLine sizes,
// weights and colors) with one added metaLine for the reference/date that
// outflows don't need.
const styles = StyleSheet.create({
    root: { gap: 3 },
    pressed: { opacity: 0.7 },
    topLine: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
    source: { fontFamily: fonts.bodyBold, fontSize: 10, color: '#71717A', flexShrink: 1 },
    sourceNew: { fontFamily: fonts.bodyBold, color: '#3F3F46' },
    newPill: {
        backgroundColor: '#2563EB', borderRadius: 999,
        paddingHorizontal: 6, paddingVertical: 2,
    },
    newPillText: {
        fontFamily: fonts.bodyBold, fontSize: 9, color: '#FFFFFF', letterSpacing: 0.5, lineHeight: 11,
    },
    midLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
    title: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: '#000000', lineHeight: 19 },
    amount: { fontFamily: fonts.bodyMedium, fontSize: 14, color: '#000000' },
    metaLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    meta: { flex: 1, fontFamily: fonts.body, fontSize: 10, color: colors.textFaint, textTransform: 'capitalize' },
    date: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint },
    statusLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
    statusLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint },
});

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Clock, CheckCircle2, Check, AlertCircle, RotateCcw } from 'lucide-react-native';
import { getStatusConfig, formatKwacha } from 'core';
import { ACCOUNT_TYPE_LABEL, inflowTitle, type InflowRow } from './inflowUtils';
import { colors, fonts } from '../../theme/tokens';

const STATUS_ICON = { clock: Clock, 'check-circle': CheckCircle2, check: Check, alert: AlertCircle, rotate: RotateCcw };
const STATUS_ICON_COLOR = { clock: colors.blue, 'check-circle': colors.blue, check: '#059669', alert: colors.danger, rotate: colors.textFaint };

/** Native port of apps/web/src/components/InflowInbox.tsx's row. */
export const InflowCard: React.FC<{ row: InflowRow; onPress: () => void }> = ({ row, onPress }) => {
    const status = row.status || 'COMPLETED';
    const source = ACCOUNT_TYPE_LABEL[row.account_type || ''] || 'Inflow';
    const cfg = getStatusConfig(status);
    const StatusIcon = STATUS_ICON[cfg.iconType];

    return (
        <Pressable onPress={onPress} style={styles.row}>
            <View style={styles.main}>
                <View style={styles.topLine}>
                    <Text style={styles.title} numberOfLines={1}>{inflowTitle(row.description)}</Text>
                    <Text style={styles.amount}>+{formatKwacha(row.debit || 0)}</Text>
                </View>
                <View style={styles.midLine}>
                    <Text style={styles.meta} numberOfLines={1}>{source} · {row.reference_number || 'Receipt'}</Text>
                    <Text style={styles.date}>{new Date(row.date).toLocaleDateString('en-GB')}</Text>
                </View>
                <View style={styles.statusLine}>
                    <StatusIcon size={11} color={STATUS_ICON_COLOR[cfg.iconType]} />
                    <Text style={styles.statusText}>{cfg.label}</Text>
                </View>
            </View>
            {row.has_unread_updates && <View style={styles.unreadDot} />}
        </Pressable>
    );
};

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
    main: { flex: 1, gap: 3 },
    topLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    title: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textMuted },
    amount: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    midLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    meta: { flex: 1, fontFamily: fonts.body, fontSize: 10, color: colors.textFaint, textTransform: 'capitalize' },
    date: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint },
    statusLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
    statusText: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint, textTransform: 'capitalize' },
    unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.blue },
});

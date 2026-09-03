import { View, Text, Pressable, StyleSheet } from 'react-native';
import { formatKwacha, getStatusConfig } from 'core';
import { StatusIcon } from '../StatusIcon';
import { colors, fonts } from '../../theme/tokens';

export interface RequisitionRowData {
    id: string;
    description: string;
    estimated_total: number;
    actual_total?: number;
    status: string;
    created_at: string;
    requestor_name?: string;
    has_unread_updates?: boolean;
}

/**
 * One requisition inside a day card. Layout mirrors the web mobile row:
 * requestor line (with the NEW pill), then description against the amount,
 * then the status glyph and label.
 */
export const RequisitionRow: React.FC<{
    req: RequisitionRowData;
    onPress: () => void;
}> = ({ req, onPress }) => {
    const status = getStatusConfig(req.status);
    const isNew = !!req.has_unread_updates;

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [styles.root, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${req.description}, ${formatKwacha(req.estimated_total)}, ${status.label}`}
        >
            <View style={styles.topLine}>
                <Text style={[styles.requestor, isNew && styles.requestorNew]} numberOfLines={1}>
                    {req.requestor_name || 'System User'}
                </Text>
                {isNew && (
                    <View style={styles.newPill}>
                        <Text style={styles.newPillText}>NEW</Text>
                    </View>
                )}
            </View>

            <View style={styles.midLine}>
                <Text style={styles.description} numberOfLines={2}>
                    {req.description}
                </Text>
                <Text style={styles.amount}>{formatKwacha(req.estimated_total)}</Text>
            </View>

            <View style={styles.statusLine}>
                <StatusIcon status={req.status} />
                <Text style={styles.statusLabel}>{status.label}</Text>
            </View>
        </Pressable>
    );
};

// Font sizes/spacing mirror InflowCard's list-item scale (Inbox > Inflows) —
// colors and font weights (fontFamily) below are unchanged from before.
const styles = StyleSheet.create({
    root: { gap: 3 },
    pressed: { opacity: 0.7 },
    topLine: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
    requestor: { fontFamily: fonts.bodyBold, fontSize: 10, color: '#71717A', flexShrink: 1 },
    requestorNew: { fontFamily: fonts.bodyBold, color: '#3F3F46' },
    newPill: {
        backgroundColor: '#2563EB', borderRadius: 999,
        paddingHorizontal: 6, paddingVertical: 2,
    },
    newPillText: {
        fontFamily: fonts.bodyBold, fontSize: 9, color: '#FFFFFF', letterSpacing: 0.5, lineHeight: 11,
    },
    midLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
    description: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: '#000000', lineHeight: 19 },
    amount: { fontFamily: fonts.bodyMedium, fontSize: 14, color: '#000000' },
    statusLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
    statusLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint },
});

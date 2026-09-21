import { View, Text, StyleSheet } from 'react-native';
import { CheckCircle2, AlertCircle, Clock, FileCheck, ShieldCheck } from 'lucide-react-native';
import { colors, fonts, radius } from '../../theme/tokens';

/** Native port of apps/web/src/components/AuditScoreBreakdown.tsx — pure computation, no service calls. */
export const AuditScoreBreakdown: React.FC<{
    score?: number;
    breakdown?: { timing: number; compliance: number; accuracy: number };
    accountedAt?: string;
    createdAt: string;
    status: string;
}> = ({ score: savedScore, breakdown: savedBreakdown, accountedAt, createdAt, status }) => {
    const isFinalized = status === 'ACCOUNTED';

    const draftDate = new Date(createdAt);
    const endDate = accountedAt ? new Date(accountedAt) : new Date();
    const diffHours = (endDate.getTime() - draftDate.getTime()) / (1000 * 60 * 60);

    let liveTimingScore = 0;
    if (diffHours < 24) liveTimingScore = 100;
    else if (diffHours < 48) liveTimingScore = 50;

    const timingScore = isFinalized ? (savedBreakdown?.timing ?? liveTimingScore) : liveTimingScore;
    const complianceScore = savedBreakdown?.compliance ?? 0;
    const accuracyScore = isFinalized ? (savedBreakdown?.accuracy ?? 100) : 100;

    const displayScore = isFinalized
        ? (savedScore ?? (timingScore + complianceScore + accuracyScore) / 3)
        : (timingScore + complianceScore + accuracyScore) / 3;

    const getRating = (s: number, type?: 'TIMING' | 'COMPLIANCE' | 'ACCURACY') => {
        if (!isFinalized) {
            if (type === 'COMPLIANCE' && status !== 'CHANGE_SUBMITTED' && status !== 'EXPENSED') {
                return { label: 'Upcoming', color: colors.textFaint, bg: colors.canvasAlt, Icon: Clock };
            }
            if (type === 'ACCURACY' && status !== 'ACCOUNTED') {
                return { label: 'Pending', color: colors.textFaint, bg: colors.canvasAlt, Icon: Clock };
            }
        }
        if (s >= 85) return { label: 'Brilliant', color: '#059669', bg: '#ECFDF5', Icon: CheckCircle2 };
        if (s >= 50) return { label: 'Average', color: '#B45309', bg: '#FFFBEB', Icon: AlertCircle };
        return { label: 'Bad', color: colors.danger, bg: '#FEF2F2', Icon: AlertCircle };
    };

    const overall = getRating(displayScore);

    const items = [
        {
            label: 'Time Efficiency', score: timingScore, description: 'Draft to Accounted timing.', Icon: Clock, type: 'TIMING' as const,
            details: isFinalized ? `Finalized in ${Math.round(diffHours)} hours` : `Active for ${Math.round(diffHours)} hours…`,
        },
        {
            label: 'Documentation Compliance', score: complianceScore, description: 'Receipt upload and OCR validation.', Icon: FileCheck, type: 'COMPLIANCE' as const,
            details: isFinalized
                ? (complianceScore === 100 ? 'All receipts matched' : 'Documentation gaps found')
                : (['EXPENSED', 'CHANGE_SUBMITTED'].includes(status) ? 'Analyzing receipts…' : 'Waiting for expense stage'),
        },
        {
            label: 'Financial Accuracy', score: accuracyScore, description: 'Zero discrepancy in reconciliation.', Icon: ShieldCheck, type: 'ACCURACY' as const,
            details: isFinalized ? (accuracyScore === 100 ? 'No discrepancies found' : 'Discrepancy detected') : 'Pending finalization',
        },
    ];

    return (
        <View style={styles.root}>
            <View style={[styles.headerCard, { backgroundColor: overall.bg }]}>
                <View style={styles.headerLeft}>
                    <View style={styles.headerIconWrap}><overall.Icon size={26} color={overall.color} /></View>
                    <View>
                        <View style={styles.headerLabelRow}>
                            <Text style={[styles.headerLabel, { color: overall.color }]}>{overall.label}</Text>
                            {!isFinalized && (
                                <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>Live</Text></View>
                            )}
                        </View>
                        <Text style={styles.headerSub}>Overall Audit Performance</Text>
                    </View>
                </View>
                <Text style={styles.headerScore}>{Math.round(displayScore)}%</Text>
            </View>

            {items.map((item) => {
                const rating = getRating(item.score, item.type);
                return (
                    <View key={item.label} style={styles.card}>
                        <View style={styles.cardTop}>
                            <View style={[styles.cardIconWrap, { backgroundColor: rating.bg }]}>
                                <item.Icon size={18} color={rating.color} />
                            </View>
                            <View style={[styles.cardBadge, { backgroundColor: rating.bg }]}>
                                <Text style={[styles.cardBadgeText, { color: rating.color }]}>{rating.label}</Text>
                            </View>
                        </View>
                        <Text style={styles.cardLabel}>{item.label}</Text>
                        <Text style={styles.cardDesc}>{item.description}</Text>
                        <View style={styles.cardStatus}>
                            <Text style={styles.cardStatusLabel}>STATUS</Text>
                            <Text style={styles.cardStatusValue} numberOfLines={1}>{item.details}</Text>
                        </View>
                    </View>
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    root: { gap: 12 },
    headerCard: { borderRadius: radius.lg, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
    headerIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    headerLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerLabel: { fontFamily: fonts.bodyBold, fontSize: 17 },
    liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.tabActiveBg, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
    liveDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.blue },
    liveText: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.blue, textTransform: 'uppercase' },
    headerSub: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted, marginTop: 2 },
    headerScore: { fontFamily: fonts.bodyBold, fontSize: 32, color: colors.text },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    cardIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    cardBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
    cardBadgeText: { fontFamily: fonts.bodyBold, fontSize: 10 },
    cardLabel: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    cardDesc: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 2 },
    cardStatus: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
    cardStatusLabel: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textFaint, letterSpacing: 0.5 },
    cardStatusValue: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textMuted, marginTop: 2 },
});

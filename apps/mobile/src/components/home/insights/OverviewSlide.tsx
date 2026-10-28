import { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { reportService, formatKwacha } from 'core';
import { useAuth } from '../../../context/AuthContext';
import { extractEmojiAndName } from '../../../utils/emoji';
import { AccountGlyph } from '../../AccountGlyph';
import { colors, fonts } from '../../../theme/tokens';
import { slideStyles } from './shared';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** This calendar month, so "this period" always means the month in progress. */
function thisMonth() {
    const now = new Date();
    return {
        start: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
        end: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
        label: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
}

/** Slide 1 — Financial Overview: the three biggest expense accounts this month, one compact line each. */
export const OverviewSlide: React.FC = () => {
    const { organizationId } = useAuth();
    const period = useMemo(thisMonth, []);

    const { data, isLoading, isError } = useQuery({
        queryKey: ['home-overview', organizationId, period.start],
        queryFn: () => reportService.getExpenditures(period.start, period.end, 'EXPENSE'),
        enabled: !!organizationId,
    });

    const { top, total } = useMemo(() => {
        const expenses = (data ?? []).filter((r) => r.type === 'EXPENSE' && Number(r.total_amount) > 0)
            .sort((a, b) => Number(b.total_amount) - Number(a.total_amount));
        return { top: expenses.slice(0, 3), total: expenses.reduce((s, r) => s + Number(r.total_amount), 0) };
    }, [data]);

    if (isLoading) return <View style={slideStyles.centre}><ActivityIndicator color={colors.blue} /></View>;
    if (isError) return <View style={slideStyles.centre}><Text style={slideStyles.empty}>Couldn’t load your spending. Pull to refresh on Reporting.</Text></View>;
    if (total <= 0) return <View style={slideStyles.centre}><Text style={slideStyles.empty}>No spending recorded in {period.label} yet.</Text></View>;

    return (
        <View style={styles.list}>
            {top.map((row) => (
                <View key={row.account_id} style={styles.row}>
                    <View style={styles.glyph}><AccountGlyph name={row.account_name} type="EXPENSE" logoUrl={row.logo_url} size={15} /></View>
                    <Text style={styles.name} numberOfLines={1}>{extractEmojiAndName(row.account_name).cleanName}</Text>
                    <Text style={styles.amount} numberOfLines={1}>{formatKwacha(Number(row.total_amount))}</Text>
                </View>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    list: { gap: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    glyph: { width: 24, alignItems: 'center', justifyContent: 'center' },
    name: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: '#000000' },
    amount: { fontFamily: fonts.bodyMedium, fontSize: 14, color: '#000000' },
});

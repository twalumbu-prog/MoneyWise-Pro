import { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2 } from 'lucide-react-native';
import { requisitionService, cashbookService, formatKwacha } from 'core';
import { useAuth } from '../../../context/AuthContext';
import { inflowTitle, type InflowRow } from '../../inflows/inflowUtils';
import { colors, fonts } from '../../../theme/tokens';
import { slideStyles } from './shared';

interface Item { id: string; kind: 'in' | 'out'; title: string; amount: number; at: string }

/**
 * Slide 2 — Updates: what's new in the Inbox. The same "NEW" flag the Inbox rows use: money that came in (inflows) and
 * requests / payments made (outflows) with updates the person hasn't opened yet. "See more" opens the Inbox.
 */
export const UpdatesSlide: React.FC = () => {
    const { organizationId } = useAuth();

    // Same key as the Inbox's Outflows list, so the two share one fetch.
    const out = useQuery({ queryKey: ['requisitions', organizationId], queryFn: () => requisitionService.getAll(), enabled: !!organizationId });
    const inn = useQuery({
        queryKey: ['home-inflows', organizationId],
        queryFn: async (): Promise<InflowRow[]> => (await cashbookService.getEntries({ entryType: 'INFLOW', limit: 50 })) || [],
        enabled: !!organizationId,
    });

    const { items, ins, outs } = useMemo(() => {
        const requisitions: any[] = Array.isArray(out.data) ? out.data : [];
        const inflows: InflowRow[] = Array.isArray(inn.data) ? inn.data : [];
        const all: Item[] = [
            ...inflows.filter((r) => r.has_unread_updates).map((r): Item => ({ id: `in-${r.id}`, kind: 'in', title: inflowTitle(r.description), amount: Number(r.debit) || 0, at: r.created_at || r.date })),
            ...requisitions.filter((r) => r.has_unread_updates).map((r): Item => ({ id: `out-${r.id}`, kind: 'out', title: r.description || 'Payment', amount: Number(r.estimated_total) || 0, at: r.created_at || r.updated_at || '' })),
        ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
        return { items: all, ins: all.filter((i) => i.kind === 'in').length, outs: all.filter((i) => i.kind === 'out').length };
    }, [out.data, inn.data]);

    if (out.isLoading || inn.isLoading) return <View style={slideStyles.centre}><ActivityIndicator color={colors.blue} /></View>;
    if (out.isError && inn.isError) return <View style={slideStyles.centre}><Text style={slideStyles.empty}>Couldn’t load your updates.</Text></View>;

    if (items.length === 0) {
        return (
            <View style={slideStyles.centre}>
                <CheckCircle2 size={26} color={colors.positiveInk} />
                <Text style={slideStyles.emptyTitle}>You’re all caught up</Text>
                <Text style={slideStyles.empty}>New money in and payments out will show up here.</Text>
            </View>
        );
    }

    const summary = [ins > 0 ? `${ins} new inflow${ins === 1 ? '' : 's'}` : null, outs > 0 ? `${outs} new outflow${outs === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ');
    return (
        <View style={{ gap: 10 }}>
            <Text style={styles.summary}>{summary}</Text>
            {items.slice(0, 3).map((i) => (
                <View key={i.id} style={styles.row}>
                    <View style={[styles.icon, i.kind === 'in' ? styles.iconIn : styles.iconOut]}>
                        {i.kind === 'in' ? <ArrowDownLeft size={14} color={colors.positiveInk} /> : <ArrowUpRight size={14} color={colors.blue} />}
                    </View>
                    <Text style={styles.title} numberOfLines={1}>{i.title}</Text>
                    <Text style={[styles.amount, i.kind === 'in' && { color: colors.positiveInk }]} numberOfLines={1}>{i.kind === 'in' ? '+' : ''}{formatKwacha(i.amount)}</Text>
                </View>
            ))}
            {items.length > 3 && <Text style={styles.more}>+{items.length - 3} more</Text>}
        </View>
    );
};

const styles = StyleSheet.create({
    summary: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.blue },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    icon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    iconIn: { backgroundColor: '#E6F8F0' },
    iconOut: { backgroundColor: colors.tabActiveBg },
    title: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: '#000000' },
    amount: { fontFamily: fonts.bodyMedium, fontSize: 14, color: '#000000' },
    more: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
});

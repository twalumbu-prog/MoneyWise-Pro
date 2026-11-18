import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiJson, formatKwacha } from 'core';
import { Screen, Card, Pill, Chip, Btn, Loading, Empty, ErrorNote } from '../../../src/components/marketplace/ui';
import type { RfqRow } from '../../../src/lib/marketplace';
import { RFQ_STATUS, qtyText, daysLeft, shortDay } from '../../../src/lib/marketplace';
import { colors, fonts } from '../../../src/theme/tokens';

/** Requests for quote: the ones you asked for, and the board of open requests you can quote on. */
export default function RequestsHome() {
    const router = useRouter();
    const [tab, setTab] = useState<'mine' | 'board'>('mine');
    const mine = useQuery({ queryKey: ['rfq', 'mine'], queryFn: () => apiJson<{ requests: RfqRow[]; needsMigration?: boolean }>('/marketplace/rfq'), retry: false });
    const board = useQuery({ queryKey: ['rfq', 'board'], queryFn: () => apiJson<{ requests: RfqRow[] }>('/marketplace/rfq/board'), retry: false });
    const q = tab === 'mine' ? mine : board;
    const rows = q.data?.requests ?? [];

    return (
        <Screen title="Requests for quote" onRefresh={() => { void mine.refetch(); void board.refetch(); }} refreshing={q.isRefetching}>
            <Btn label="Ask for a quote" onPress={() => router.push('/marketplace/requests/new' as any)} />
            <View style={styles.tabs}>
                <Chip label="My requests" on={tab === 'mine'} onPress={() => setTab('mine')} />
                <Chip label="Open board" on={tab === 'board'} onPress={() => setTab('board')} />
            </View>

            {q.isPending ? <Loading /> : q.isError ? <ErrorNote text={(q.error as any)?.message || 'Couldn’t load the requests.'} onRetry={() => q.refetch()} />
                : (q.data as any)?.needsMigration ? <Empty text="Requests for quote aren’t switched on yet." />
                : rows.length === 0 ? <Empty text={tab === 'mine' ? 'You haven’t asked for a quote yet. Tell suppliers what you need and let them compete.' : 'No open requests right now.'} />
                : rows.map((r) => {
                    const st = RFQ_STATUS[r.status];
                    return (
                        <Card key={r.id} onPress={() => router.push(`/marketplace/requests/${r.id}` as any)}>
                            <View style={styles.top}>
                                <Text style={styles.title} numberOfLines={2}>{r.title}</Text>
                                {st ? <Pill label={st.label} bg={st.bg} fg={st.fg} /> : null}
                            </View>
                            <Text style={styles.sub}>{qtyText(r.quantity)} {r.unit}{r.delivery_town ? ` · ${r.delivery_town}` : ''}{r.needed_by ? ` · needed by ${shortDay(r.needed_by)}` : ''}</Text>
                            <Text style={styles.sub}>
                                {tab === 'mine'
                                    ? `${r.quoteCount ?? 0} quote${(r.quoteCount ?? 0) === 1 ? '' : 's'}${r.bestTotal ? ` · best ${formatKwacha(r.bestTotal)}` : ''}`
                                    : r.myQuote ? `Your quote: ${formatKwacha(r.myQuote.total)}` : r.status === 'OPEN' ? `${daysLeft(r.expires_at)} days left to quote` : ''}
                            </Text>
                        </Card>
                    );
                })}
        </Screen>
    );
}

const styles = StyleSheet.create({
    tabs: { flexDirection: 'row', gap: 8 },
    top: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' },
    title: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    sub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
});

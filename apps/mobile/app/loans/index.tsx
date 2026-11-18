import { useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Landmark, Clock } from 'lucide-react-native';
import { apiJson, formatKwacha } from 'core';
import { Screen, Card, Pill, Chip, Btn, Loading, Empty, ErrorNote } from '../../src/components/marketplace/ui';
import type { Lender, LendersResponse, LoanApplication } from '../../src/lib/loans';
import { LOAN_STATUS, loanRange } from '../../src/lib/loans';
import { colors, fonts, radius } from '../../src/theme/tokens';

function LenderMark({ lender, size = 46 }: { lender: Lender; size?: number }) {
    return lender.logo_url
        ? <Image source={{ uri: lender.logo_url }} style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: '#fff' }} resizeMode="contain" />
        : <View style={[s.mark, { width: size, height: size, borderRadius: size / 2 }]}><Text style={s.markText}>{lender.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}</Text></View>;
}

/** Loans from lenders on MoneyWise: see what is offered, apply with your consent, and follow the application. */
export default function LoansHome() {
    const router = useRouter();
    const qc = useQueryClient();
    const [tab, setTab] = useState<'offers' | 'mine'>('offers');
    const [open, setOpen] = useState<string | null>(null);

    const lenders = useQuery({ queryKey: ['loans', 'lenders'], queryFn: () => apiJson<LendersResponse>('/loans'), staleTime: 60_000 });
    const mine = useQuery({ queryKey: ['loans', 'applications'], queryFn: () => apiJson<{ applications: LoanApplication[] }>('/loans/applications'), staleTime: 15_000 });
    const apps = mine.data?.applications ?? [];

    const withdraw = (id: string) => Alert.alert('Withdraw this application?', 'The lender will be told you no longer want it.', [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Withdraw', style: 'destructive', onPress: async () => { try { await apiJson(`/loans/applications/${id}/withdraw`, { method: 'POST' }); void qc.invalidateQueries({ queryKey: ['loans', 'applications'] }); } catch (e: any) { Alert.alert('Could not withdraw', e?.message ?? 'Please try again.'); } } },
    ]);

    return (
        <Screen title="Loans" onRefresh={() => { void lenders.refetch(); void mine.refetch(); }} refreshing={lenders.isRefetching || mine.isRefetching}>
            <Text style={s.lead}>Finance from lenders on MoneyWise, applied for in minutes.</Text>
            <View style={s.tabs}>
                <Chip label="Loans on offer" on={tab === 'offers'} onPress={() => setTab('offers')} />
                <Chip label={`My applications${apps.length ? ` (${apps.length})` : ''}`} on={tab === 'mine'} onPress={() => setTab('mine')} />
            </View>

            {tab === 'offers' ? (
                lenders.isPending ? <Loading /> : lenders.isError ? <ErrorNote text="Couldn’t load the lenders." onRetry={() => lenders.refetch()} />
                : lenders.data!.lenders.length === 0 ? <Empty text="No lenders are on MoneyWise yet." />
                : lenders.data!.lenders.map((l) => {
                    const isOpen = open === l.id;
                    return (
                        <Card key={l.id} style={{ padding: 0, overflow: 'hidden' }}>
                            <Pressable style={s.lenderHead} onPress={() => setOpen(isOpen ? null : l.id)} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}>
                                <LenderMark lender={l} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[s.lenderName, { color: l.brand?.primary ?? colors.text }]} numberOfLines={1}>{l.name}</Text>
                                    <Text style={s.sub} numberOfLines={1}>{l.products.length} {l.products.length === 1 ? 'loan' : 'loans'}: {[...new Set(l.products.map((p) => p.name))].slice(0, 3).join(', ')}{l.products.length > 3 ? '…' : ''}</Text>
                                </View>
                                <View style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}><ChevronDown size={20} color={colors.textMuted} /></View>
                            </Pressable>
                            {isOpen ? (
                                <View style={[s.lenderBody, { borderTopColor: l.brand?.primary ?? colors.blue }]}>
                                    {l.description ? <Text style={s.body}>{l.description}</Text> : null}
                                    {l.products.map((p) => (
                                        <View key={p.id} style={s.product}>
                                            <Text style={s.prodName}>{p.name}</Text>
                                            {p.description ? <Text style={s.sub}>{p.description}</Text> : null}
                                            {(p.features ?? []).length ? <View style={s.feat}>{p.features!.map((f) => <View key={f} style={s.featPill}><Text style={s.featText}>{f}</Text></View>)}</View> : null}
                                            <Text style={s.range}>{loanRange(p) || `Amount, rate and period are set by ${l.name}`}{p.indicative_rate != null ? ` · about ${p.indicative_rate}% a month` : ''}</Text>
                                            {p.requirements.length ? (
                                                <View style={{ gap: 2 }}>
                                                    <Text style={s.reqTitle}>{l.name} asks for</Text>
                                                    {p.requirements.map((r) => <Text key={r} style={s.req}>• {r}</Text>)}
                                                </View>
                                            ) : null}
                                            {p.audience === 'STAFF'
                                                ? <Btn label="Through your employer" kind="tonal" disabled onPress={() => undefined} />
                                                : <Btn label="Apply" onPress={() => router.push(`/loans/apply?productId=${p.id}` as any)} />}
                                        </View>
                                    ))}
                                </View>
                            ) : null}
                        </Card>
                    );
                })
            ) : mine.isPending ? <Loading /> : apps.length === 0 ? (
                <View style={s.emptyBox}>
                    <Clock size={30} color={colors.textFaint} />
                    <Text style={s.emptyTitle}>No applications yet</Text>
                    <Text style={s.sub}>When you apply for a loan you’ll follow it here.</Text>
                    <Btn label="See loans on offer" kind="tonal" onPress={() => setTab('offers')} />
                </View>
            ) : apps.map((a) => {
                const st = LOAN_STATUS[a.status] ?? { label: a.status, bg: '#F1F3F4', fg: '#5F6368' };
                return (
                    <Card key={a.id}>
                        <View style={s.appTop}>
                            <View style={{ flex: 1 }}>
                                <Text style={s.prodName}>{a.product_name}</Text>
                                <Text style={s.sub}>{a.lender_name} · {formatKwacha(a.amount)}{a.term_months ? ` over ${a.term_months} ${a.term_months === 1 ? 'month' : 'months'} (your preference)` : ''}</Text>
                            </View>
                            <Pill label={st.label} bg={st.bg} fg={st.fg} />
                        </View>
                        {a.purpose ? <Text style={s.sub}>For: {a.purpose}</Text> : null}
                        {a.decision_note ? <Text style={s.note}>{a.decision_note}</Text> : null}
                        <View style={s.timeline}>
                            {[...a.events].reverse().map((e, i) => (
                                <Text key={i} style={s.event}><Text style={{ color: colors.textFaint }}>{new Date(e.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} </Text>{e.note || e.status}</Text>
                            ))}
                        </View>
                        {['SUBMITTED', 'IN_REVIEW'].includes(a.status) ? <Pressable onPress={() => withdraw(a.id)}><Text style={s.withdraw}>Withdraw application</Text></Pressable> : null}
                    </Card>
                );
            })}

            {tab === 'offers' && lenders.data && lenders.data.lenders.length > 0 ? (
                <View style={s.mfi}><Landmark size={18} color={colors.blue} /><Text style={s.mfiText}>Are you a lender? You can list your loans on MoneyWise from the web app.</Text></View>
            ) : null}
        </Screen>
    );
}

const s = StyleSheet.create({
    lead: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
    tabs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    mark: { backgroundColor: '#E8F0FE', alignItems: 'center', justifyContent: 'center' },
    markText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.blue },
    lenderHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    lenderName: { fontFamily: fonts.bodyBold, fontSize: 15 },
    sub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17 },
    body: { fontFamily: fonts.body, fontSize: 13, color: colors.text, lineHeight: 19 },
    lenderBody: { borderTopWidth: 3, padding: 14, gap: 12 },
    product: { backgroundColor: '#F8FAFD', borderRadius: radius.lg, padding: 14, gap: 8 },
    prodName: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    feat: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    featPill: { backgroundColor: '#FFFFFF', borderRadius: 999, borderWidth: 1, borderColor: '#DADCE0', paddingHorizontal: 9, paddingVertical: 3 },
    featText: { fontFamily: fonts.body, fontSize: 11, color: '#3C4043' },
    range: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#3C4043' },
    reqTitle: { fontFamily: fonts.bodyBold, fontSize: 11, color: '#3C4043' },
    req: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textMuted, lineHeight: 16 },
    emptyBox: { alignItems: 'center', gap: 8, paddingVertical: 40 },
    emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    appTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    note: { fontFamily: fonts.body, fontSize: 12, color: '#3C4043', backgroundColor: '#F8FAFD', borderRadius: 10, padding: 10, lineHeight: 17 },
    timeline: { borderLeftWidth: 2, borderLeftColor: '#E3E5E8', paddingLeft: 10, gap: 4, marginTop: 4 },
    event: { fontFamily: fonts.body, fontSize: 11.5, color: colors.text, lineHeight: 16 },
    withdraw: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#B31412', marginTop: 4 },
    mfi: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#EAF1FF', borderRadius: radius.md, padding: 12 },
    mfiText: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.blue, lineHeight: 17 },
});

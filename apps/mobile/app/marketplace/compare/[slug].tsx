import { useMemo, useState } from 'react';
import { View, Text, ScrollView, Modal, StyleSheet, Linking, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Phone, MapPin, Truck } from 'lucide-react-native';
import { apiJson, formatKwacha } from 'core';
import { WEB_ORIGIN } from '../../../src/platform/constants';
import { Screen, Card, Pill, Chip, Btn, Field, Loading, ErrorNote, Notice } from '../../../src/components/marketplace/ui';
import type { CompareResult, Offer } from '../../../src/lib/marketplace';
import { ageText, unitText } from '../../../src/lib/marketplace';
import { colors, fonts, radius } from '../../../src/theme/tokens';

const FRESH_COLOR: Record<Offer['freshness'], { bg: string; fg: string }> = {
    LIVE: { bg: '#E6F4EA', fg: '#137333' }, FRESH: { bg: '#E8F0FE', fg: '#1967D2' }, AGING: { bg: '#FEF7E0', fg: '#B06000' }, STALE: { bg: '#F1F3F4', fg: '#5F6368' },
};
const today = () => new Date().toISOString().slice(0, 10);

export default function CompareItem() {
    const { slug } = useLocalSearchParams<{ slug: string }>();
    const router = useRouter();
    const [town, setTown] = useState('');
    const [reporting, setReporting] = useState(false);

    const { data, isPending, isError, error, refetch, isRefetching } = useQuery({
        queryKey: ['compare', 'offers', slug], queryFn: () => apiJson<CompareResult>(`/marketplace/compare/${encodeURIComponent(String(slug))}`), staleTime: 30_000, retry: false,
    });
    const offers = useMemo(() => (data?.offers ?? []).filter((o) => !town || o.town === town), [data, town]);

    if (isPending) return <Screen title="Compare"><Loading /></Screen>;
    if (isError || !data) return <Screen title="Compare"><ErrorNote text={(error as any)?.message || 'Couldn’t load the prices.'} onRetry={() => refetch()} /></Screen>;
    const { item, stats } = data;
    const unit = unitText(item);

    return (
        <Screen title={item.name} onRefresh={() => refetch()} refreshing={isRefetching}>
            <Text style={styles.sub}>{item.category} · per {unit}</Text>

            <View style={styles.stats}>
                <Stat label="LOWEST" value={stats.lowest != null ? formatKwacha(stats.lowest) : '—'} />
                <Stat label="TYPICAL" value={stats.typical != null ? formatKwacha(stats.typical) : '—'} />
                <Stat label="HIGHEST" value={stats.highest != null ? formatKwacha(stats.highest) : '—'} />
            </View>
            {data.note ? <Notice tone="warn" text={data.note} /> : null}

            <View style={styles.actions}>
                <View style={{ flex: 1 }}><Btn label="Report a price" kind="tonal" onPress={() => setReporting(true)} /></View>
                <View style={{ flex: 1 }}><Btn label="Ask for quotes" onPress={() => router.push(`/marketplace/requests/new?item=${item.slug}` as any)} /></View>
            </View>

            {data.towns.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    <Chip label="All towns" on={!town} onPress={() => setTown('')} />
                    {data.towns.map((t) => <Chip key={t} label={t} on={town === t} onPress={() => setTown(town === t ? '' : t)} />)}
                </ScrollView>
            ) : null}

            {offers.length === 0 ? (
                <Text style={styles.empty}>No prices here yet. If you have seen one, report it and help others.</Text>
            ) : offers.map((o) => {
                const f = FRESH_COLOR[o.freshness];
                return (
                    <Card key={`${o.kind}-${o.id}`} style={o.cheapest ? { borderColor: '#137333' } : undefined}>
                        <View style={styles.rowTop}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.place}>{o.place}</Text>
                                <View style={styles.meta}><MapPin size={12} color={colors.textFaint} /><Text style={styles.metaText}>{[o.town, o.province].filter(Boolean).join(', ') || 'Location not given'}</Text></View>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={styles.price}>{formatKwacha(o.price)}</Text>
                                <Text style={styles.metaText}>per {unit}</Text>
                            </View>
                        </View>
                        <View style={styles.pills}>
                            {o.cheapest ? <Pill label="Cheapest" bg="#E6F4EA" fg="#137333" /> : null}
                            <Pill label={ageText(o)} bg={f.bg} fg={f.fg} />
                            {o.trust === 'VERIFIED' ? <Pill label={`Confirmed${o.confirmations && o.confirmations > 1 ? ` by ${o.confirmations}` : ''}`} /> : null}
                            {o.outOfStock ? <Pill label="Out of stock" bg="#FCE8E6" fg="#B31412" /> : null}
                        </View>
                        {o.delivers ? <View style={styles.meta}><Truck size={12} color={colors.textFaint} /><Text style={styles.metaText}>{o.deliveryNote || 'Delivers'}</Text></View> : null}
                        {o.minQty ? <Text style={styles.metaText}>Minimum order: {o.minQty}</Text> : null}
                        <View style={styles.actions}>
                            {o.phone ? <Pressable style={styles.call} onPress={() => Linking.openURL(`tel:${o.phone}`)}><Phone size={14} color={colors.blue} /><Text style={styles.callText}>Call</Text></Pressable> : null}
                            {o.kind === 'LISTING' && o.productId ? <Pressable style={styles.call} onPress={() => Linking.openURL(`${WEB_ORIGIN}/marketplace/${o.productId}`)}><Text style={styles.callText}>View listing</Text></Pressable> : null}
                        </View>
                    </Card>
                );
            })}

            <ReportPrice visible={reporting} onClose={() => setReporting(false)} itemId={item.id} itemName={item.name} unit={unit} onDone={() => { void refetch(); }} />
        </Screen>
    );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>
);

/** Report a price you saw at a shop or depot. Two shoppers reporting the same price confirm it. */
function ReportPrice({ visible, onClose, itemId, itemName, unit, onDone }: { visible: boolean; onClose: () => void; itemId: string; itemName: string; unit: string; onDone: () => void }) {
    const [place, setPlace] = useState(''); const [town, setTown] = useState(''); const [price, setPrice] = useState(''); const [seen, setSeen] = useState(today());
    const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null);
    const places = useQuery({ queryKey: ['price-report-places', itemId], enabled: visible, queryFn: () => apiJson<{ places: { placeName: string; town: string | null }[] }>(`/marketplace/price-reports/places?item=${itemId}`), staleTime: 300_000, retry: false });

    const ready = place.trim() && town.trim() && Number(price) > 0;
    const send = async () => {
        setBusy(true); setErr(null);
        try {
            const r = await apiJson<{ message: string }>('/marketplace/price-reports', { method: 'POST', body: JSON.stringify({ catalogItemId: itemId, placeName: place.trim(), town: town.trim(), price: Number(price), observedOn: seen }) });
            setMessage(r.message || 'Thank you. Your price was added.'); onDone();
        } catch (e: any) { setErr(e?.message || 'Couldn’t send your report.'); } finally { setBusy(false); }
    };
    const close = () => { setMessage(null); setErr(null); setPlace(''); setTown(''); setPrice(''); onClose(); };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={close}>
            <View style={styles.modal}>
                <Text style={styles.modalTitle}>Report a price</Text>
                <Text style={styles.sub}>{itemName} · per {unit}</Text>
                <ScrollView contentContainerStyle={{ gap: 12, paddingVertical: 14 }} keyboardShouldPersistTaps="handled">
                    {message ? <Notice tone="ok" text={message} /> : (
                        <>
                            {err ? <Notice tone="error" text={err} /> : null}
                            <Field label="Shop or depot" value={place} onChangeText={setPlace} placeholder="e.g. Shoprite Manda Hill" />
                            {(places.data?.places ?? []).length ? (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                    {places.data!.places.slice(0, 12).map((p) => <Chip key={`${p.placeName}-${p.town}`} label={p.placeName} onPress={() => { setPlace(p.placeName); if (p.town) setTown(p.town); }} />)}
                                </ScrollView>
                            ) : null}
                            <Field label="Town" value={town} onChangeText={setTown} placeholder="e.g. Lusaka" />
                            <Field label={`Price per ${unit} (K)`} value={price} onChangeText={(v) => setPrice(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0.00" />
                            <Field label="Date you saw it" value={seen} onChangeText={setSeen} placeholder="YYYY-MM-DD" hint="Prices up to two weeks old are accepted." />
                        </>
                    )}
                </ScrollView>
                {message ? <Btn label="Done" onPress={close} /> : (
                    <View style={styles.actions}>
                        <View style={{ flex: 1 }}><Btn label="Cancel" kind="tonal" onPress={close} /></View>
                        <View style={{ flex: 1 }}><Btn label="Send" onPress={send} busy={busy} disabled={!ready} /></View>
                    </View>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    sub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
    stats: { flexDirection: 'row', gap: 8 },
    stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: 10, borderWidth: 1, borderColor: colors.border },
    statLabel: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textMuted, letterSpacing: 0.5 },
    statValue: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text, marginTop: 4 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
    empty: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: 30, lineHeight: 19 },
    rowTop: { flexDirection: 'row', gap: 10 },
    place: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
    metaText: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
    price: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
    pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    call: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EAF1FF', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
    callText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.blue },
    modal: { flex: 1, backgroundColor: colors.canvasAlt, padding: 20, paddingTop: 60 },
    modalTitle: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text },
});

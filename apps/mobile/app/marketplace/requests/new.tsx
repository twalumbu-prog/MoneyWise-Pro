import { useEffect, useState } from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiJson } from 'core';
import { Screen, Card, Btn, Field, Notice } from '../../../src/components/marketplace/ui';
import type { CatalogBrowse, CatalogItem, CompareResult } from '../../../src/lib/marketplace';
import { unitText } from '../../../src/lib/marketplace';
import { colors, fonts } from '../../../src/theme/tokens';

const today = () => new Date().toISOString().slice(0, 10);

/** Ask suppliers for a price for a quantity of something. Suppliers quote; you accept one. */
export default function NewRequest() {
    const router = useRouter();
    const { item: presetSlug } = useLocalSearchParams<{ item?: string }>();
    const [item, setItem] = useState<CatalogItem | null>(null);
    const [title, setTitle] = useState(''); const [unit, setUnit] = useState(''); const [quantity, setQuantity] = useState('');
    const [town, setTown] = useState(''); const [province, setProvince] = useState(''); const [address, setAddress] = useState('');
    const [neededBy, setNeededBy] = useState(''); const [details, setDetails] = useState(''); const [phone, setPhone] = useState(''); const [days, setDays] = useState('7');
    const [matches, setMatches] = useState<CatalogItem[]>([]);
    const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (!presetSlug) return;
        apiJson<CompareResult>(`/marketplace/compare/${encodeURIComponent(String(presetSlug))}`).then((r) => { setItem(r.item); setUnit(r.item.unit); }).catch(() => undefined);
    }, [presetSlug]);

    // Suggest catalogue items as the person types what they need, so quotes feed the price comparison.
    useEffect(() => {
        const q = title.trim();
        if (item || q.length < 2) { setMatches([]); return; }
        let live = true;
        const t = setTimeout(() => {
            apiJson<CatalogBrowse>(`/marketplace/catalog?vertical=ALL&q=${encodeURIComponent(q)}`).then((r) => { if (live) setMatches(r.items.slice(0, 5)); }).catch(() => { if (live) setMatches([]); });
        }, 300);
        return () => { live = false; clearTimeout(t); };
    }, [title, item]);

    const ready = (item || (title.trim() && unit.trim())) && Number(quantity) > 0 && town.trim() && phone.trim();
    const send = async () => {
        setBusy(true); setErr(null);
        try {
            const r = await apiJson<{ request: { id: string } }>('/marketplace/rfq', { method: 'POST', body: JSON.stringify({
                catalogItemId: item?.id || undefined, title: item ? undefined : title.trim(), unit: unit || undefined, quantity: Number(quantity),
                deliveryTown: town.trim(), deliveryProvince: province.trim(), deliveryAddress: address.trim(), neededBy: neededBy || undefined, details: details.trim(), phone: phone.trim(), days: Number(days) || 7,
            }) });
            router.replace(`/marketplace/requests/${r.request.id}` as any);
        } catch (e: any) { setErr(e?.message || 'Couldn’t send your request.'); } finally { setBusy(false); }
    };

    return (
        <Screen title="Ask for a quote">
            {err ? <Notice tone="error" text={err} /> : null}

            {item ? (
                <Card>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.sub}>Per {unitText(item)}</Text>
                    <Pressable onPress={() => { setItem(null); setUnit(''); }}><Text style={styles.link}>Choose something else</Text></Pressable>
                </Card>
            ) : (
                <>
                    <Field label="What do you need?" value={title} onChangeText={setTitle} placeholder="e.g. 500 hollow blocks" />
                    {matches.map((m) => (
                        <Card key={m.id} onPress={() => { setItem(m); setUnit(m.unit); setMatches([]); }}>
                            <Text style={styles.name}>{m.name}</Text><Text style={styles.sub}>{m.category} · per {unitText(m)}. Tap to use it.</Text>
                        </Card>
                    ))}
                    <Field label="Unit" value={unit} onChangeText={setUnit} placeholder="bag, block, tonne, litre…" />
                </>
            )}

            <Field label={`Quantity${item ? ` (${item.unit})` : ''}`} value={quantity} onChangeText={(v) => setQuantity(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="e.g. 500" />
            <Field label="Delivery town" value={town} onChangeText={setTown} placeholder="e.g. Kabwe" />
            <Field label="Province (optional)" value={province} onChangeText={setProvince} placeholder="e.g. Central" />
            <Field label="Address or landmark (optional)" value={address} onChangeText={setAddress} />
            <Field label="Needed by (optional)" value={neededBy} onChangeText={setNeededBy} placeholder={`YYYY-MM-DD, e.g. ${today()}`} />
            <Field label="Anything else suppliers should know" value={details} onChangeText={setDetails} multiline />
            <Field label="Your phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="09…" hint="Shared only with the supplier whose quote you accept." />
            <Field label="Keep it open for (days)" value={days} onChangeText={(v) => setDays(v.replace(/\D/g, ''))} keyboardType="numeric" />

            <Btn label="Send request" onPress={send} busy={busy} disabled={!ready} />
        </Screen>
    );
}

const styles = StyleSheet.create({
    name: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    sub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
    link: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.blue, marginTop: 4 },
});

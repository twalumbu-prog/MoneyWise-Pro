import { useEffect, useMemo, useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator, Share, Linking,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Copy, Check, ExternalLink, Send } from 'lucide-react-native';
import { apiJson, paymentLinkService, productService, formatMoney } from 'core';
import { WEB_ORIGIN } from '../../src/platform';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';

/**
 * Native take on the web's "One-Time Payment Link": a single-use link for one customer and one amount, in kwacha or (when the business has
 * dollars switched on and a rate set) in US dollars. A dollar product goes out in dollars by default; the amount follows the chosen currency.
 */
export default function ShareProductLinkScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { data: products, isLoading } = useQuery({ queryKey: ['products'], queryFn: () => productService.getProducts() });
    const product = products?.find((p) => p.id === id);
    const { data: settings, isLoading: settingsLoading } = useQuery({
        queryKey: ['lipila-settings-for-links'],
        queryFn: () => apiJson<{ cardCurrency?: string; dollarRate?: number | null }>('/lipila/settings').catch(() => ({} as { cardCurrency?: string; dollarRate?: number | null })),
    });
    const rate = settings?.dollarRate ?? null;
    const usdOn = settings?.cardCurrency === 'USD' && !!rate;

    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [usd, setUsd] = useState(false);
    const [amount, setAmount] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [url, setUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const openPriced = product?.product_type === 'DONATION' || product?.product_type === 'SERVICE_VARIABLE';
    /** The product's price in the chosen currency ('' when it can't be worked out). */
    const priceIn = useMemo(() => (toUsd: boolean): string => {
        const price = Number(product?.price ?? 0);
        if (!(price > 0)) return '';
        if (toUsd === (product?.currency === 'USD')) return String(price);
        if (!rate) return '';
        return String(Math.round((toUsd ? price / rate : price * rate) * 100) / 100);
    }, [product, rate]);

    useEffect(() => {
        if (!product || settingsLoading) return;
        const startUsd = usdOn && product.currency === 'USD';
        setUsd(startUsd);
        setAmount(openPriced ? '' : priceIn(startUsd));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product?.id, settingsLoading, usdOn]);

    const choose = (toUsd: boolean) => {
        if (toUsd === usd) return;
        setUsd(toUsd);
        if (!openPriced) setAmount(priceIn(toUsd));
    };

    const generate = async () => {
        if (!product) return;
        setError(null);
        if (!name.trim()) return setError('Please enter the customer name.');
        if (phone.replace(/\D/g, '').length < 9) return setError('Please enter a valid phone number.');
        const n = Number(amount);
        if (!(n > 0)) return setError('Please enter an amount greater than 0.');
        try {
            setBusy(true);
            const link = await paymentLinkService.createPaymentLink({ product_id: product.id, customer_name: name.trim(), customer_phone: phone.trim(), amount: n, currency: usd ? 'USD' : 'ZMW' });
            setUrl(`${WEB_ORIGIN}${link.path || `/pl/${link.token}`}`);
        } catch (e: any) {
            setError(e?.response?.data?.error || e?.message || 'Could not create the payment link.');
        } finally {
            setBusy(false);
        }
    };

    const copy = async () => {
        if (!url) return;
        await Clipboard.setStringAsync(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="One-Time Payment Link" />
            {isLoading || settingsLoading ? <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View> : !product ? (
                <View style={styles.centre}><Text style={styles.hint}>That product can’t be found.</Text></View>
            ) : (
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    <Text style={styles.product}>{product.name} · {formatMoney(product.price, product.currency)}</Text>
                    {!url ? (
                        <View style={styles.card}>
                            <Text style={styles.hint}>Enter the customer’s details and the amount. The link stops working after they pay once.</Text>
                            <Text style={styles.label}>Customer name</Text>
                            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="John Doe" placeholderTextColor={colors.textFaint} editable={!busy} />
                            <Text style={styles.label}>Phone number</Text>
                            <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="0970000000" keyboardType="phone-pad" placeholderTextColor={colors.textFaint} editable={!busy} />
                            {(usdOn || product.currency === 'USD') && (
                                <>
                                    <Text style={styles.label}>Currency</Text>
                                    <View style={styles.chips}>
                                        {([['ZMW', 'Kwacha (K)'], ['USD', 'US dollars ($)']] as const).map(([code, label]) => {
                                            const active = (code === 'USD') === usd;
                                            const blocked = code === 'USD' && !usdOn;
                                            return (
                                                <Pressable key={code} disabled={busy || blocked} onPress={() => choose(code === 'USD')} style={[styles.chip, active && styles.chipOn, blocked && { opacity: 0.4 }]}>
                                                    <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                    <Text style={styles.hint}>
                                        {!usdOn ? 'US dollars are off. Turn them on in the card settings to send this link in dollars.'
                                            : usd ? `The customer’s card is charged in dollars${rate ? ` (about K${rate.toFixed(2)} to $1; mobile money pays the kwacha equivalent)` : ''}.`
                                            : 'The customer pays in kwacha.'}
                                    </Text>
                                </>
                            )}
                            <Text style={styles.label}>Amount ({usd ? '$' : 'K'})</Text>
                            <TextInput style={styles.input} value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor={colors.textFaint} editable={!busy} />
                            {error ? <Text style={styles.error}>{error}</Text> : null}
                            <Pressable style={[styles.primary, busy && { opacity: 0.6 }]} onPress={generate} disabled={busy}>
                                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Generate link</Text>}
                            </Pressable>
                        </View>
                    ) : (
                        <View style={styles.card}>
                            <Text style={styles.hint}>Share this single-use link with {name}. It closes once they pay {usd ? '$' : 'K'}{Number(amount).toFixed(2)}.</Text>
                            <TextInput style={styles.input} value={url} editable={false} />
                            <View style={styles.row}>
                                <Pressable style={[styles.action, copied && { backgroundColor: '#10B981' }]} onPress={copy}>
                                    {copied ? <Check size={14} color="#fff" /> : <Copy size={14} color="#fff" />}<Text style={styles.actionText}>{copied ? 'Copied' : 'Copy'}</Text>
                                </Pressable>
                                <Pressable style={styles.action} onPress={() => { void Share.share({ message: `Pay ${name.trim()}'s link: ${url}` }); }}>
                                    <Send size={14} color="#fff" /><Text style={styles.actionText}>Share</Text>
                                </Pressable>
                            </View>
                            <Pressable style={styles.open} onPress={() => { void Linking.openURL(url); }}>
                                <Text style={styles.openText}>Open payment link</Text><ExternalLink size={14} color={colors.text} />
                            </Pressable>
                            <Pressable onPress={() => { setUrl(null); setName(''); setPhone(''); }}><Text style={styles.again}>Create another link</Text></Pressable>
                        </View>
                    )}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    centre: { paddingVertical: 64, alignItems: 'center' },
    scroll: { padding: 20, gap: 14, paddingBottom: 40 },
    product: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textFaint, textAlign: 'center' },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20, borderWidth: 1, borderColor: colors.border, gap: 8 },
    hint: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17 },
    label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted, marginTop: 8 },
    input: { fontFamily: fonts.body, fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11 },
    chips: { flexDirection: 'row', gap: 8 },
    chip: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center' },
    chipOn: { backgroundColor: colors.tabActiveBg, borderColor: colors.blue },
    chipText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    chipTextOn: { color: colors.blue },
    error: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.danger, marginTop: 6 },
    primary: { backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 10, minHeight: 50, justifyContent: 'center' },
    primaryText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#fff' },
    row: { flexDirection: 'row', gap: 10 },
    action: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navy, borderRadius: radius.md, paddingVertical: 12 },
    actionText: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#fff', textTransform: 'uppercase' },
    open: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 13 },
    openText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    again: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textFaint, textAlign: 'center', marginTop: 6 },
});

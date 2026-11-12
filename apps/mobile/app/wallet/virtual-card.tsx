import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Check, Clock, ShieldCheck } from 'lucide-react-native';
import { cashbookService, formatKwacha } from 'core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { VirtualCardPreview, CARD_THEMES, type CardTheme } from '../../src/components/wallet/VirtualCardPreview';
import { useAuth } from '../../src/context/AuthContext';
import { useGoBack } from '../../src/hooks/useGoBack';
import { colors, fonts, radius } from '../../src/theme/tokens';

const STEPS = ['Welcome', 'Your card', 'Funding', 'Your details', 'Review'] as const;
const LIMITS = [1000, 5000, 10000, 25000];

/**
 * Virtual card setup, from the welcome through to the last page. Nothing here is saved yet: the final button says
 * Coming soon, so this is the whole journey people will go through once cards open.
 */
export default function VirtualCardSetup() {
    const insets = useSafeAreaInsets();
    const safeBack = useGoBack();
    const { userName } = useAuth();
    const [step, setStep] = useState(0);

    const [theme, setTheme] = useState<CardTheme>('red');
    const [currency, setCurrency] = useState<'ZMW' | 'USD'>('ZMW');
    const [nickname, setNickname] = useState('');
    const [walletId, setWalletId] = useState('');
    const [limit, setLimit] = useState<number>(5000);
    const [customLimit, setCustomLimit] = useState('');
    const [holder, setHolder] = useState('');
    const [phone, setPhone] = useState('');
    const [town, setTown] = useState('');
    const [agree, setAgree] = useState(false);

    const { data: wallets = [] } = useQuery({
        queryKey: ['wallets-virtual-card'],
        queryFn: async () => {
            const data = await cashbookService.getWallets();
            return (Array.isArray(data) ? data : []).map((w: any) => ({ id: String(w.id), name: String(w.name), balance: Number(w.balance) || 0, isMain: !!w.is_main }));
        },
    });
    useEffect(() => { if (!walletId && wallets.length) setWalletId((wallets.find((w) => w.isMain) ?? wallets[0]).id); }, [wallets, walletId]);
    useEffect(() => { if (!holder && userName) setHolder(userName); }, [userName, holder]);

    const effectiveLimit = customLimit ? Number(customLimit) || 0 : limit;
    const wallet = wallets.find((w) => w.id === walletId);
    const phoneOk = phone.replace(/\D/g, '').length >= 9;

    const canContinue = useMemo(() => {
        if (step === 2) return !!walletId && effectiveLimit > 0;
        if (step === 3) return holder.trim().length > 1 && phoneOk;
        return true;
    }, [step, walletId, effectiveLimit, holder, phoneOk]);

    const last = step === STEPS.length - 1;
    const back = () => (step === 0 ? safeBack() : setStep((s) => s - 1));

    return (
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Virtual card" />

            <View style={styles.progressWrap}>
                <View style={styles.bars}>{STEPS.map((s, i) => <View key={s} style={[styles.bar, i <= step && styles.barOn]} />)}</View>
                <Text style={styles.stepText}>Step {step + 1} of {STEPS.length} · {STEPS[step]}</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <VirtualCardPreview theme={theme} name={step >= 3 ? holder : nickname || undefined} currency={currency} locked />

                {step === 0 && (
                    <View style={styles.section}>
                        <Text style={styles.h1}>Your own virtual Visa card</Text>
                        <Text style={styles.p}>A card number that lives in the app. Use it to pay online, keep your wallet out of sight, and stay in control of every charge.</Text>
                        {[
                            ['Set up', 'Choose how it looks and what it can spend.'],
                            ['Fund', 'Top it up from any of your MoneyWise wallets.'],
                            ['Spend', 'Pay on any website that takes Visa. Freeze it any time.'],
                        ].map(([t, d], i) => (
                            <View key={t} style={styles.how}>
                                <View style={styles.num}><Text style={styles.numText}>{i + 1}</Text></View>
                                <View style={{ flex: 1 }}><Text style={styles.howTitle}>{t}</Text><Text style={styles.p}>{d}</Text></View>
                            </View>
                        ))}
                        <View style={styles.note}><Clock size={15} color={colors.blue} /><Text style={styles.noteText}>It takes about two minutes. You can go through every step now; activation opens soon.</Text></View>
                    </View>
                )}

                {step === 1 && (
                    <View style={styles.section}>
                        <Text style={styles.h1}>Choose your card</Text>
                        <Text style={styles.label}>Colour</Text>
                        <View style={styles.row}>
                            {(Object.keys(CARD_THEMES) as CardTheme[]).map((k) => (
                                <Pressable key={k} onPress={() => setTheme(k)} style={[styles.swatchWrap, theme === k && styles.swatchOn]} accessibilityLabel={`${CARD_THEMES[k].label} card`}>
                                    <View style={[styles.swatch, { backgroundColor: CARD_THEMES[k].swatch }]}>{theme === k ? <Check size={16} color="#fff" /> : null}</View>
                                    <Text style={styles.swatchText}>{CARD_THEMES[k].label}</Text>
                                </Pressable>
                            ))}
                        </View>
                        <Text style={styles.label}>Currency</Text>
                        <View style={styles.row}>
                            {(['ZMW', 'USD'] as const).map((c) => <Pressable key={c} onPress={() => setCurrency(c)} style={[styles.chip, currency === c && styles.chipOn]}><Text style={[styles.chipText, currency === c && styles.chipTextOn]}>{c === 'ZMW' ? 'Kwacha (ZMW)' : 'US dollar (USD)'}</Text></Pressable>)}
                        </View>
                        <Text style={styles.hint}>{currency === 'USD' ? 'Best for international websites. Your wallet is converted at the day’s rate when you fund the card.' : 'Best for shops and services that charge in kwacha.'}</Text>
                        <Text style={styles.label}>Card name (optional)</Text>
                        <TextInput style={styles.input} value={nickname} onChangeText={setNickname} placeholder="e.g. Online shopping" placeholderTextColor={colors.textFaint} maxLength={24} />
                    </View>
                )}

                {step === 2 && (
                    <View style={styles.section}>
                        <Text style={styles.h1}>Funding and limit</Text>
                        <Text style={styles.label}>Fund the card from</Text>
                        <View style={styles.wrap}>
                            {wallets.map((w) => (
                                <Pressable key={w.id} onPress={() => setWalletId(w.id)} style={[styles.chip, walletId === w.id && styles.chipOn]}>
                                    <Text style={[styles.chipText, walletId === w.id && styles.chipTextOn]}>{w.name} · {formatKwacha(w.balance)}</Text>
                                </Pressable>
                            ))}
                            {wallets.length === 0 ? <Text style={styles.hint}>Loading your wallets…</Text> : null}
                        </View>
                        <Text style={styles.label}>Monthly spending limit</Text>
                        <View style={styles.wrap}>
                            {LIMITS.map((l) => (
                                <Pressable key={l} onPress={() => { setLimit(l); setCustomLimit(''); }} style={[styles.chip, !customLimit && limit === l && styles.chipOn]}>
                                    <Text style={[styles.chipText, !customLimit && limit === l && styles.chipTextOn]}>{formatKwacha(l)}</Text>
                                </Pressable>
                            ))}
                        </View>
                        <TextInput style={styles.input} value={customLimit} onChangeText={(v) => setCustomLimit(v.replace(/[^0-9]/g, ''))} keyboardType="numeric" placeholder="Or type your own limit (K)" placeholderTextColor={colors.textFaint} />
                        <Text style={styles.hint}>The card can never spend more than this in a month, however much is in your wallet.</Text>
                    </View>
                )}

                {step === 3 && (
                    <View style={styles.section}>
                        <Text style={styles.h1}>Your details</Text>
                        <Text style={styles.label}>Name on the card</Text>
                        <TextInput style={styles.input} value={holder} onChangeText={setHolder} placeholder="As on your ID" placeholderTextColor={colors.textFaint} autoCapitalize="words" />
                        <Text style={styles.label}>Phone number</Text>
                        <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="09…" placeholderTextColor={colors.textFaint} />
                        {phone && !phoneOk ? <Text style={[styles.hint, { color: '#B31412' }]}>Enter a full phone number.</Text> : null}
                        <Text style={styles.label}>Town (billing address)</Text>
                        <TextInput style={styles.input} value={town} onChangeText={setTown} placeholder="e.g. Lusaka" placeholderTextColor={colors.textFaint} />
                        <View style={styles.note}><ShieldCheck size={15} color={colors.blue} /><Text style={styles.noteText}>We use your verified MoneyWise profile for the identity check, so there is nothing to upload.</Text></View>
                    </View>
                )}

                {step === 4 && (
                    <View style={styles.section}>
                        <Text style={styles.h1}>Review your card</Text>
                        <View style={styles.summary}>
                            {[
                                ['Name on card', holder || '—'],
                                ['Card name', nickname || 'Not set'],
                                ['Colour', CARD_THEMES[theme].label],
                                ['Currency', currency],
                                ['Funded from', wallet ? wallet.name : '—'],
                                ['Monthly limit', formatKwacha(effectiveLimit)],
                                ['Phone', phone || '—'],
                                ['Town', town || '—'],
                            ].map(([k, v], i, a) => (
                                <View key={k} style={[styles.sumRow, i < a.length - 1 && styles.sumDivider]}><Text style={styles.sumKey}>{k}</Text><Text style={styles.sumVal} numberOfLines={1}>{v}</Text></View>
                            ))}
                        </View>
                        <Pressable style={styles.agree} onPress={() => setAgree((a) => !a)}>
                            <View style={[styles.box, agree && styles.boxOn]}>{agree ? <Check size={13} color="#fff" /> : null}</View>
                            <Text style={styles.agreeText}>I agree to the virtual card terms and understand the card is funded from my wallet.</Text>
                        </Pressable>
                    </View>
                )}
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
                {last ? (
                    <>
                        <View style={styles.soonBtn} accessibilityRole="button" accessibilityState={{ disabled: true }}>
                            <Text style={styles.soonBtnText}>Activate card</Text>
                            <View style={styles.soonPill}><Text style={styles.soonPillText}>Coming soon</Text></View>
                        </View>
                        <Text style={styles.footNote}>We will tell you the moment virtual cards open, and your choices are ready to go.</Text>
                        <Pressable onPress={back} style={styles.backLink}><Text style={styles.backText}>Back</Text></Pressable>
                    </>
                ) : (
                    <View style={styles.footRow}>
                        {step > 0 ? <Pressable style={styles.secondary} onPress={back}><Text style={styles.secondaryText}>Back</Text></Pressable> : null}
                        <Pressable style={[styles.primary, !canContinue && { opacity: 0.45 }]} disabled={!canContinue} onPress={() => setStep((s) => s + 1)}>
                            <Text style={styles.primaryText}>{step === 0 ? 'Get started' : 'Continue'}</Text>
                        </Pressable>
                    </View>
                )}
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    progressWrap: { paddingHorizontal: 20, gap: 8, paddingBottom: 8 },
    bars: { flexDirection: 'row', gap: 6 },
    bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#DDE3EC' },
    barOn: { backgroundColor: colors.blue },
    stepText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    scroll: { padding: 20, gap: 18, paddingBottom: 30 },
    section: { gap: 10 },
    h1: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.text },
    p: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
    label: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.text, marginTop: 6 },
    hint: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textMuted, lineHeight: 16 },
    how: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 4 },
    num: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
    numText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue },
    howTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    note: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: '#EAF1FF', borderRadius: radius.md, padding: 12, marginTop: 6 },
    noteText: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.blue, lineHeight: 17 },
    row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    wrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    swatchWrap: { alignItems: 'center', gap: 6, padding: 6, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent' },
    swatchOn: { borderColor: colors.blue },
    swatch: { width: 54, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    swatchText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.text },
    chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
    chipText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.text },
    chipTextOn: { color: '#FFFFFF' },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 13, fontFamily: fonts.body, fontSize: 14, color: colors.text, backgroundColor: '#fff' },
    summary: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14 },
    sumRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
    sumDivider: { borderBottomWidth: 1, borderBottomColor: '#F1F3F4' },
    sumKey: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textMuted },
    sumVal: { flex: 1, textAlign: 'right', fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.text },
    agree: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 6 },
    box: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: colors.textFaint, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    boxOn: { backgroundColor: colors.blue, borderColor: colors.blue },
    agreeText: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17 },
    footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, gap: 10 },
    footRow: { flexDirection: 'row', gap: 10 },
    primary: { flex: 1, backgroundColor: colors.blue, borderRadius: radius.pill, paddingVertical: 15, alignItems: 'center' },
    primaryText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
    secondary: { backgroundColor: '#EAF1FF', borderRadius: radius.pill, paddingVertical: 15, paddingHorizontal: 24, alignItems: 'center' },
    secondaryText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.blue },
    soonBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#D5DAE2', borderRadius: radius.pill, paddingVertical: 15 },
    soonBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#6B7280' },
    soonPill: { backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
    soonPillText: { fontFamily: fonts.bodyBold, fontSize: 10.5, color: colors.blue },
    footNote: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textMuted, textAlign: 'center', lineHeight: 16 },
    backLink: { alignItems: 'center', paddingVertical: 4 },
    backText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue },
});

import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert, Switch, Share } from 'react-native';
import { Stack } from 'expo-router';
import { CheckCircle2, AlertCircle } from 'lucide-react-native';
import { lipilaService } from 'core';
import type { LipilaSettingsView } from 'core';
import { useAuth } from '../../src/context/AuthContext';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';

/**
 * Card payments through Lipila. Each business saves its own Lipila wallet key here, so its customers' card
 * payments go to its own wallet. Native port of the web's Integrations → Lipila card payments.
 */
export default function LipilaSettingsScreen() {
    const { userRole } = useAuth();
    const isAdmin = userRole === 'ADMIN';
    const [view, setView] = useState<LipilaSettingsView | null>(null);
    const [env, setEnv] = useState<'sandbox' | 'production'>('sandbox');
    const [apiKey, setApiKey] = useState('');
    const [secret, setSecret] = useState('');
    const [clearSecret, setClearSecret] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [currency, setCurrency] = useState<'ZMW' | 'USD'>('ZMW');
    const [busy, setBusy] = useState(false);
    const [testing, setTesting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);

    const apply = (v: LipilaSettingsView) => { setView(v); setEnv(v.env); setEnabled(v.enabled); setCurrency(v.cardCurrency === 'USD' ? 'USD' : 'ZMW'); };
    const load = useCallback(async () => {
        try { setError(null); apply(await lipilaService.settings()); } catch (e: any) { setError(e?.message || 'Could not load the card settings.'); }
    }, []);
    useEffect(() => { void load(); }, [load]);

    const save = async () => {
        setBusy(true); setError(null); setNotice(null); setTest(null);
        try {
            const v = await lipilaService.saveSettings({
                apiKey: apiKey.trim() || undefined,
                webhookSecret: clearSecret ? '' : secret.trim() ? secret.trim() : undefined,
                env, enabled, cardCurrency: currency,
            });
            apply(v); setApiKey(''); setSecret(''); setClearSecret(false);
            setNotice(v.enabled ? 'Saved. Card payments are on.' : 'Saved. Card payments are off.');
        } catch (e: any) { setError(e?.message || 'Could not save.'); } finally { setBusy(false); }
    };
    const runTest = async () => {
        setTesting(true); setTest(null); setError(null);
        try { setTest(await lipilaService.testSettings()); } catch (e: any) { setTest({ ok: false, message: e?.message || 'Could not run the test.' }); } finally { setTesting(false); }
    };
    const remove = () => {
        Alert.alert('Remove the saved Lipila key?', 'Card payments will stop until you save a key again.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: async () => {
                setBusy(true); setError(null);
                try { await lipilaService.removeSettings(); setNotice('The key was removed.'); await load(); } catch (e: any) { setError(e?.message || 'Could not remove it.'); } finally { setBusy(false); }
            } },
        ]);
    };

    const on = !!view?.configured && !!view?.enabled;

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Card payments" />
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <Text style={styles.sub}>Let customers pay you by card. The money goes to your own Lipila wallet.</Text>

                {!view ? (
                    error ? <Text style={styles.errorBox}>{error}</Text> : <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
                ) : !view.available ? (
                    <Text style={styles.warnBox}>Card payments aren’t open for your account yet.</Text>
                ) : (
                    <>
                        {!view.encryptionReady ? <Text style={styles.warnBox}>The server can’t store keys safely yet (its encryption key isn’t set). Saving is switched off until that is done.</Text> : null}
                        {error ? <Text style={styles.errorBox}>{error}</Text> : null}
                        {notice ? <Text style={styles.okBox}>{notice}</Text> : null}

                        <View style={[styles.status, on && styles.statusOn]}>
                            {on ? <CheckCircle2 size={20} color="#137333" /> : <AlertCircle size={20} color={colors.textFaint} />}
                            <View style={{ flex: 1 }}>
                                <Text style={styles.statusTitle}>{!view.configured ? 'Not connected' : view.enabled ? `Card payments are on (${view.env === 'production' ? 'live' : 'testing'})` : 'Connected, card payments are off'}</Text>
                                {view.configured ? <Text style={styles.statusSub}>Saved key {view.keyHint}{view.updatedAt ? ` · updated ${new Date(view.updatedAt).toLocaleDateString()}` : ''}</Text> : null}
                            </View>
                            {view.configured && isAdmin ? <Pressable style={styles.pill} onPress={runTest} disabled={testing}>{testing ? <ActivityIndicator size="small" color={colors.blue} /> : <Text style={styles.pillText}>Test key</Text>}</Pressable> : null}
                        </View>
                        {test ? <Text style={test.ok ? styles.okBox : styles.errorBox}>{test.message}</Text> : null}

                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>Your Lipila wallet</Text>

                            <Text style={styles.label}>Environment</Text>
                            <View style={styles.seg}>
                                {(['sandbox', 'production'] as const).map((e) => (
                                    <Pressable key={e} style={[styles.segItem, env === e && styles.segOn]} onPress={() => setEnv(e)} disabled={!isAdmin || busy}>
                                        <Text style={[styles.segText, env === e && styles.segTextOn]}>{e === 'sandbox' ? 'Testing' : 'Live'}</Text>
                                    </Pressable>
                                ))}
                            </View>
                            <Text style={styles.hint}>The key must come from the same environment. A live key won’t work in testing, and the other way round.</Text>

                            <Text style={styles.label}>Lipila API key{view.configured ? ' (leave empty to keep the saved one)' : ''}</Text>
                            <TextInput style={styles.input} value={apiKey} onChangeText={setApiKey} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={isAdmin && !busy}
                                placeholder={view.configured ? `Saved ${view.keyHint ?? ''}` : 'Lsk_…'} placeholderTextColor={colors.textFaint} />
                            <Text style={styles.hint}>In Lipila: Dashboard → Wallets → your wallet → API Keys. It is stored encrypted and never shown again.</Text>

                            <Text style={styles.label}>Webhook signing secret (so Lipila can tell us a payment finished)</Text>
                            <TextInput style={styles.input} value={secret} onChangeText={(v) => { setSecret(v); setClearSecret(false); }} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={isAdmin && !busy}
                                placeholder={view.hasWebhookSecret ? 'Saved, leave empty to keep' : 'whsec_…'} placeholderTextColor={colors.textFaint} />
                            {view.hasWebhookSecret ? (
                                <Pressable style={styles.checkRow} onPress={() => { setClearSecret((c) => !c); setSecret(''); }} disabled={!isAdmin || busy}>
                                    <View style={[styles.box, clearSecret && styles.boxOn]} /><Text style={styles.hint}>Remove the saved signing secret</Text>
                                </Pressable>
                            ) : null}

                            <Text style={styles.label}>Charge customers in</Text>
                            <View style={styles.seg}>
                                {(['ZMW', 'USD'] as const).map((c) => (
                                    <Pressable key={c} style={[styles.segItem, currency === c && styles.segOn]} onPress={() => setCurrency(c)} disabled={!isAdmin || busy}>
                                        <Text style={[styles.segText, currency === c && styles.segTextOn]}>{c === 'ZMW' ? 'Kwacha (K)' : 'US dollars ($)'}</Text>
                                    </Pressable>
                                ))}
                            </View>
                            <Text style={styles.hint}>{currency === 'USD'
                                ? `Prices are in dollars. Customers are charged the kwacha equivalent at today's rate${view.dollarRate ? ` (about K${view.dollarRate.toFixed(2)} to $1)` : ''}, and the money lands in your wallet in kwacha.`
                                : 'Prices are in kwacha.'}</Text>

                            <View style={styles.switchRow}>
                                <Text style={styles.switchText}>Accept card payments on my payment links, quick pay and store</Text>
                                <Switch value={enabled} onValueChange={setEnabled} disabled={!isAdmin || busy} />
                            </View>

                            <Pressable style={[styles.primary, (!isAdmin || busy || !view.encryptionReady || (!view.configured && !apiKey.trim())) && styles.disabled]} onPress={save}
                                disabled={!isAdmin || busy || !view.encryptionReady || (!view.configured && !apiKey.trim())}>
                                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save</Text>}
                            </Pressable>
                            {view.configured && isAdmin ? <Pressable onPress={remove} disabled={busy} style={styles.danger}><Text style={styles.dangerText}>Remove key</Text></Pressable> : null}
                            {!isAdmin ? <Text style={styles.hint}>Only the account holder can change these.</Text> : null}
                        </View>

                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>Set this up in Lipila too</Text>
                            <Text style={styles.hint}>In your Lipila dashboard go to Settings → Webhooks and add this address:</Text>
                            {view.webhookUrl ? (
                                <View style={styles.urlBox}>
                                    <Text selectable style={styles.url}>{view.webhookUrl}</Text>
                                    <Pressable style={styles.pill} onPress={() => { void Share.share({ message: view.webhookUrl! }); }}><Text style={styles.pillText}>Share</Text></Pressable>
                                </View>
                            ) : <Text style={styles.warnBox}>The server’s public address isn’t set (API_PUBLIC_URL), so the webhook address can’t be shown yet.</Text>}
                            <Text style={styles.hint}>Copy the signing secret Lipila shows there into the box above. Even without the webhook, payments are still confirmed when the customer comes back.</Text>
                        </View>

                        <Text style={styles.foot}>{view.feeNote} Customers type their card on Lipila’s secure page. Card details never reach MoneyWise.</Text>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    scroll: { padding: 20, gap: 14, paddingBottom: 48 },
    sub: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
    centre: { paddingVertical: 40, alignItems: 'center' },
    errorBox: { fontFamily: fonts.body, fontSize: 12, color: '#B31412', backgroundColor: '#FCE8E6', borderRadius: radius.md, padding: 12, lineHeight: 17 },
    warnBox: { fontFamily: fonts.body, fontSize: 12, color: '#7A4B00', backgroundColor: '#FEF7E0', borderRadius: radius.md, padding: 12, lineHeight: 17 },
    okBox: { fontFamily: fonts.body, fontSize: 12, color: '#137333', backgroundColor: '#E6F4EA', borderRadius: radius.md, padding: 12, lineHeight: 17 },
    status: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border },
    statusOn: { backgroundColor: '#E6F4EA', borderColor: '#B7DFC1' },
    statusTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    statusSub: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginTop: 2 },
    pill: { backgroundColor: '#EAF1FF', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minWidth: 64, alignItems: 'center' },
    pillText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.blue },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 8 },
    cardTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    label: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text, marginTop: 6 },
    hint: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, lineHeight: 15 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12, fontFamily: fonts.body, fontSize: 14, color: colors.text, backgroundColor: '#fff' },
    seg: { flexDirection: 'row', padding: 2, backgroundColor: '#F5F5F5', borderRadius: radius.pill },
    segItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.pill },
    segOn: { backgroundColor: colors.surface },
    segText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
    segTextOn: { fontFamily: fonts.bodyBold, color: colors.text },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    box: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: colors.textFaint },
    boxOn: { backgroundColor: colors.blue, borderColor: colors.blue },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F8FAFD', borderRadius: radius.md, padding: 12, marginTop: 6 },
    switchText: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.text, lineHeight: 16 },
    primary: { backgroundColor: colors.blue, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
    primaryText: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#fff' },
    disabled: { opacity: 0.45 },
    danger: { alignItems: 'center', paddingVertical: 10 },
    dangerText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#B31412' },
    urlBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFD', borderRadius: radius.md, padding: 10 },
    url: { flex: 1, fontFamily: fonts.body, fontSize: 11, color: colors.text },
    foot: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, lineHeight: 16, textAlign: 'center' },
});

import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { CheckCircle2, AlertCircle } from 'lucide-react-native';
import { lencoService, organizationService } from 'core';
import { useAuth } from '../../src/context/AuthContext';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';

interface Choice { id: string; name: string; currency: string | null; balance: number | null; number: string | null }

/**
 * Connect the business's own Lenco wallet with its keys, the way Master Fees does: the public key, the secret key and, only when the keys can
 * see more than one account, the Account ID. MoneyWise asks Lenco which account the keys belong to, saves the link and reads the live balance.
 * Native port of the web's Integrations → Lenco "Connect Lenco wallet".
 */
export default function LencoConnectScreen() {
    const { userRole } = useAuth();
    const isAdmin = userRole === 'ADMIN';
    const [publicKey, setPublicKey] = useState('');
    const [secretKey, setSecretKey] = useState('');
    const [accountId, setAccountId] = useState('');
    const [linkedId, setLinkedId] = useState<string | null>(null);
    const [choices, setChoices] = useState<Choice[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const org: any = await organizationService.getOrganization();
                setPublicKey(org?.lenco_public_key || '');
                setLinkedId(org?.lenco_subaccount_id || null);
            } catch { /* the form still works without the saved values */ } finally { setLoading(false); }
        })();
    }, []);

    const connect = async (chosen?: string) => {
        setBusy(true); setError(null); setNotice(null);
        try {
            const r = await lencoService.connectWithKeys({ publicKey: publicKey.trim(), secretKey: secretKey.trim(), accountId: (chosen || accountId).trim() || undefined });
            setLinkedId(r.accountId); setChoices(null); setSecretKey(''); setNotice(r.message);
        } catch (e: any) {
            // Several accounts (or none) are visible to these keys: ask which one, never guess.
            if (e?.data?.needsAccountId) { setChoices(e.data.accounts || []); setError(e.message); }
            else { setChoices(null); setError(e?.message || 'Could not connect Lenco.'); }
        } finally { setBusy(false); }
    };
    const check = async () => {
        setChecking(true); setError(null); setNotice(null);
        try { setNotice((await lencoService.checkConnection()).message); } catch (e: any) { setError(e?.message || 'Could not check the connection.'); } finally { setChecking(false); }
    };

    return (
        <View style={s.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Lenco wallet" />
            <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
                <Text style={s.sub}>Connect your own Lenco account. Paste the public key and the secret key (live keys, from your Lenco dashboard). MoneyWise asks Lenco which account they belong to.</Text>

                {!isAdmin ? <View style={s.warn}><AlertCircle size={14} color="#B06000" /><Text style={s.warnText}>Only the account holder can change this. You can still check the connection.</Text></View> : null}
                {error ? <View style={s.err}><AlertCircle size={14} color="#B31412" /><Text style={s.errText}>{error}</Text></View> : null}
                {notice ? <View style={s.ok}><CheckCircle2 size={14} color="#137333" /><Text style={s.okText}>{notice}</Text></View> : null}

                {loading ? <ActivityIndicator color={colors.blue} style={{ marginVertical: 30 }} /> : (
                    <View style={s.card}>
                        {linkedId ? (
                            <View style={s.linked}>
                                <Text style={s.linkedLabel}>CONNECTED ACCOUNT</Text>
                                <Text style={s.linkedId} selectable>{linkedId}</Text>
                                <Pressable style={s.tonal} onPress={check} disabled={checking}>{checking ? <ActivityIndicator color={colors.blue} /> : <Text style={s.tonalText}>Check balance</Text>}</Pressable>
                            </View>
                        ) : null}

                        {isAdmin ? (
                            <>
                                <Text style={s.label}>Public key</Text>
                                <TextInput style={s.input} value={publicKey} onChangeText={setPublicKey} placeholder="pub-…" placeholderTextColor={colors.textFaint} autoCapitalize="none" autoCorrect={false} editable={!busy} />
                                <Text style={s.label}>Secret key</Text>
                                <TextInput style={s.input} value={secretKey} onChangeText={setSecretKey} placeholder={linkedId ? 'Paste the secret key again to reconnect' : 'Your secret key'} placeholderTextColor={colors.textFaint} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!busy} />
                                <Text style={s.label}>Account ID (only if your keys see more than one account)</Text>
                                <TextInput style={s.input} value={accountId} onChangeText={setAccountId} placeholder="Optional" placeholderTextColor={colors.textFaint} autoCapitalize="none" autoCorrect={false} editable={!busy} />

                                {choices && choices.length > 0 ? (
                                    <View style={{ gap: 8 }}>
                                        <Text style={s.label}>Choose the account for this business</Text>
                                        {choices.map((c) => (
                                            <Pressable key={c.id} style={s.choice} onPress={() => connect(c.id)} disabled={busy}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={s.choiceName}>{c.name}{c.number ? ` · ${c.number}` : ''}</Text>
                                                    <Text style={s.choiceId} numberOfLines={1}>{c.id}</Text>
                                                </View>
                                                {c.balance !== null ? <Text style={s.choiceBal}>{c.currency ?? 'ZMW'} {c.balance.toFixed(2)}</Text> : null}
                                            </Pressable>
                                        ))}
                                    </View>
                                ) : null}

                                <Pressable style={[s.primary, (busy || !publicKey.trim() || !secretKey.trim()) && { opacity: 0.5 }]} onPress={() => connect()} disabled={busy || !publicKey.trim() || !secretKey.trim()}>
                                    {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>{linkedId ? 'Reconnect' : 'Connect Lenco wallet'}</Text>}
                                </Pressable>
                            </>
                        ) : null}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    scroll: { padding: 20, gap: 14, paddingBottom: 40 },
    sub: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, borderWidth: 1, borderColor: colors.border, gap: 10 },
    label: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text, marginTop: 4 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12, fontFamily: fonts.body, fontSize: 14, color: colors.text, backgroundColor: '#fff' },
    primary: { backgroundColor: colors.blue, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
    primaryText: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#fff' },
    tonal: { backgroundColor: '#EAF1FF', borderRadius: radius.pill, paddingVertical: 11, alignItems: 'center' },
    tonalText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue },
    linked: { gap: 6, paddingBottom: 12, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
    linkedLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textMuted, letterSpacing: 0.6 },
    linkedId: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
    choice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12 },
    choiceName: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    choiceId: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint, marginTop: 2 },
    choiceBal: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
    warn: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#FEF7E0', borderRadius: 10, padding: 10 },
    warnText: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: '#7A4B00', lineHeight: 17 },
    err: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#FCE8E6', borderRadius: 10, padding: 10 },
    errText: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: '#B31412', lineHeight: 17 },
    ok: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#E6F4EA', borderRadius: 10, padding: 10 },
    okText: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: '#137333', lineHeight: 17 },
});

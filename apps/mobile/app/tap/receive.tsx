import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator, Share, Platform, KeyboardAvoidingView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { Share2, Copy, Check, CheckCircle2 } from 'lucide-react-native';
import { tapService, formatKwacha, type TapMode, type TapRequest, type TapRequestStatus } from 'core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { nfcShareState, startNfcShare, stopNfcShare, openNfcSettings, type NfcShareState } from '../../src/lib/tapNfc';
import { colors, fonts, radius } from '../../src/theme/tokens';

/**
 * Receive by tap: ask for an amount (or leave it open), then show a code the other phone can scan, or share the link. The
 * screen watches the request and says the moment it is paid. It only ever shows what the server says.
 */
export default function ReceiveByTap() {
    const router = useRouter();
    const [mode, setMode] = useState<TapMode | null>(null);
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [kind, setKind] = useState<'TAP' | 'LINK'>('TAP');
    const [req, setReq] = useState<TapRequest | null>(null);
    const [st, setSt] = useState<TapRequestStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [left, setLeft] = useState(0);
    const [copied, setCopied] = useState(false);
    const [nfc, setNfc] = useState<NfcShareState>('unsupported');
    const reqRef = useRef<TapRequest | null>(null);
    reqRef.current = req;

    useEffect(() => { tapService.getMode().then(setMode).catch(() => setMode('OFF')); }, []);

    // Watch the request: paid, claimed by a payer, or ended.
    useEffect(() => {
        if (!req) return;
        let stop = false;
        const t = setInterval(async () => {
            try { const s = await tapService.status(req.id); if (!stop) { setSt(s); if (s.status === 'PAID' || s.status === 'EXPIRED' || s.status === 'CANCELLED') clearInterval(t); } } catch { /* keep trying */ }
        }, 2500);
        return () => { stop = true; clearInterval(t); };
    }, [req]);

    useEffect(() => {
        if (!req) return;
        const tick = () => setLeft(Math.max(0, Math.round((Date.parse(req.expiresAt) - Date.now()) / 1000)));
        tick(); const t = setInterval(tick, 1000);
        return () => clearInterval(t);
    }, [req]);

    // Leaving the screen ends an open request, and stops sharing it by tap.
    useEffect(() => () => { stopNfcShare(); const r = reqRef.current; if (r) void tapService.cancel(r.id).catch(() => undefined); }, []);

    // While a request is open, this phone answers another phone's tap with the request's link (Android phones with NFC on).
    const live = !!req && st?.status !== 'PAID' && st?.status !== 'EXPIRED' && st?.status !== 'CANCELLED' && left > 0;
    useEffect(() => {
        if (!req || !live) { stopNfcShare(); return; }
        const state = nfcShareState();
        setNfc(state);
        if (state === 'on') startNfcShare(req.url);
        return () => stopNfcShare();
    }, [req, live]);

    const make = useCallback(async () => {
        setBusy(true); setError(null);
        try {
            const value = Number(amount);
            setSt(null);
            setReq(await tapService.createRequest({ amount: value > 0 ? value : undefined, note: note.trim() || undefined, kind }));
        } catch (e: any) { setError(e?.message || 'Could not make the request.'); } finally { setBusy(false); }
    }, [amount, note, kind]);

    const done = st?.status === 'PAID';
    const ended = st?.status === 'EXPIRED' || st?.status === 'CANCELLED' || (!!req && left === 0 && !done);
    const mins = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    const timeText = kind === 'LINK' ? `Valid for ${left > 7200 ? `${Math.round(left / 3600)} hours` : mins}` : `Expires in ${mins}`;

    const share = async () => { if (req) await Share.share(Platform.OS === 'ios' ? { url: req.url, message: `Pay me on MoneyWise: ${req.url}` } : { message: `Pay me on MoneyWise: ${req.url}` }); };
    const copy = async () => { if (!req) return; await Clipboard.setStringAsync(req.url); setCopied(true); setTimeout(() => setCopied(false), 1400); };
    const again = () => { setReq(null); setSt(null); };

    return (
        <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Receive money" />
            <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
                {mode === null ? <ActivityIndicator color={colors.blue} style={{ marginTop: 30 }} /> : mode === 'OFF' ? (
                    <View style={s.card}>
                        <Text style={s.title}>Tap to receive is off</Text>
                        <Text style={s.sub}>Turn it on to let other MoneyWise users pay you by tap, QR code or link. You choose who can.</Text>
                        <Pressable style={s.btn} onPress={() => router.push('/settings/tap-to-receive' as any)}><Text style={s.btnText}>Turn it on</Text></Pressable>
                    </View>
                ) : done ? (
                    <View style={[s.card, { alignItems: 'center', gap: 10 }]}>
                        <CheckCircle2 size={56} color="#137333" />
                        <Text style={s.big}>{st?.paidAmount != null ? formatKwacha(st.paidAmount) : 'Paid'} received</Text>
                        <Text style={s.sub}>{st?.payer ? `from ${st.payer}` : 'The payment came through.'}</Text>
                        <Pressable style={s.btn} onPress={() => router.back()}><Text style={s.btnText}>Done</Text></Pressable>
                        <Pressable onPress={again}><Text style={s.link}>Make another request</Text></Pressable>
                    </View>
                ) : req ? (
                    <View style={[s.card, { alignItems: 'center', gap: 12 }]}>
                        <Text style={s.title}>{req.amount ? `Asking for ${formatKwacha(req.amount)}` : 'Any amount'}</Text>
                        {req.note ? <Text style={s.sub}>{req.note}</Text> : null}
                        <View style={[s.qrBox, ended && { opacity: 0.25 }]}><QRCode value={req.url} size={210} backgroundColor="#FFFFFF" color="#0B1B3A" /></View>
                        {ended ? <Text style={[s.sub, { color: '#B31412' }]}>This request has ended.</Text>
                            : st?.claimed ? <Text style={[s.sub, { color: colors.blue }]}>Someone is paying you now…</Text>
                            : <Text style={s.sub}>{timeText}. Ask them to scan this with MoneyWise.</Text>}
                        {!ended && nfc === 'on' ? <Text style={s.tapHint}>Or touch the back of your phone to theirs.</Text> : null}
                        {!ended && nfc === 'off' ? <Pressable onPress={openNfcSettings}><Text style={s.link}>Turn on NFC to let them tap</Text></Pressable> : null}
                        {!ended ? (
                            <View style={s.row}>
                                <Pressable style={s.pill} onPress={share}><Share2 size={15} color={colors.blue} /><Text style={s.pillText}>Share</Text></Pressable>
                                <Pressable style={s.pill} onPress={copy}>{copied ? <Check size={15} color={colors.blue} /> : <Copy size={15} color={colors.blue} />}<Text style={s.pillText}>{copied ? 'Copied' : 'Copy link'}</Text></Pressable>
                            </View>
                        ) : null}
                        <Pressable onPress={async () => { try { await tapService.cancel(req.id); } catch { /* already over */ } again(); }}><Text style={s.link}>{ended ? 'Make a new request' : 'Cancel request'}</Text></Pressable>
                    </View>
                ) : (
                    <View style={s.card}>
                        <Text style={s.title}>How much?</Text>
                        <TextInput style={s.input} value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))} keyboardType="decimal-pad" placeholder="Any amount (they type it)" placeholderTextColor={colors.textFaint} />
                        <TextInput style={s.input} value={note} onChangeText={setNote} placeholder="What for? (optional)" placeholderTextColor={colors.textFaint} maxLength={140} />
                        <View style={s.row}>
                            {(['TAP', 'LINK'] as const).map((k) => (
                                <Pressable key={k} onPress={() => setKind(k)} style={[s.chip, kind === k && s.chipOn]}><Text style={[s.chipText, kind === k && { color: '#FFFFFF' }]}>{k === 'TAP' ? 'In person (2 min)' : 'Send a link (24 h)'}</Text></Pressable>
                            ))}
                        </View>
                        {error ? <Text style={s.error}>{error}</Text> : null}
                        <Pressable style={[s.btn, busy && { opacity: 0.6 }]} disabled={busy} onPress={make}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.btnText}>Make request</Text>}</Pressable>
                        <Text style={s.hint}>Who can pay you is set in Settings → Tap to receive ({mode === 'EVERYONE' ? 'Everyone' : 'My contacts'}).</Text>
                    </View>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    scroll: { padding: 20, paddingBottom: 48 },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, gap: 12, borderWidth: 1, borderColor: colors.border },
    title: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text, textAlign: 'center' },
    big: { fontFamily: fonts.bodyBold, fontSize: 24, color: colors.text },
    sub: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 19, textAlign: 'center' },
    hint: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, textAlign: 'center', lineHeight: 16 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 14, fontFamily: fonts.body, fontSize: 15, color: colors.text, backgroundColor: '#fff' },
    row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
    chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
    chipText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.text },
    btn: { backgroundColor: colors.blue, borderRadius: radius.pill, paddingVertical: 15, paddingHorizontal: 28, alignItems: 'center', alignSelf: 'stretch' },
    btnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
    qrBox: { padding: 16, backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: colors.border },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EAF1FF', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
    pillText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue },
    tapHint: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#137333', textAlign: 'center' },
    link: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue, paddingVertical: 6 },
    error: { fontFamily: fonts.body, fontSize: 12, color: '#B31412', backgroundColor: '#FCE8E6', borderRadius: radius.md, padding: 12, textAlign: 'center' },
});

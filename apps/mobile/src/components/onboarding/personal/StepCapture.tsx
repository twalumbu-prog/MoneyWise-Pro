import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, AppState, TextInput, ActivityIndicator, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckCircle2, Circle, MessageSquareText, ShieldCheck, Zap } from 'lucide-react-native';
import { momoCaptureService, type MomoDiagnosis } from 'core';
import { PersonalStepShell } from './PersonalStepShell';
import type { StepContext } from './stepContext';
import {
    androidCaptureAvailable, iosIntentAvailable, iosCaptureAvailable, getAndroidStatus, getIosStatus, setAndroidSources,
    requestSmsPermission, openNotificationAccessSettings, connectIphone,
} from '../../../lib/momoCapture';
import { fmtK } from './moneyUi';
import { colors, fonts, radius } from '../../../theme/tokens';

/**
 * Step "capture": turn mobile money confirmation messages into transactions.
 *   Android — notification access (no restricted permission) and, in builds that include it, SMS. The state shown is
 *             read back from the phone when the person returns from Settings, not assumed from the tap.
 *   iPhone  — connect this iPhone (capture key into the Keychain), then the existing 5-tap Shortcuts guide.
 * A message tester shows what MoneyWise would read from any pasted message, without booking it.
 */
const PROVIDER_LABEL: Record<string, string> = { MTN: 'MTN', AIRTEL: 'Airtel', ZAMTEL: 'Zamtel' };

export function StepCapture({ ctx }: { ctx: StepContext }) {
    const router = useRouter();
    const momo = (ctx.money?.accounts ?? []).filter((a) => a.providerType === 'MOBILE_MONEY');
    const names = [...new Set(momo.map((a) => PROVIDER_LABEL[a.providerCode ?? ''] ?? a.name))];
    const title = names.length ? `Keep ${names.join(' and ')} up to date automatically` : ctx.def.title;

    const [android, setAndroid] = useState(() => (ctx.preview ? null : getAndroidStatus()));
    const [ios, setIos] = useState(() => (ctx.preview ? null : getIosStatus()));
    const [previewOn, setPreviewOn] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [guideOpened, setGuideOpened] = useState(false);
    const [autoPost, setAutoPost] = useState(false);
    const [testText, setTestText] = useState('');
    const [test, setTest] = useState<MomoDiagnosis | null>(null);
    const [testing, setTesting] = useState(false);

    const reread = useCallback(() => {
        if (ctx.preview) return;
        setAndroid(getAndroidStatus());
        setIos(getIosStatus());
    }, [ctx.preview]);

    // Coming back from Settings / Shortcuts: read the real state again.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (s) => { if (s === 'active') reread(); });
        return () => sub.remove();
    }, [reread]);

    const supported = ctx.preview || (Platform.OS === 'android' ? androidCaptureAvailable : iosCaptureAvailable);
    const androidOn = !!android && (android.notificationAccess || android.smsPermission);
    const iosOn = !!ios?.hasToken;
    const connected = ctx.preview ? previewOn : Platform.OS === 'android' ? androidOn : iosOn;

    const act = async (fn: () => Promise<void>) => {
        setBusy(true); setErr(null);
        try { await fn(); } catch (e: any) { setErr(e?.message || 'Something went wrong. Try again.'); } finally { setBusy(false); reread(); }
    };

    const androidNotifications = () => act(async () => {
        if (ctx.preview) { setPreviewOn(true); return; }
        await setAndroidSources({ notifications: true, sms: !!android?.smsPermission });
        openNotificationAccessSettings();
    });
    const androidSms = () => act(async () => {
        if (ctx.preview) { setPreviewOn(true); return; }
        const r = await requestSmsPermission();
        if (r === 'granted') await setAndroidSources({ notifications: !!android?.notificationAccess, sms: true });
        else if (r === 'blocked') setErr('SMS access is off for MoneyWise. Turn it on in Settings → Apps → MoneyWise → Permissions, or use notifications instead.');
    });
    const iphoneConnect = () => act(async () => {
        if (ctx.preview) { setPreviewOn(true); return; }
        await connectIphone();
    });
    const openGuide = () => {
        setGuideOpened(true);
        if (!ctx.preview) router.push('/settings/momo-capture-setup?mode=ios');
    };

    const runTest = async () => {
        setTesting(true); setTest(null);
        try {
            if (ctx.preview) {
                await new Promise((r) => setTimeout(r, 400));
                const amt = Number(/(?:ZMW|K)\s?([\d,]+(?:\.\d{1,2})?)/i.exec(testText)?.[1]?.replace(/,/g, '') ?? 0);
                setTest(amt ? { kind: 'TRANSACTION', parsed: { provider: /airtel/i.test(testText) ? 'AIRTEL' : 'MTN', direction: /received/i.test(testText) ? 'IN' : 'OUT', amount: amt, fee: null, balanceAfter: null, counterparty: null, reference: null } } : { kind: 'IGNORED', reason: 'No amount found', sensitive: false });
            } else {
                setTest(await momoCaptureService.testParse(testText));
            }
        } catch (e: any) {
            setTest({ kind: 'IGNORED', reason: e?.message || 'Could not read it', sensitive: false });
        } finally {
            setTesting(false);
        }
    };

    const finish = () => void ctx.run('continue', async () => {
        if (!ctx.preview && autoPost) await momoCaptureService.updateSettings({ autoPost: true }).catch(() => undefined);
        return ctx.service.saveStep('capture', 'done', { platform: Platform.OS, autoPost });
    });

    return (
        <PersonalStepShell
            def={{ ...ctx.def, title }} progress={ctx.progress} onBack={ctx.onBack} onSkip={ctx.skip}
            onContinue={finish} continueDisabled={!connected} saving={ctx.saving} error={ctx.error ?? err}
            continueLabel={ctx.single ? 'Done' : 'Continue'}
        >
            <View style={styles.privacy}>
                <ShieldCheck size={20} color={colors.positiveInk} />
                <Text style={styles.privacyText}>Only messages from MTN, Airtel and Zamtel are read. Nothing else leaves your phone.</Text>
            </View>

            {!supported ? (
                <Text style={styles.muted}>This version of the app can’t capture messages yet. Update MoneyWise, then turn this on from Settings.</Text>
            ) : Platform.OS === 'android' && !ctx.preview ? (
                <View style={{ gap: 12, marginTop: 20 }}>
                    <Item done={!!android?.notificationAccess} title="Read money notifications" body="Works with any SMS app. You’ll switch MoneyWise on in Android settings, then come back here." action="Turn on" onPress={androidNotifications} busy={busy} />
                    <Item done={!!android?.smsPermission} title="Read money SMS" body="Also catches messages that arrive while notifications are muted." action="Allow" onPress={androidSms} busy={busy} />
                </View>
            ) : (
                <View style={{ gap: 12, marginTop: 20 }}>
                    <Item done={connected} title="Connect this iPhone" body="Gives the MoneyWise Shortcuts action a private key. Nothing to copy or paste." action="Connect" onPress={iphoneConnect} busy={busy} />
                    {(iosIntentAvailable || ctx.preview) && (
                        <Item done={guideOpened} disabled={!connected} title="Add the automation in Shortcuts" body="5 taps: when a message contains “ZMW”, run “Capture mobile money message”. Takes about a minute." action="Show me" onPress={openGuide} busy={false} />
                    )}
                </View>
            )}

            {connected && (
                <View style={styles.autoRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle}>Book automatically</Text>
                        <Text style={styles.itemBody}>Off: captured messages wait for you in Review captured.</Text>
                    </View>
                    <Switch value={autoPost} onValueChange={setAutoPost} accessibilityLabel="Book automatically" />
                </View>
            )}

            <Text style={styles.section}>Try it with a message</Text>
            <View style={styles.testBox}>
                <MessageSquareText size={18} color={colors.textMuted} />
                <TextInput
                    value={testText}
                    onChangeText={(t) => { setTestText(t); setTest(null); }}
                    placeholder="Paste any MoMo or Airtel Money message"
                    placeholderTextColor={colors.textFaint}
                    multiline
                    style={styles.testInput}
                    accessibilityLabel="Message to test"
                />
            </View>
            <Pressable onPress={() => void runTest()} disabled={!testText.trim() || testing} style={[styles.testBtn, !testText.trim() && { opacity: 0.5 }]} accessibilityRole="button">
                {testing ? <ActivityIndicator color={colors.blue} /> : <Text style={styles.testBtnText}>Test</Text>}
            </Pressable>
            {test && (
                <View style={styles.result} accessibilityLiveRegion="polite">
                    {test.kind === 'TRANSACTION' ? (
                        <>
                            <Zap size={18} color={colors.blue} />
                            <Text style={styles.resultText}>
                                {test.parsed.direction === 'IN' ? 'Money in' : 'Money out'} {fmtK(test.parsed.amount)} · {PROVIDER_LABEL[test.parsed.provider] ?? test.parsed.provider}
                                {test.parsed.counterparty ? ` · ${test.parsed.counterparty}` : ''}. Nothing was booked.
                            </Text>
                        </>
                    ) : test.kind === 'BALANCE' ? (
                        <Text style={styles.resultText}>A balance message: {fmtK(test.balance.balance)}. MoneyWise compares these with your account.</Text>
                    ) : (
                        <Text style={styles.resultText}>MoneyWise would ignore this: {test.reason}.</Text>
                    )}
                </View>
            )}
        </PersonalStepShell>
    );
}

function Item({ done, title, body, action, onPress, busy, disabled }: { done: boolean; title: string; body: string; action: string; onPress: () => void; busy: boolean; disabled?: boolean }) {
    return (
        <View style={[styles.item, disabled && { opacity: 0.5 }]}>
            {done ? <CheckCircle2 size={22} color={colors.positive} /> : <Circle size={22} color={colors.textFaint} />}
            <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{title}</Text>
                <Text style={styles.itemBody}>{body}</Text>
            </View>
            {!done && (
                <Pressable onPress={onPress} disabled={busy || disabled} style={styles.itemBtn} accessibilityRole="button" accessibilityLabel={`${action}: ${title}`}>
                    {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.itemBtnText}>{action}</Text>}
                </Pressable>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    privacy: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 14, borderRadius: radius.md, backgroundColor: '#ECFDF5' },
    privacyText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text },
    muted: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginTop: 20 },
    item: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong },
    itemTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    itemBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: 2 },
    itemBtn: { minHeight: 38, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    itemBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
    autoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
    section: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textMuted, marginTop: 28, marginBottom: 10 },
    testBox: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong },
    testInput: { flex: 1, minHeight: 60, fontFamily: fonts.body, fontSize: 14, color: colors.text, textAlignVertical: 'top' },
    testBtn: { alignSelf: 'flex-start', marginTop: 10, minHeight: 40, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
    testBtnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.blue },
    result: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 12, padding: 12, borderRadius: radius.md, backgroundColor: '#F4F8FF' },
    resultText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.text },
});

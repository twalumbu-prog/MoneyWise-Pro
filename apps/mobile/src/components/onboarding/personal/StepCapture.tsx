import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, AppState, ActivityIndicator, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckCircle2, Circle, ShieldCheck } from 'lucide-react-native';
import { momoCaptureService } from 'core';
import { PersonalStepShell } from './PersonalStepShell';
import type { StepContext } from './stepContext';
import {
    androidCaptureAvailable, iosIntentAvailable, iosCaptureAvailable, getAndroidStatus, getIosStatus, setAndroidSources,
    requestSmsPermission, openNotificationAccessSettings, connectIphone, isIosShortcutSetUp,
} from '../../../lib/momoCapture';
import { colors, fonts, radius } from '../../../theme/tokens';

/**
 * Step "capture": turn mobile money confirmation messages into transactions.
 *   Android — notification access (no restricted permission) and, in builds that include it, SMS. The state shown is
 *             read back from the phone when the person returns from Settings, not assumed from the tap.
 *   iPhone  — connect this iPhone (capture key into the Keychain), then the guided Shortcuts setup (/capture-guide).
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

    const reread = useCallback(() => {
        if (ctx.preview) return;
        setAndroid(getAndroidStatus());
        setIos(getIosStatus());
        if (Platform.OS === 'ios') void isIosShortcutSetUp().then((done) => { if (done) setGuideOpened(true); });
    }, [ctx.preview]);

    useEffect(() => { reread(); }, [reread]);

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
        router.push('/capture-guide' as any);
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
                <ShieldCheck size={20} color={colors.textMuted} />
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
                    <Item done={connected} title="Connect this iPhone" body="So MoneyWise can read your mobile money messages and keep your balance up to date." action="Connect" onPress={iphoneConnect} busy={busy} />
                    {(iosIntentAvailable || ctx.preview) && (
                        <Item done={guideOpened} disabled={!connected} title="Add the automation" body="About a minute in the Shortcuts app. We’ll show you every tap." action="Start" onPress={openGuide} busy={false} />
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
    privacy: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 14, borderRadius: radius.md, backgroundColor: '#F3F4F6' },
    privacyText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text },
    muted: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginTop: 20 },
    item: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong },
    itemTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    itemBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: 2 },
    itemBtn: { minHeight: 38, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    itemBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
    autoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
});

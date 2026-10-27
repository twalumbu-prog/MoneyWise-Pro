import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, AppState, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, MessageSquare, Workflow, ShieldCheck, CheckCircle2, History } from 'lucide-react-native';
import { momoCaptureService } from 'core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { PrimaryButton, GhostButton } from '../../src/components/onboarding/ui';
import { colors, fonts, radius } from '../../src/theme/tokens';
import { useGoBack } from '../../src/hooks/useGoBack';
import {
    getAndroidStatus, setAndroidSources, requestSmsPermission, openNotificationAccessSettings, openAppSettings,
    importSmsHistory, installIosShortcut, openShortcutsApp, markIosShortcutSetUp, MOMO_SETTINGS_KEY,
} from '../../src/lib/momoCapture';

type Mode = 'notifications' | 'sms' | 'ios';

/**
 * The walkthrough a capture source goes through the first time it's switched on: what MoneyWise will read (Google Play
 * requires this disclosure before the permission prompt), the permission itself, and a finish step. Android steps
 * re-check the permission when the person comes back from system settings, so there's no "I did it" guesswork.
 */
export default function MomoCaptureSetupScreen() {
    const { mode: raw } = useLocalSearchParams<{ mode?: string }>();
    const mode: Mode = raw === 'sms' || raw === 'ios' ? raw : 'notifications';
    const insets = useSafeAreaInsets();
    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title={mode === 'ios' ? 'Set up on iPhone' : mode === 'sms' ? 'SMS capture' : 'Notification capture'} />
            <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}>
                {mode === 'ios' ? <IosFlow /> : mode === 'sms' ? <SmsFlow /> : <NotificationsFlow />}
            </ScrollView>
        </View>
    );
}

// ── Android: notification access ────────────────────────────────────────────

function NotificationsFlow() {
    const back = useGoBack();
    const qc = useQueryClient();
    const [step, setStep] = useState<'intro' | 'waiting' | 'done'>('intro');
    const [busy, setBusy] = useState(false);

    const check = useCallback(async () => {
        const s = getAndroidStatus();
        if (!s?.notificationAccess) return false;
        setBusy(true);
        try {
            await setAndroidSources({ notifications: true, sms: s.smsEnabled });
            void qc.invalidateQueries({ queryKey: MOMO_SETTINGS_KEY });
            setStep('done');
        } catch (e: any) { Alert.alert('Could not turn on capture', e.message); }
        finally { setBusy(false); }
        return true;
    }, [qc]);

    useReturnFromSettings(step === 'waiting', check);

    if (step === 'done') return (
        <Done
            title="Notification capture is on"
            body="The next mobile money SMS you receive will appear in Review captured within a few seconds, even if MoneyWise is closed."
            onDone={back}
        />
    );

    return (
        <>
            <Hero icon={<Bell size={28} color={colors.blue} />} title="Capture from notifications" body="MoneyWise picks up mobile money confirmations as they arrive, so you don’t have to type them in." />
            <Disclosure points={[
                'Only notifications from your Messages app are checked, and only those from MTN, Airtel or Zamtel that mention an amount are read.',
                'Those messages are sent to MoneyWise to book the transaction. Other notifications are never read or sent.',
                'You can switch this off any time in Preferences.',
            ]} />
            <Steps items={[
                'Tap Open settings below.',
                'Find MoneyWise Pro in the list and switch it on.',
                'Android shows a warning about notification access. Tap Allow.',
                'Come back here. We’ll check it worked.',
            ]} />
            {step === 'waiting' && <Text style={styles.waiting}>Waiting for access… switch MoneyWise Pro on, then come back.</Text>}
            <PrimaryButton loading={busy} onPress={() => { setStep('waiting'); openNotificationAccessSettings(); }}>Open settings</PrimaryButton>
            {step === 'waiting' && <GhostButton onPress={() => { void check().then((ok) => { if (!ok) Alert.alert('Not on yet', 'MoneyWise Pro isn’t switched on in Notification access yet.'); }); }}>I’ve switched it on</GhostButton>}
        </>
    );
}

// ── Android: SMS ────────────────────────────────────────────────────────────

function SmsFlow() {
    const back = useGoBack();
    const qc = useQueryClient();
    const [step, setStep] = useState<'intro' | 'blocked' | 'import' | 'done'>('intro');
    const [busy, setBusy] = useState(false);
    const [imported, setImported] = useState<number | null>(null);

    const enable = useCallback(async () => {
        const s = getAndroidStatus();
        await setAndroidSources({ notifications: !!s?.notificationsEnabled, sms: true });
        void qc.invalidateQueries({ queryKey: MOMO_SETTINGS_KEY });
        setStep('import');
    }, [qc]);

    const ask = async () => {
        setBusy(true);
        try {
            const res = await requestSmsPermission();
            if (res === 'granted') await enable();
            else if (res === 'blocked') setStep('blocked');
            else Alert.alert('SMS access not allowed', 'MoneyWise needs SMS access to read mobile money messages. You can use notification capture instead.');
        } catch (e: any) { Alert.alert('Could not turn on SMS capture', e.message); }
        finally { setBusy(false); }
    };

    useReturnFromSettings(step === 'blocked', async () => {
        if (!getAndroidStatus()?.smsPermission) return false;
        await enable();
        return true;
    });

    const runImport = async () => {
        setBusy(true);
        try { setImported(await importSmsHistory(30)); setStep('done'); }
        catch (e: any) { Alert.alert('Import failed', e.message); }
        finally { setBusy(false); }
    };

    if (step === 'import') return (
        <>
            <Hero icon={<History size={28} color={colors.blue} />} title="Bring in past messages?" body="MoneyWise can pick up the mobile money messages already on your phone from the last 30 days. You review them before anything is booked, and payments already in MoneyWise are skipped." />
            <PrimaryButton loading={busy} onPress={runImport}>Import last 30 days</PrimaryButton>
            <GhostButton onPress={() => setStep('done')}>Not now</GhostButton>
        </>
    );
    if (step === 'done') return (
        <Done
            title="SMS capture is on"
            body={imported == null
                ? 'New mobile money SMS will appear in Review captured as they arrive.'
                : imported === 0 ? 'No mobile money messages from the last 30 days were found. New ones will appear in Review captured as they arrive.'
                : `${imported} past message${imported === 1 ? '' : 's'} sent for review. They’ll be in Review captured in a moment.`}
            onDone={back}
        />
    );

    return (
        <>
            <Hero icon={<MessageSquare size={28} color={colors.blue} />} title="Capture from SMS" body="Reads mobile money confirmation SMS directly. Works even when notifications are silenced, and can import messages you already have." />
            <Disclosure points={[
                'MoneyWise checks the sender of each SMS. Only messages from MTN, Airtel or Zamtel that mention an amount are read.',
                'Those messages are sent to MoneyWise to book the transaction. Personal messages are never read or sent.',
                'You can switch this off any time in Preferences.',
            ]} />
            {step === 'blocked' ? (
                <>
                    <Steps items={['Tap Open app settings.', 'Go to Permissions → SMS.', 'Choose Allow, then come back here.']} />
                    <PrimaryButton onPress={openAppSettings}>Open app settings</PrimaryButton>
                </>
            ) : (
                <PrimaryButton loading={busy} onPress={ask}>Allow SMS access</PrimaryButton>
            )}
        </>
    );
}

// ── iOS: Shortcuts automation ───────────────────────────────────────────────

function IosFlow() {
    const back = useGoBack();
    const qc = useQueryClient();
    const [step, setStep] = useState<'intro' | 'install' | 'automation' | 'verify' | 'done'>('intro');
    const [busy, setBusy] = useState(false);
    const [heard, setHeard] = useState(false);
    const startedAt = useRef(Date.now());

    // While on the last step, watch for the first message the shortcut delivers.
    useEffect(() => {
        if (step !== 'verify') return;
        const t = setInterval(async () => {
            try {
                const s = await momoCaptureService.getSettings();
                if (s.lastCaptureSource === 'IOS_SHORTCUT' && s.lastCaptureAt && new Date(s.lastCaptureAt).getTime() > startedAt.current) setHeard(true);
            } catch { /* keep waiting */ }
        }, 5000);
        return () => clearInterval(t);
    }, [step]);

    const install = async () => {
        setBusy(true);
        try { startedAt.current = Date.now(); await installIosShortcut(); setStep('automation'); }
        catch (e: any) { Alert.alert('Could not open the shortcut', e.message); }
        finally { setBusy(false); }
    };

    const finish = async () => {
        await markIosShortcutSetUp(true);
        void qc.invalidateQueries({ queryKey: MOMO_SETTINGS_KEY });
        setStep('done');
    };

    if (step === 'done') return (
        <Done title="You’re all set" body="Mobile money messages on this iPhone now go to Review captured automatically. If you change phones, run this setup again." onDone={back} />
    );

    if (step === 'intro') return (
        <>
            <Hero icon={<Workflow size={28} color={colors.blue} />} title="Capture on iPhone" body="Apple doesn’t let apps read your messages, so iPhone uses a Shortcuts automation that you set up once. It takes about two minutes." />
            <Disclosure points={[
                'The automation only runs on messages containing “ZMW”, and MoneyWise ignores anything that isn’t a mobile money transaction.',
                'It uses a private capture key that can only add messages to your account. Turning capture off cancels the key.',
            ]} />
            <PrimaryButton onPress={() => setStep('install')}>Start</PrimaryButton>
        </>
    );

    if (step === 'install') return (
        <>
            <StepHeader n={1} of={3} title="Add the MoneyWise shortcut" />
            <Steps items={[
                'Tap Add shortcut. We copy your capture key and open the shortcut.',
                'Tap Set Up Shortcut. When it asks for your MoneyWise capture key, tap the box and choose Paste.',
                'Tap Add Shortcut, then come back to MoneyWise.',
            ]} />
            <PrimaryButton loading={busy} onPress={install}>Add shortcut</PrimaryButton>
        </>
    );

    if (step === 'automation') return (
        <>
            <StepHeader n={2} of={3} title="Run it when a message arrives" />
            <Steps items={[
                'Open Shortcuts and tap the Automation tab.',
                'Tap + (New Automation), then choose Message.',
                'Leave Sender empty. Under Message Contains, type ZMW.',
                'Choose Run Immediately, so it runs without asking each time. Tap Next.',
                'Choose MoneyWise MoMo Capture. That’s it.',
            ]} />
            <Text style={styles.tip}>Tip: if your provider writes amounts as “K 50” instead of “ZMW 50”, add a second automation the same way with Message Contains set to Bal.</Text>
            <PrimaryButton onPress={openShortcutsApp}>Open Shortcuts</PrimaryButton>
            <GhostButton onPress={() => setStep('verify')}>I’ve added the automation</GhostButton>
        </>
    );

    return (
        <>
            <StepHeader n={3} of={3} title="Check it works" />
            <View style={styles.verifyCard}>
                {heard ? <CheckCircle2 size={28} color={colors.positiveInk} /> : <ActivityIndicator color={colors.blue} />}
                <Text style={styles.verifyText}>
                    {heard ? 'Message received. Capture is working.' : 'Waiting for your next mobile money message… You can leave this screen. It will still work.'}
                </Text>
            </View>
            <PrimaryButton onPress={finish}>{heard ? 'Finish' : 'Finish without testing'}</PrimaryButton>
            <GhostButton onPress={() => setStep('install')}>Start again</GhostButton>
        </>
    );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** Re-checks when the app returns to the foreground (the person was in system settings). */
function useReturnFromSettings(active: boolean, check: () => Promise<boolean>) {
    const ref = useRef(check);
    ref.current = check;
    useEffect(() => {
        if (!active) return;
        const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void ref.current(); });
        return () => sub.remove();
    }, [active]);
}

const Hero: React.FC<{ icon: React.ReactNode; title: string; body: string }> = ({ icon, title, body }) => (
    <View style={styles.hero}>
        <View style={styles.heroIcon}>{icon}</View>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroBody}>{body}</Text>
    </View>
);

const Disclosure: React.FC<{ points: string[] }> = ({ points }) => (
    <View style={styles.disclosure}>
        <View style={styles.disclosureHead}><ShieldCheck size={16} color={colors.positiveInk} /><Text style={styles.disclosureTitle}>What MoneyWise reads</Text></View>
        {points.map((p) => <Text key={p} style={styles.disclosurePoint}>• {p}</Text>)}
    </View>
);

const StepHeader: React.FC<{ n: number; of: number; title: string }> = ({ n, of, title }) => (
    <View style={{ marginBottom: 16 }}>
        <Text style={styles.stepOf}>STEP {n} OF {of}</Text>
        <Text style={styles.heroTitle}>{title}</Text>
    </View>
);

const Steps: React.FC<{ items: string[] }> = ({ items }) => (
    <View style={styles.steps}>
        {items.map((t, i) => (
            <View key={t} style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                <Text style={styles.stepText}>{t}</Text>
            </View>
        ))}
    </View>
);

const Done: React.FC<{ title: string; body: string; onDone: () => void }> = ({ title, body, onDone }) => (
    <>
        <Hero icon={<CheckCircle2 size={30} color={colors.positiveInk} />} title={title} body={body} />
        <PrimaryButton onPress={onDone}>Done</PrimaryButton>
    </>
);

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    scroll: { padding: 20, gap: 12 },
    hero: { alignItems: 'center', paddingVertical: 12, marginBottom: 4 },
    heroIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.tabActiveBg, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    heroTitle: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.text, textAlign: 'center' },
    heroBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, lineHeight: 20, textAlign: 'center', marginTop: 6 },
    disclosure: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 6 },
    disclosureHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    disclosureTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    disclosurePoint: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
    steps: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 12 },
    stepRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    stepNumText: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#FFFFFF' },
    stepText: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text, lineHeight: 20 },
    stepOf: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.8, color: colors.blue, textAlign: 'center', marginBottom: 4 },
    waiting: { fontFamily: fonts.body, fontSize: 13, color: colors.warn, textAlign: 'center' },
    tip: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17, marginHorizontal: 4 },
    verifyCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 20, alignItems: 'center', gap: 12 },
    verifyText: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});

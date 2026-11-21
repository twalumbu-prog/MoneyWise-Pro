import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, AppState, ActivityIndicator, Linking, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { Bell, Lock, CheckCircle2 } from 'lucide-react-native';
import { userService } from 'core';
import { PersonalStepShell } from './PersonalStepShell';
import type { StepContext } from './stepContext';
import { useAppLock } from '../../../context/AppLockContext';
import { registerForPushNotificationsAsync } from '../../../lib/pushNotifications';
import { biometricLabel } from '../../../lib/appLock';
import { colors, fonts, radius } from '../../../theme/tokens';

/**
 * Step "reminders": notifications (bill reminders, money in) and app lock (PIN, optionally Face ID / fingerprint).
 * Each permission is asked only when its button is tapped. App lock reuses Settings → Security for the PIN; the state
 * shown is read back when the person returns.
 */
export function StepReminders({ ctx }: { ctx: StepContext }) {
    const router = useRouter();
    const lock = useAppLock();
    const [notif, setNotif] = useState<'granted' | 'denied' | 'undetermined' | null>(null);
    const [busy, setBusy] = useState(false);
    const [previewLock, setPreviewLock] = useState(false);

    const read = useCallback(async () => {
        if (ctx.preview) { setNotif((n) => n ?? 'undetermined'); return; }
        try { setNotif((await Notifications.getPermissionsAsync()).status as any); } catch { setNotif('undetermined'); }
        void lock.refresh().catch(() => undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctx.preview]);
    useEffect(() => { void read(); }, [read]);
    useEffect(() => {
        const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void read(); });
        return () => sub.remove();
    }, [read]);

    const turnOnNotifications = async () => {
        if (notif === 'denied') { void Linking.openSettings(); return; }
        setBusy(true);
        try {
            if (ctx.preview) { setNotif('granted'); return; }
            const r = await registerForPushNotificationsAsync();
            if (r) await userService.registerPushToken(r.token, r.platform).catch(() => undefined);
            await read();
        } finally { setBusy(false); }
    };

    const lockOn = ctx.preview ? previewLock : lock.config.enabled;
    const bio = biometricLabel(lock.biometric.kind, Platform.OS === 'ios');

    return (
        <PersonalStepShell def={ctx.def} progress={ctx.progress} onBack={ctx.onBack} onSkip={ctx.skip} onContinue={() => ctx.done({ notifications: notif === 'granted', appLock: lockOn })} saving={ctx.saving} error={ctx.error} continueLabel={ctx.single ? 'Done' : 'Continue'}>
            <View style={{ gap: 12 }}>
                <Card
                    icon={<Bell size={22} color={colors.blue} />}
                    title="Reminders"
                    body="A nudge before each bill is due, and when money comes in."
                    done={notif === 'granted'}
                    action={notif === 'denied' ? 'Turn on in Settings' : 'Turn on'}
                    onPress={() => void turnOnNotifications()}
                    busy={busy || notif === null}
                />
                <Card
                    icon={<Lock size={22} color={colors.blue} />}
                    title="App lock"
                    body={`A 4-digit PIN${lock.biometric.available ? `, or ${bio},` : ''} to open MoneyWise, even if your phone is unlocked.`}
                    done={lockOn}
                    action="Set up"
                    onPress={() => (ctx.preview ? setPreviewLock(true) : router.push('/settings/security'))}
                    busy={false}
                />
            </View>
        </PersonalStepShell>
    );
}

function Card({ icon, title, body, done, action, onPress, busy }: { icon: React.ReactNode; title: string; body: string; done: boolean; action: string; onPress: () => void; busy: boolean }) {
    return (
        <View style={styles.card}>
            <View style={styles.icon}>{icon}</View>
            <View style={{ flex: 1 }}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.body}>{body}</Text>
            </View>
            {done ? <CheckCircle2 size={24} color={colors.positive} accessibilityLabel={`${title} is on`} /> : (
                <Pressable onPress={onPress} disabled={busy} style={styles.btn} accessibilityRole="button" accessibilityLabel={`${action}: ${title}`}>
                    {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.btnText}>{action}</Text>}
                </Pressable>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong },
    icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
    title: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
    body: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: 2 },
    btn: { minHeight: 38, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    btnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
});

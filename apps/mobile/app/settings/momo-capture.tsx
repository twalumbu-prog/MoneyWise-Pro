import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Switch, Alert, Platform, AppState, ActivityIndicator } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, MessageSquare, Workflow, Inbox, ChevronRight, Check, ClipboardPaste, Unplug } from 'lucide-react-native';
import { momoCaptureService } from 'core';
import type { MomoCaptureSettings } from 'core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';
import {
    androidCaptureAvailable, iosShortcutAvailable, getAndroidStatus, setAndroidSources, isIosShortcutSetUp, disconnectCapture, MOMO_SETTINGS_KEY,
} from '../../src/lib/momoCapture';

const SOURCE_LABEL: Record<string, string> = {
    ANDROID_SMS: 'SMS', ANDROID_NOTIFICATION: 'notification', IOS_SHORTCUT: 'Shortcut', PASTE: 'pasted message',
};

const ago = (iso: string | null) => {
    if (!iso) return null;
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
    return `${Math.round(m / 1440)} days ago`;
};

/**
 * Settings → Preferences → Mobile money capture. Turns each capture source on for this phone (a source that still
 * needs a permission goes through its setup walkthrough first), and holds the account-wide choices: review vs
 * auto-book, and which account captured money is booked to.
 */
export default function MomoCaptureSettingsScreen() {
    const qc = useQueryClient();
    const settings = useQuery({ queryKey: MOMO_SETTINGS_KEY, queryFn: () => momoCaptureService.getSettings() });
    const [android, setAndroid] = useState(getAndroidStatus());
    const [iosDone, setIosDone] = useState(false);

    const refreshDevice = useCallback(() => {
        setAndroid(getAndroidStatus());
        void isIosShortcutSetUp().then(setIosDone);
        void qc.invalidateQueries({ queryKey: MOMO_SETTINGS_KEY });
    }, [qc]);

    useFocusEffect(refreshDevice);
    useEffect(() => {
        const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refreshDevice(); });
        return () => sub.remove();
    }, [refreshDevice]);

    const save = useMutation({
        mutationFn: (patch: Partial<Pick<MomoCaptureSettings, 'autoPost' | 'destination'>>) => momoCaptureService.updateSettings(patch),
        onSuccess: (data) => qc.setQueryData(MOMO_SETTINGS_KEY, data),
        onError: (e: Error) => Alert.alert('Could not save', e.message),
    });

    const toggleAndroid = async (source: 'notifications' | 'sms', on: boolean) => {
        const s = getAndroidStatus();
        if (!s) return;
        const ready = source === 'notifications' ? s.notificationAccess : s.smsPermission;
        // Switching on a source that lacks its permission = onboarding; it enables the source when it finishes.
        if (on && !ready) { router.push({ pathname: '/settings/momo-capture-setup', params: { mode: source } }); return; }
        try {
            await setAndroidSources({
                notifications: source === 'notifications' ? on : s.notificationsEnabled,
                sms: source === 'sms' ? on : s.smsEnabled,
            });
        } catch (e: any) { Alert.alert('Could not change capture', e.message); }
        refreshDevice();
    };

    const disconnect = () => Alert.alert(
        'Turn off capture?',
        'This stops capture on this phone and switches off your capture key, so any MoneyWise shortcut stops sending too. Messages already captured stay.',
        [{ text: 'Cancel', style: 'cancel' }, {
            text: 'Turn off', style: 'destructive',
            onPress: async () => { try { await disconnectCapture(); } catch (e: any) { Alert.alert('Could not turn off', e.message); } refreshDevice(); },
        }],
    );

    const s = settings.data;
    const lastSeen = s?.lastCaptureAt ? `Last message ${ago(s.lastCaptureAt)} by ${SOURCE_LABEL[s.lastCaptureSource ?? ''] ?? 'capture'}` : null;
    const anyOn = Platform.OS === 'android' ? !!(android?.notificationsEnabled || android?.smsEnabled) : iosDone;

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Mobile money capture" />
            <ScrollView contentContainerStyle={styles.scroll}>
                <Text style={styles.intro}>
                    Book MTN MoMo, Airtel Money and Zamtel Kwacha transactions automatically from the confirmation messages
                    on this phone. Only those messages are read. Payments already in MoneyWise through your wallet are never booked twice.
                </Text>

                <Text style={styles.sectionLabel}>ON THIS PHONE</Text>
                <View style={styles.card}>
                    {Platform.OS === 'android' ? (
                        androidCaptureAvailable ? (
                            <>
                                <Row
                                    icon={<Bell size={18} color={colors.blue} />} label="Notifications" badge="Recommended"
                                    sub={android?.notificationsEnabled && !android.notificationAccess ? 'Notification access was turned off. Tap to fix.' : 'Reads mobile money SMS alerts as they arrive'}
                                    warn={!!android?.notificationsEnabled && !android.notificationAccess}
                                    onPress={android?.notificationsEnabled && !android.notificationAccess ? () => router.push({ pathname: '/settings/momo-capture-setup', params: { mode: 'notifications' } }) : undefined}
                                    right={<Switch value={!!android?.notificationsEnabled && !!android.notificationAccess} onValueChange={(on) => toggleAndroid('notifications', on)} trackColor={{ true: colors.blue }} />}
                                />
                                <Row
                                    border icon={<MessageSquare size={18} color={colors.blue} />} label="SMS"
                                    sub="Reads mobile money SMS directly. Also lets you import past messages."
                                    right={<Switch value={!!android?.smsEnabled && !!android.smsPermission} onValueChange={(on) => toggleAndroid('sms', on)} trackColor={{ true: colors.blue }} />}
                                />
                            </>
                        ) : (
                            <Row icon={<Bell size={18} color={colors.textFaint} />} label="Update needed" sub="This version of MoneyWise can’t capture messages yet. Update the app from the Play Store." />
                        )
                    ) : (
                        <Row
                            icon={<Workflow size={18} color={colors.blue} />} label="Shortcuts automation"
                            sub={iosShortcutAvailable
                                ? (iosDone ? 'Set up. Your iPhone sends mobile money messages to MoneyWise.' : 'iPhone needs a one-time automation in the Shortcuts app.')
                                : 'Coming soon on iPhone. You can paste messages for now.'}
                            right={iosDone ? <Check size={18} color={colors.positiveInk} /> : <ChevronRight size={18} color={colors.textFaint} />}
                            onPress={iosShortcutAvailable ? () => router.push({ pathname: '/settings/momo-capture-setup', params: { mode: 'ios' } }) : undefined}
                        />
                    )}
                </View>
                {!!lastSeen && <Text style={styles.hint}>{lastSeen}.</Text>}
                {Platform.OS === 'android' && !!android?.queued && <Text style={styles.hint}>{android.queued} message(s) waiting for a connection.</Text>}

                <Text style={[styles.sectionLabel, { marginTop: 24 }]}>CAPTURED TRANSACTIONS</Text>
                <View style={styles.card}>
                    <Row
                        icon={<Inbox size={18} color={colors.blue} />} label="Review captured" onPress={() => router.push('/momo-captures')}
                        sub={s ? (s.pendingCount ? `${s.pendingCount} waiting for you to confirm` : 'Nothing waiting') : ' '}
                        right={<ChevronRight size={18} color={colors.textFaint} />}
                    />
                    <Row
                        border icon={<ClipboardPaste size={18} color={colors.blue} />} label="Paste a message"
                        sub="Copy a confirmation SMS and add it by hand" onPress={() => router.push({ pathname: '/momo-captures', params: { paste: '1' } })}
                        right={<ChevronRight size={18} color={colors.textFaint} />}
                    />
                </View>

                {settings.isLoading ? <ActivityIndicator style={{ marginTop: 24 }} color={colors.blue} /> : s ? (
                    <>
                        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>BOOKING</Text>
                        <View style={styles.card}>
                            <Row
                                label="Book automatically" sub="Off: each message waits in Review captured for you to confirm."
                                right={<Switch value={s.autoPost} onValueChange={(v) => save.mutate({ autoPost: v })} trackColor={{ true: colors.blue }} />}
                            />
                            <Choice border label="A separate account per provider" sub="MTN MoMo, Airtel Money… balances you can match to your phone" selected={s.destination === 'PROVIDER'} onPress={() => save.mutate({ destination: 'PROVIDER' })} />
                            <Choice border label="My Cash account" sub="Treat mobile money like cash in hand" selected={s.destination === 'CASH'} onPress={() => save.mutate({ destination: 'CASH' })} />
                        </View>
                    </>
                ) : null}

                {(anyOn || s?.hasToken) && (
                    <Pressable onPress={disconnect} style={({ pressed }) => [styles.danger, pressed && { opacity: 0.6 }]}>
                        <Unplug size={16} color={colors.danger} /><Text style={styles.dangerText}>Turn off capture</Text>
                    </Pressable>
                )}
            </ScrollView>
        </View>
    );
}

const Row: React.FC<{ icon?: React.ReactNode; label: string; sub?: string; badge?: string; warn?: boolean; right?: React.ReactNode; border?: boolean; onPress?: () => void }> = ({ icon, label, sub, badge, warn, right, border, onPress }) => (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, border && styles.rowBorder, pressed && onPress && { opacity: 0.6 }]}>
        {icon}
        <View style={styles.rowMain}>
            <View style={styles.labelLine}>
                <Text style={styles.rowLabel}>{label}</Text>
                {!!badge && <Text style={styles.badge}>{badge}</Text>}
            </View>
            {!!sub && <Text style={[styles.rowSub, warn && { color: colors.warn }]}>{sub}</Text>}
        </View>
        {right}
    </Pressable>
);

const Choice: React.FC<{ label: string; sub: string; selected: boolean; border?: boolean; onPress: () => void }> = ({ label, sub, selected, border, onPress }) => (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, border && styles.rowBorder, pressed && { opacity: 0.6 }]} accessibilityRole="radio" accessibilityState={{ selected }}>
        <View style={styles.rowMain}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowSub}>{sub}</Text>
        </View>
        <View style={[styles.radio, selected && styles.radioOn]}>{selected && <Check size={13} color="#FFFFFF" strokeWidth={3} />}</View>
    </Pressable>
);

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    scroll: { padding: 20, paddingBottom: 48 },
    intro: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 19, marginBottom: 20, marginHorizontal: 4 },
    sectionLabel: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.6, color: colors.textMuted, marginBottom: 8, marginLeft: 4 },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
    rowMain: { flex: 1, gap: 2 },
    labelLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowLabel: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    badge: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.positiveInk, backgroundColor: '#E7FBF2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden' },
    rowSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, lineHeight: 17 },
    hint: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 8, marginLeft: 4, lineHeight: 17 },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
    radioOn: { backgroundColor: colors.blue, borderColor: colors.blue },
    danger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28, paddingVertical: 12 },
    dangerText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.danger },
});

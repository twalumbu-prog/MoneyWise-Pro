import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Switch, Alert, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyRound, ScanFace, Fingerprint, Mail, ShieldCheck } from 'lucide-react-native';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { PinEntry } from '../../src/components/security/PinEntry';
import { PinSetupFlow, PinRecoveryFlow } from '../../src/components/security/PinFlows';
import { useAppLock } from '../../src/context/AppLockContext';
import { useAuth } from '../../src/context/AuthContext';
import { verifyPin, promptBiometric, biometricLabel } from '../../src/lib/appLock';
import { colors, fonts, radius } from '../../src/theme/tokens';

type Mode = 'home' | 'setup' | 'verify-change' | 'verify-off' | 'change' | 'recover';

/**
 * Settings → Security: a PIN that guards the app on this phone, optionally unlocked with Face ID / fingerprint, with
 * recovery by emailed code if the PIN is forgotten.
 */
export default function SecurityScreen() {
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    const uid = user?.id ?? '';
    const lock = useAppLock();
    const [mode, setMode] = useState<Mode>('home');
    const [error, setError] = useState<string | null>(null);
    const [errorKey, setErrorKey] = useState(0);
    const bioLabel = biometricLabel(lock.biometric.kind, Platform.OS === 'ios');
    const BioIcon = lock.biometric.kind === 'face' ? ScanFace : Fingerprint;

    const finish = async (justCreated = false) => {
        const cfg = await lock.refresh();
        lock.markUnlocked();
        setMode('home');
        setError(null);
        // Face ID / fingerprint is never switched on silently: right after a PIN is created, offer it (the system asks permission the first time).
        if (justCreated && cfg.enabled && !cfg.biometric && lock.biometric.available) {
            Alert.alert(`Unlock with ${bioLabel}?`, `Open MoneyWise with ${bioLabel} instead of typing your PIN. The PIN always works as a backup.`, [
                { text: 'Not now', style: 'cancel' },
                { text: `Use ${bioLabel}`, onPress: () => { void toggleBiometric(true); } },
            ]);
        }
    };

    /** Confirms the current PIN, then carries on to turning it off or choosing a new one. */
    const confirmCurrent = async (pin: string) => {
        const r = await verifyPin(uid, pin);
        if (!r.ok) {
            setErrorKey((k) => k + 1);
            setError(r.lockedForSeconds ? `Too many tries. Wait ${r.lockedForSeconds}s.` : r.attemptsLeft != null ? `Wrong PIN. ${r.attemptsLeft} left.` : 'Wrong PIN.');
            return;
        }
        setError(null);
        if (mode === 'verify-off') await turnOff(); else setMode('change');
    };

    const turnOff = async () => {
        await lock.disable();
        setMode('home');
        Alert.alert('PIN turned off', 'MoneyWise will open without asking for a PIN on this phone.');
    };

    const toggleBiometric = async (on: boolean) => {
        if (on) {
            const ok = await promptBiometric(`Turn on ${bioLabel} for MoneyWise`);
            if (!ok) return;
        }
        await lock.setBiometricEnabled(on);
    };

    const fullScreen = mode !== 'home';

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Security" />

            {fullScreen ? (
                <View style={[styles.flow, { paddingBottom: insets.bottom + 24 }]}>
                    {mode === 'setup' && <PinSetupFlow userId={uid} onDone={() => finish(true)} onCancel={() => setMode('home')} />}
                    {mode === 'change' && <PinSetupFlow userId={uid} title="Choose a new PIN" onDone={() => finish()} onCancel={() => setMode('home')} />}
                    {(mode === 'verify-change' || mode === 'verify-off') && (
                        <View style={{ alignItems: 'center' }}>
                            <PinEntry
                                title="Enter your current PIN"
                                subtitle={mode === 'verify-off' ? 'Confirm it’s you before turning the PIN off.' : 'Confirm it’s you before choosing a new PIN.'}
                                error={error} errorKey={errorKey}
                                onComplete={confirmCurrent}
                            />
                            <Pressable onPress={() => setMode('recover')} hitSlop={10} style={{ marginTop: 14 }}><Text style={styles.link}>Forgot PIN?</Text></Pressable>
                            <Pressable onPress={() => { setMode('home'); setError(null); }} hitSlop={10} style={{ marginTop: 16 }}><Text style={styles.link}>Cancel</Text></Pressable>
                        </View>
                    )}
                    {mode === 'recover' && <PinRecoveryFlow userId={uid} onRecovered={() => finish()} onCancel={() => setMode('home')} />}
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.scroll}>
                    <View style={styles.hero}>
                        <ShieldCheck size={56} strokeWidth={1.5} color={lock.config.enabled ? colors.positiveInk : colors.blue} />
                        <Text style={styles.heroTitle}>{lock.config.enabled ? 'App lock is on' : 'Protect MoneyWise with a PIN'}</Text>
                        <Text style={styles.heroSub}>
                            {lock.config.enabled
                                ? 'MoneyWise asks for your PIN when you open it and after it has been in the background for a while.'
                                : 'Set a 4-digit PIN so nobody else can open the app on this phone, even if it’s unlocked.'}
                        </Text>
                    </View>

                    <View style={styles.card}>
                        <Row
                            icon={<KeyRound size={18} color={colors.blue} />} label="App PIN" sub={lock.config.enabled ? 'On' : 'Off'}
                            right={<Switch value={lock.config.enabled} onValueChange={(on) => setMode(on ? 'setup' : 'verify-off')} trackColor={{ true: colors.blue }} />}
                        />
                        {lock.config.enabled && (
                            <Row icon={<KeyRound size={18} color={colors.blue} />} label="Change PIN" sub="Choose a new 4-digit PIN" border onPress={() => setMode('verify-change')} />
                        )}
                        {lock.config.enabled && (
                            <Row
                                icon={<BioIcon size={18} color={colors.blue} />} label={`Unlock with ${bioLabel}`}
                                sub={lock.biometric.available ? 'Skip the PIN when it’s you' : `Set up ${bioLabel} in your phone’s settings first`} border
                                right={<Switch value={lock.config.biometric} disabled={!lock.biometric.available} onValueChange={toggleBiometric} trackColor={{ true: colors.blue }} />}
                            />
                        )}
                    </View>

                    <View style={styles.card}>
                        <Row icon={<Mail size={18} color={colors.blue} />} label="PIN recovery" sub={`If you forget it, we email a code to ${maskEmail(user?.email)}`} />
                    </View>
                    <Text style={styles.footnote}>Your PIN is stored only on this phone, scrambled in its secure keychain. We never see it.</Text>
                </ScrollView>
            )}
        </View>
    );
}

const maskEmail = (e?: string | null) => {
    if (!e) return 'your account email';
    const [n, d] = e.split('@');
    return d ? `${n.slice(0, 2)}${'•'.repeat(Math.max(1, n.length - 2))}@${d}` : e;
};

const Row: React.FC<{ icon: React.ReactNode; label: string; sub?: string; right?: React.ReactNode; border?: boolean; onPress?: () => void }> = ({ icon, label, sub, right, border, onPress }) => (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, border && styles.rowBorder, pressed && !!onPress && { opacity: 0.6 }]}>
        {icon}
        <View style={styles.rowMain}>
            <Text style={styles.rowLabel}>{label}</Text>
            {!!sub && <Text style={styles.rowSub}>{sub}</Text>}
        </View>
        {right}
    </Pressable>
);

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    scroll: { padding: 20, paddingBottom: 48 },
    flow: { flex: 1, justifyContent: 'center', alignItems: 'stretch' },
    hero: { alignItems: 'center', paddingVertical: 12, marginBottom: 12 },
    heroTitle: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.navy, marginTop: 14, textAlign: 'center' },
    heroSub: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginTop: 6, textAlign: 'center', lineHeight: 20, paddingHorizontal: 12 },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: 16, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
    rowMain: { flex: 1, gap: 2 },
    rowLabel: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    rowSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, lineHeight: 17 },
    footnote: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, textAlign: 'center', paddingHorizontal: 20, lineHeight: 17 },
    link: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.blue },
});

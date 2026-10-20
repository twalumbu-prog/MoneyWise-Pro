import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScanFace, Fingerprint } from 'lucide-react-native';
import { useAuth } from './AuthContext';
import { PinEntry } from '../components/security/PinEntry';
import { PinRecoveryFlow } from '../components/security/PinFlows';
import {
    readLockConfig, verifyPin, clearPin, setBiometric, getBiometricInfo, promptBiometric, biometricLabel, type LockConfig, type BiometricInfo,
} from '../lib/appLock';
import { colors, fonts } from '../theme/tokens';

/** How long the app can sit in the background before it asks for the PIN again. */
const RELOCK_AFTER_MS = 30_000;

interface AppLockValue {
    config: LockConfig;
    biometric: BiometricInfo;
    /** Re-reads the saved settings (call after changing the PIN or biometrics in Settings). */
    refresh: () => Promise<LockConfig>;
    /** Turn the lock on for this session without asking again (just set a PIN). */
    markUnlocked: () => void;
    disable: () => Promise<void>;
    setBiometricEnabled: (on: boolean) => Promise<void>;
}

const AppLockContext = createContext<AppLockValue | undefined>(undefined);

export const useAppLock = (): AppLockValue => {
    const v = useContext(AppLockContext);
    if (!v) throw new Error('useAppLock must be used inside AppLockProvider');
    return v;
};

/**
 * Wraps the app. When the signed-in person has a PIN, covers everything with the lock screen on launch and whenever the
 * app returns from the background after a short while. Nothing is locked when signed out.
 */
export const AppLockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const uid = user?.id ?? null;
    const [config, setConfig] = useState<LockConfig>({ enabled: false, biometric: false });
    const [biometric, setBiometricInfo] = useState<BiometricInfo>({ available: false, kind: 'biometrics' });
    const [loaded, setLoaded] = useState(false);
    const [locked, setLocked] = useState(true);
    const backgroundedAt = useRef<number | null>(null);
    const busy = useRef(false); // a Face ID prompt is up — its own app-state blips must not relock

    const refresh = useCallback(async (): Promise<LockConfig> => {
        if (!uid) { const none = { enabled: false, biometric: false }; setConfig(none); setLoaded(true); return none; }
        const [c, b] = await Promise.all([readLockConfig(uid), getBiometricInfo()]);
        setConfig(c); setBiometricInfo(b); setLoaded(true);
        return c;
    }, [uid]);

    // Load (or reload on sign-in/out). A person with a PIN starts locked on every cold launch; with none, nothing is locked.
    useEffect(() => {
        setLoaded(false); setLocked(true);
        void refresh().then((c) => { if (!c.enabled) setLocked(false); });
    }, [refresh]);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'background') backgroundedAt.current = Date.now();
            else if (state === 'active' && backgroundedAt.current && !busy.current) {
                if (Date.now() - backgroundedAt.current > RELOCK_AFTER_MS) setLocked(true);
                backgroundedAt.current = null;
            }
        });
        return () => sub.remove();
    }, []);

    const value = useMemo<AppLockValue>(() => ({
        config, biometric, refresh,
        markUnlocked: () => setLocked(false),
        disable: async () => { if (uid) await clearPin(uid); await refresh(); },
        setBiometricEnabled: async (on) => { if (uid) await setBiometric(uid, on); await refresh(); },
    }), [config, biometric, refresh, uid]);

    const showLock = !!uid && config.enabled && locked;

    return (
        <AppLockContext.Provider value={value}>
            {children}
            {!!uid && !loaded && <View style={styles.cover} />}
            {showLock && <LockScreen uid={uid!} config={config} biometric={biometric} busyRef={busy} onUnlocked={() => setLocked(false)} onRecovered={async () => { await refresh(); setLocked(false); }} />}
        </AppLockContext.Provider>
    );
};

const LockScreen: React.FC<{
    uid: string; config: LockConfig; biometric: BiometricInfo; busyRef: React.MutableRefObject<boolean>; onUnlocked: () => void; onRecovered: () => void;
}> = ({ uid, config, biometric, busyRef, onUnlocked, onRecovered }) => {
    const insets = useSafeAreaInsets();
    const { userName } = useAuth();
    const [error, setError] = useState<string | null>(null);
    const [errorKey, setErrorKey] = useState(0);
    const [coolDown, setCoolDown] = useState(0);
    const [recovering, setRecovering] = useState(false);
    const [checking, setChecking] = useState(false);
    const triedAuto = useRef(false);
    const label = biometricLabel(biometric.kind, Platform.OS === 'ios');
    const canBio = config.biometric && biometric.available;

    const tryBiometric = useCallback(async () => {
        busyRef.current = true;
        const ok = await promptBiometric('Unlock MoneyWise');
        setTimeout(() => { busyRef.current = false; }, 600);
        if (ok) onUnlocked();
    }, [busyRef, onUnlocked]);

    // Offer Face ID / fingerprint straight away; the PIN pad is right there if it's declined.
    useEffect(() => { if (canBio && !triedAuto.current) { triedAuto.current = true; void tryBiometric(); } }, [canBio, tryBiometric]);

    useEffect(() => {
        if (coolDown <= 0) return;
        const t = setTimeout(() => setCoolDown((c) => c - 1), 1000);
        return () => clearTimeout(t);
    }, [coolDown]);

    const submit = async (pin: string) => {
        setChecking(true);
        const r = await verifyPin(uid, pin);
        setChecking(false);
        if (r.ok) { onUnlocked(); return; }
        setErrorKey((k) => k + 1);
        if (r.lockedForSeconds) { setCoolDown(r.lockedForSeconds); setError('Too many wrong tries.'); }
        else setError(r.attemptsLeft != null ? `Wrong PIN. ${r.attemptsLeft} ${r.attemptsLeft === 1 ? 'try' : 'tries'} left.` : 'Wrong PIN.');
    };

    return (
        <View style={[styles.cover, styles.lock, { paddingTop: insets.top + 56, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            {recovering ? (
                <PinRecoveryFlow userId={uid} onRecovered={onRecovered} onCancel={() => setRecovering(false)} />
            ) : (
                <>
                    <PinEntry
                        title={userName ? `Welcome back, ${userName.split(' ')[0]}` : 'Enter your PIN'}
                        subtitle={coolDown > 0 ? `Try again in ${coolDown}s` : 'Enter your PIN to unlock MoneyWise'}
                        error={error} errorKey={errorKey} disabled={coolDown > 0 || checking} onComplete={submit}
                        leftSlot={canBio ? (
                            <Pressable onPress={tryBiometric} hitSlop={8} accessibilityLabel={`Unlock with ${label}`}>
                                {biometric.kind === 'face' ? <ScanFace size={30} color={colors.blue} /> : <Fingerprint size={30} color={colors.blue} />}
                            </Pressable>
                        ) : undefined}
                    />
                    {checking && <ActivityIndicator color={colors.blue} style={{ marginTop: 6 }} />}
                    <Pressable onPress={() => setRecovering(true)} hitSlop={10} style={{ marginTop: 14 }}>
                        <Text style={styles.forgot}>Forgot PIN?</Text>
                    </Pressable>
                </>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    cover: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.canvas, zIndex: 1000 },
    lock: { alignItems: 'center' },
    forgot: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.blue },
});

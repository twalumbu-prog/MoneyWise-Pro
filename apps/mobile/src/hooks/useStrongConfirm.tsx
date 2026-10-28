import { useState } from 'react';
import { View, Pressable, StyleSheet, Alert, Modal, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, ScanFace, Fingerprint } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useAppLock } from '../context/AppLockContext';
import { verifyPin, promptBiometric, biometricLabel } from '../lib/appLock';
import { PinEntry } from '../components/security/PinEntry';
import { colors } from '../theme/tokens';

/**
 * Cards that move money out of the account (`strongAuth`) need the person themselves, not just a tap: Face ID when they
 * turned it on, otherwise their app PIN, and a plain "are you sure" when they have no PIN at all.
 */
export function useStrongConfirm() {
    const { user } = useAuth();
    const { config, biometric } = useAppLock();
    const [pinFor, setPinFor] = useState<((ok: boolean) => void) | null>(null);
    const [pinWhat, setPinWhat] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [errorKey, setErrorKey] = useState(0);
    const insets = useSafeAreaInsets();
    const canBio = config.biometric && biometric.available;
    const label = biometricLabel(biometric.kind, Platform.OS === 'ios');

    const confirm = (what: string) => new Promise<boolean>((resolve) => {
        if (!user?.id || !config.enabled) {
            Alert.alert('Please confirm', `${what}\n\nThis can't be reversed.`, [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Confirm', onPress: () => resolve(true) },
            ], { cancelable: true, onDismiss: () => resolve(false) });
            return;
        }
        const askPin = () => { setError(null); setPinWhat(what); setPinFor(() => resolve); };
        if (canBio) promptBiometric(what).then((ok) => (ok ? resolve(true) : askPin()));
        else askPin();
    });

    const close = (ok: boolean) => { pinFor?.(ok); setPinFor(null); };
    const submit = async (pin: string) => {
        if (!user?.id) return close(false);
        const r = await verifyPin(user.id, pin);
        if (r.ok) return close(true);
        setError(r.lockedForSeconds ? `Too many tries. Wait ${r.lockedForSeconds}s.` : 'Wrong PIN');
        setErrorKey((k) => k + 1);
        if (r.lockedForSeconds) setTimeout(() => close(false), 1200);
    };

    const sheet = (
        <Modal visible={!!pinFor} animationType="slide" onRequestClose={() => close(false)}>
            <View style={[styles.pinSheet, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
                <Pressable onPress={() => close(false)} hitSlop={10} style={styles.pinClose} accessibilityLabel="Cancel">
                    <X size={22} color={colors.textMuted} />
                </Pressable>
                <PinEntry
                    title="Enter your PIN" subtitle={pinWhat} error={error} errorKey={errorKey} onComplete={submit}
                    leftSlot={canBio ? (
                        <Pressable onPress={() => promptBiometric(pinWhat || 'Confirm').then((ok) => ok && close(true))} hitSlop={8} accessibilityLabel={`Use ${label}`}>
                            {biometric.kind === 'face' ? <ScanFace size={30} color={colors.blue} /> : <Fingerprint size={30} color={colors.blue} />}
                        </Pressable>
                    ) : undefined}
                />
            </View>
        </Modal>
    );
    return { confirm, sheet };
}


const styles = StyleSheet.create({
    pinSheet: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 24 },
    pinClose: { alignSelf: 'flex-end', padding: 4 },
});

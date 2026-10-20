import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { userService } from 'core';
import { PinEntry } from './PinEntry';
import { setPin } from '../../lib/appLock';
import { colors, fonts, radius } from '../../theme/tokens';

/** Choose a PIN, then type it again to confirm. Saves it and calls onDone. */
export const PinSetupFlow: React.FC<{ userId: string; title?: string; onDone: () => void; onCancel?: () => void }> = ({ userId, title = 'Create a PIN', onDone, onCancel }) => {
    const [first, setFirst] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [errorKey, setErrorKey] = useState(0);

    const handle = async (pin: string) => {
        if (!first) { setFirst(pin); setError(null); return; }
        if (pin !== first) { setFirst(null); setError('Those didn’t match. Start again.'); setErrorKey((k) => k + 1); return; }
        try { await setPin(userId, pin); onDone(); } catch (e: any) { setError(e?.message || 'Could not save your PIN.'); setErrorKey((k) => k + 1); setFirst(null); }
    };

    return (
        <View style={styles.wrap}>
            <PinEntry
                key={first ? 'confirm' : 'create'}
                title={first ? 'Confirm your PIN' : title}
                subtitle={first ? 'Enter the same PIN once more.' : 'Choose a 4-digit PIN you’ll remember. You can also unlock with Face ID or fingerprint.'}
                error={error} errorKey={errorKey} onComplete={handle}
            />
            {!!onCancel && <Pressable onPress={onCancel} hitSlop={10} style={styles.link}><Text style={styles.linkText}>Cancel</Text></Pressable>}
        </View>
    );
};

/** Forgot the PIN: email a code to the account address, confirm it, then choose a new PIN. */
export const PinRecoveryFlow: React.FC<{ userId: string; onRecovered: () => void; onCancel: () => void }> = ({ userId, onRecovered, onCancel }) => {
    const [stage, setStage] = useState<'ask' | 'code' | 'new'>('ask');
    const [busy, setBusy] = useState(false);
    const [sentTo, setSentTo] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);

    const send = async () => {
        setBusy(true); setError(null);
        try { const r = await userService.requestPinRecovery(); setSentTo(r.sentTo); setStage('code'); }
        catch (e: any) { setError(e?.message || 'We couldn’t send the code. Check your connection and try again.'); }
        finally { setBusy(false); }
    };

    const verify = async () => {
        setBusy(true); setError(null);
        try { await userService.verifyPinRecovery(code.trim()); setStage('new'); }
        catch (e: any) { setError(e?.message || 'That code didn’t work.'); }
        finally { setBusy(false); }
    };

    if (stage === 'new') return <PinSetupFlow userId={userId} title="Choose a new PIN" onDone={onRecovered} />;

    return (
        <View style={styles.wrap}>
            <Text style={styles.title}>{stage === 'ask' ? 'Reset your PIN' : 'Check your email'}</Text>
            <Text style={styles.sub}>
                {stage === 'ask' ? 'We’ll email a 6-digit code to the address on your MoneyWise account.' : `We sent a 6-digit code to ${sentTo}. It expires in 10 minutes.`}
            </Text>
            {stage === 'code' && (
                <TextInput
                    style={styles.codeInput} value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                    keyboardType="number-pad" maxLength={6} placeholder="••••••" placeholderTextColor={colors.textFaint} autoFocus textContentType="oneTimeCode"
                />
            )}
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Pressable
                onPress={stage === 'ask' ? send : verify}
                disabled={busy || (stage === 'code' && code.length !== 6)}
                style={({ pressed }) => [styles.btn, (busy || (stage === 'code' && code.length !== 6)) && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
            >
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnText}>{stage === 'ask' ? 'Email me a code' : 'Verify code'}</Text>}
            </Pressable>
            {stage === 'code' && <Pressable onPress={send} disabled={busy} hitSlop={10} style={styles.link}><Text style={styles.linkText}>Send a new code</Text></Pressable>}
            <Pressable onPress={onCancel} hitSlop={10} style={styles.link}><Text style={styles.linkText}>Back</Text></Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    wrap: { alignItems: 'center', alignSelf: 'stretch', paddingHorizontal: 24 },
    title: { fontFamily: fonts.bodyBold, fontSize: 22, color: colors.navy, textAlign: 'center' },
    sub: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginTop: 8, textAlign: 'center', lineHeight: 20 },
    codeInput: {
        alignSelf: 'stretch', marginTop: 24, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 28, letterSpacing: 10, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingVertical: 14, backgroundColor: colors.surface,
    },
    error: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.danger, marginTop: 12, textAlign: 'center' },
    btn: { alignSelf: 'stretch', minHeight: 52, borderRadius: radius.pill, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
    btnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
    link: { marginTop: 18, paddingVertical: 4 },
    linkText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.blue },
});

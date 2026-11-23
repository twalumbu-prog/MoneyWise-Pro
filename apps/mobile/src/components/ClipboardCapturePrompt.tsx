import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, AppState, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { ClipboardPaste, X } from 'lucide-react-native';
import { momoCaptureService } from 'core';
import { useAuth } from '../context/AuthContext';
import { cacheStore } from '../platform/storage';
import { colors, fonts, radius } from '../theme/tokens';
import { iosIntentAvailable, pasteboardChangeCount, pasteboardMightBeMessage, MOMO_CAPTURES_KEY, MOMO_SETTINGS_KEY } from '../lib/momoCapture';

const SEEN_KEY = 'momo-capture:clipboard-seen';

/**
 * iPhone, zero setup: when MoneyWise opens and something new was copied that might be a mobile money SMS, offer to
 * capture it. Only the clipboard's change counter and iOS's pattern check are used to decide (neither shows the
 * "pasted from" banner); the text itself is read only after the person taps Capture. Each copy is offered once.
 */
export function ClipboardCapturePrompt() {
    const { session } = useAuth();
    const insets = useSafeAreaInsets();
    const qc = useQueryClient();
    const [visible, setVisible] = useState(false);
    const [busy, setBusy] = useState(false);

    const check = useCallback(async () => {
        if (!iosIntentAvailable || !session) return;
        const count = pasteboardChangeCount();
        if (count == null) return;
        const seen = await cacheStore.get(SEEN_KEY);
        if (seen === String(count)) return;
        await cacheStore.set(SEEN_KEY, String(count));
        if (await pasteboardMightBeMessage()) setVisible(true);
    }, [session]);

    useEffect(() => {
        void check();
        const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void check(); else setVisible(false); });
        return () => sub.remove();
    }, [check]);

    const capture = async () => {
        setBusy(true);
        try {
            const text = await Clipboard.getStringAsync();
            if (!text.trim()) { setVisible(false); return; }
            const r = await momoCaptureService.paste(text);
            setVisible(false);
            void qc.invalidateQueries({ queryKey: MOMO_CAPTURES_KEY });
            void qc.invalidateQueries({ queryKey: MOMO_SETTINGS_KEY });
            if (!r.accepted) Alert.alert('Not a mobile money message', 'That doesn’t look like a mobile money transaction or balance. Copy the whole SMS, including the amount.');
            else if (r.duplicate) Alert.alert('Already captured', 'This message was captured before.');
            else Alert.alert(r.balanceCheck ? 'Balance captured' : 'Captured', r.balanceCheck ? 'MoneyWise compared it with your account.' : 'It’s waiting in Review captured.', [
                { text: 'OK' }, { text: 'Review', onPress: () => router.push('/momo-captures') },
            ]);
        } catch (e: any) { Alert.alert('Could not capture', e.message); }
        finally { setBusy(false); }
    };

    if (!visible) return null;
    return (
        <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 72 }]}>
            <View style={styles.card}>
                <ClipboardPaste size={18} color={colors.blue} />
                <View style={{ flex: 1 }}>
                    <Text style={styles.title}>Copied a mobile money message?</Text>
                    <Text style={styles.sub}>MoneyWise can capture it for you.</Text>
                </View>
                {busy ? <ActivityIndicator color={colors.blue} /> : (
                    <Pressable onPress={capture} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.8 }]}><Text style={styles.btnText}>Capture</Text></Pressable>
                )}
                <Pressable hitSlop={10} onPress={() => setVisible(false)}><X size={18} color={colors.textFaint} /></Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { position: 'absolute', left: 16, right: 16 },
    card: {
        flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.md,
        borderWidth: 1, borderColor: colors.border, padding: 12,
        shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
    },
    title: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    sub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 1 },
    btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.blue },
    btnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
});

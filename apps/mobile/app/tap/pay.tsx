import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ScanLine } from 'lucide-react-native';
import { parseTapCode } from 'core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';

// The scanner uses expo-camera. It is looked up only if it is installed, so the app still runs without it and says so.
let CameraModule: any = null;
try { CameraModule = require('expo-camera'); } catch { CameraModule = null; }

function Scanner({ onCode }: { onCode: (data: string) => void }) {
    const [perm, requestPerm] = CameraModule.useCameraPermissions();
    const [done, setDone] = useState(false);
    if (!perm) return null;
    if (!perm.granted) {
        return (
            <View style={s.camBox}>
                <Text style={s.sub}>MoneyWise needs the camera to scan a request code.</Text>
                <Pressable style={s.btn} onPress={requestPerm}><Text style={s.btnText}>Allow camera</Text></Pressable>
            </View>
        );
    }
    const { CameraView } = CameraModule;
    return (
        <View style={s.camBox}>
            <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={done ? undefined : (r: { data: string }) => { if (parseTapCode(r.data)) { setDone(true); onCode(r.data); } }} />
            <View style={s.frame} pointerEvents="none" />
        </View>
    );
}

/** Pay someone: scan their code, or type or paste it. */
export default function PaySomeone() {
    const router = useRouter();
    const [text, setText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const go = (raw: string) => {
        const code = parseTapCode(raw);
        if (!code) { setError('That isn’t a MoneyWise request code or link.'); return; }
        router.push(`/r/${code}` as any);
    };

    return (
        <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Pay someone" />
            <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
                {CameraModule && Platform.OS !== 'web' ? <Scanner onCode={go} /> : (
                    <View style={s.camBox}>
                        <ScanLine size={36} color={colors.textFaint} />
                        <Text style={s.sub}>{Platform.OS === 'web' ? 'Scanning works in the phone app.' : 'The scanner arrives with the next app build. Until then, paste the code or link below, or open the link on this phone.'}</Text>
                    </View>
                )}
                <Text style={s.label}>OR ENTER THE CODE OR LINK</Text>
                <TextInput style={s.input} value={text} onChangeText={(v) => { setText(v); setError(null); }} autoCapitalize="characters" autoCorrect={false} placeholder="Paste a link or type the 10-letter code" placeholderTextColor={colors.textFaint} />
                {error ? <Text style={s.error}>{error}</Text> : null}
                <Pressable style={[s.btn, !text.trim() && { opacity: 0.45 }]} disabled={!text.trim()} onPress={() => go(text)}><Text style={s.btnText}>Open request</Text></Pressable>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    scroll: { padding: 20, gap: 14, paddingBottom: 48 },
    camBox: { height: 300, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#0E1117', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
    frame: { width: 190, height: 190, borderRadius: 24, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)' },
    sub: { fontFamily: fonts.body, fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 19, textAlign: 'center' },
    label: { fontFamily: fonts.bodyBold, fontSize: 10.5, color: colors.textFaint, letterSpacing: 0.7, marginTop: 6 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 14, fontFamily: fonts.body, fontSize: 15, color: colors.text, backgroundColor: '#fff' },
    btn: { backgroundColor: colors.blue, borderRadius: radius.pill, paddingVertical: 15, paddingHorizontal: 28, alignItems: 'center', alignSelf: 'stretch' },
    btnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
    error: { fontFamily: fonts.body, fontSize: 12, color: '#B31412', backgroundColor: '#FCE8E6', borderRadius: radius.md, padding: 12 },
});

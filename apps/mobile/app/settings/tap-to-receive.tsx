import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { Check, Nfc, Users, Globe, PowerOff } from 'lucide-react-native';
import { tapService, type TapMode } from 'core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';

const OPTIONS: { mode: TapMode; icon: any; title: string; text: string }[] = [
    { mode: 'OFF', icon: PowerOff, title: 'Off', text: 'Nobody can ask to pay you by tap, QR code or request link. This is the default.' },
    { mode: 'CONTACTS', icon: Users, title: 'My contacts', text: 'Only people you have sent money to before can open your request and pay you.' },
    { mode: 'EVERYONE', icon: Globe, title: 'Everyone', text: 'Any MoneyWise user who gets your request can pay you.' },
];

/** Who can pay you through a tap, QR code or request link. Normal payments and business pay links are not affected. */
export default function TapToReceiveSettings() {
    const [mode, setMode] = useState<TapMode | null>(null);
    const [saving, setSaving] = useState<TapMode | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { tapService.getMode().then(setMode).catch((e) => setError(e?.message || 'Could not load this setting.')); }, []);

    const choose = async (m: TapMode) => {
        if (m === mode || saving) return;
        setSaving(m); setError(null);
        try { setMode(await tapService.setMode(m)); } catch (e: any) { setError(e?.message || 'Could not save that. Please try again.'); } finally { setSaving(null); }
    };

    return (
        <View style={s.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Tap to receive" />
            <ScrollView contentContainerStyle={s.scroll}>
                <View style={s.hero}>
                    <View style={s.heroIcon}><Nfc size={22} color={colors.blue} /></View>
                    <Text style={s.heroText}>Let other MoneyWise users pay you by touching phones, scanning your code or opening your link. You choose who can.</Text>
                </View>

                {mode === null && !error ? <ActivityIndicator color={colors.blue} style={{ marginTop: 30 }} /> : null}
                {error ? <Text style={s.error}>{error}</Text> : null}

                {mode !== null && OPTIONS.map((o) => (
                    <Pressable key={o.mode} onPress={() => choose(o.mode)} style={({ pressed }) => [s.option, mode === o.mode && s.optionOn, pressed && { opacity: 0.85 }]} accessibilityRole="radio" accessibilityState={{ selected: mode === o.mode }}>
                        <View style={[s.optIcon, mode === o.mode && { backgroundColor: colors.blue }]}><o.icon size={18} color={mode === o.mode ? '#FFFFFF' : colors.blue} /></View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.optTitle}>{o.title}</Text>
                            <Text style={s.optText}>{o.text}</Text>
                        </View>
                        {saving === o.mode ? <ActivityIndicator color={colors.blue} /> : mode === o.mode ? <Check size={20} color={colors.blue} /> : null}
                    </Pressable>
                ))}

                <Text style={s.foot}>This only covers requests made with Receive money. It never changes who can pay your business pay links or quick-pay page. Turning it off cancels any request that is still open.</Text>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    scroll: { padding: 20, gap: 12, paddingBottom: 48 },
    hero: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: '#EAF1FF', borderRadius: radius.lg, padding: 14 },
    heroIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
    heroText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.blue, lineHeight: 19 },
    error: { fontFamily: fonts.body, fontSize: 12, color: '#B31412', backgroundColor: '#FCE8E6', borderRadius: radius.md, padding: 12 },
    option: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1.5, borderColor: colors.border },
    optionOn: { borderColor: colors.blue },
    optIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
    optTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    optText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: 2 },
    foot: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, lineHeight: 16, textAlign: 'center', marginTop: 6 },
});

import { ReactNode } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../ScreenHeader';
import { colors, fonts, radius } from '../../theme/tokens';

/** A back-button screen with a scrolling body; the Marketplace screens are all built from these few pieces. */
export function Screen({ title, children, right, onRefresh, refreshing, scroll = true }: { title: string; children: ReactNode; right?: ReactNode; onRefresh?: () => void; refreshing?: boolean; scroll?: boolean }) {
    const insets = useSafeAreaInsets();
    return (
        <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title={title} right={right} />
            {scroll ? (
                <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled"
                    refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}>
                    {children}
                </ScrollView>
            ) : children}
        </KeyboardAvoidingView>
    );
}

export const Card = ({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: object }) => (
    onPress ? <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.85 }]}>{children}</Pressable> : <View style={[s.card, style]}>{children}</View>
);

export const Pill = ({ label, bg = '#EAF1FF', fg = colors.blue }: { label: string; bg?: string; fg?: string }) => (
    <View style={[s.pill, { backgroundColor: bg }]}><Text style={[s.pillText, { color: fg }]}>{label}</Text></View>
);

export const Chip = ({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} style={[s.chip, on && s.chipOn]}><Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text></Pressable>
);

export const Btn = ({ label, onPress, busy, disabled, kind = 'primary' }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean; kind?: 'primary' | 'tonal' | 'danger' | 'dark' }) => (
    <Pressable onPress={onPress} disabled={busy || disabled} style={({ pressed }) => [s.btn, kind === 'tonal' && s.btnTonal, kind === 'danger' && s.btnDanger, kind === 'dark' && { backgroundColor: '#191919' }, (busy || disabled) && { opacity: 0.45 }, pressed && { opacity: 0.8 }]}>
        {busy ? <ActivityIndicator color={kind === 'primary' ? '#fff' : colors.blue} /> : <Text style={[s.btnText, kind !== 'primary' && kind !== 'dark' && { color: kind === 'danger' ? '#B31412' : colors.blue }]}>{label}</Text>}
    </Pressable>
);

export const Field = ({ label, value, onChangeText, placeholder, keyboardType, multiline, hint, editable = true }: { label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'decimal-pad'; multiline?: boolean; hint?: string; editable?: boolean }) => (
    <View style={{ gap: 5 }}>
        <Text style={s.label}>{label}</Text>
        <TextInput style={[s.input, multiline && { minHeight: 80, textAlignVertical: 'top' }]} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textFaint}
            keyboardType={keyboardType} multiline={multiline} editable={editable} />
        {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
);

export const SearchBox = ({ value, onChangeText, placeholder }: { value: string; onChangeText: (v: string) => void; placeholder: string }) => (
    <TextInput style={[s.input, { backgroundColor: colors.surface }]} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textFaint} autoCorrect={false} returnKeyType="search" />
);

export const Loading = () => <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={colors.blue} /></View>;
export const Empty = ({ text }: { text: string }) => <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: 36, lineHeight: 19 }}>{text}</Text>;
export const ErrorNote = ({ text, onRetry }: { text: string; onRetry?: () => void }) => (
    <View style={{ gap: 10, alignItems: 'center', paddingVertical: 30 }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19 }}>{text}</Text>
        {onRetry ? <Btn label="Try again" kind="tonal" onPress={onRetry} /> : null}
    </View>
);
export const Notice = ({ text, tone }: { text: string; tone: 'error' | 'ok' | 'warn' }) => (
    <Text style={{ fontFamily: fonts.body, fontSize: 12, lineHeight: 17, borderRadius: radius.md, padding: 12, overflow: 'hidden',
        color: tone === 'error' ? '#B31412' : tone === 'ok' ? '#137333' : '#7A4B00', backgroundColor: tone === 'error' ? '#FCE8E6' : tone === 'ok' ? '#E6F4EA' : '#FEF7E0' }}>{text}</Text>
);

export const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    scroll: { padding: 20, gap: 12 },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 6 },
    pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
    pillText: { fontFamily: fonts.bodyBold, fontSize: 10.5 },
    chip: { borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
    chipText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text },
    chipTextOn: { color: '#fff' },
    btn: { backgroundColor: colors.blue, borderRadius: radius.pill, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
    btnTonal: { backgroundColor: '#EAF1FF' },
    btnDanger: { backgroundColor: '#FCE8E6' },
    btnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#fff' },
    label: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
    hint: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, lineHeight: 15 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12, fontFamily: fonts.body, fontSize: 14, color: colors.text, backgroundColor: '#fff' },
    title: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    sub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17 },
    big: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});

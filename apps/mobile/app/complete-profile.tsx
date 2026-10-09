import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { User, Building2, Check } from 'lucide-react-native';
import { apiJson } from 'core';
import { useAuth } from '../src/context/AuthContext';
import { colors, fonts, radius } from '../src/theme/tokens';

/**
 * Shown once, right after someone's FIRST Google/Apple sign-in. The login itself already created their
 * account; this chooses what kind of MoneyWise they are setting up — the same two choices as email
 * sign-up — and creates it. Anyone who signed in to an existing account never sees this.
 */
export default function CompleteProfileScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { userName, refreshUserOrganizations, switchOrganization, signOut } = useAuth();
    const [type, setType] = useState<'INDIVIDUAL' | 'BUSINESS'>('INDIVIDUAL');
    const [businessName, setBusinessName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [suggestion, setSuggestion] = useState('');

    const first = (userName || '').split(' ')[0];
    const canContinue = !busy && (type === 'INDIVIDUAL' || businessName.trim().length >= 2);

    const submit = async (nameOverride?: string) => {
        setBusy(true); setError(''); setSuggestion('');
        try {
            const res = await apiJson<{ organizationId: string }>('/auth/complete-social-signup', {
                method: 'POST',
                body: JSON.stringify({ accountType: type, organizationName: nameOverride ?? businessName.trim() }),
            });
            await refreshUserOrganizations();
            await switchOrganization(res.organizationId);
            router.replace('/');
        } catch (e: any) {
            setError(e?.message || 'Something went wrong. Please try again.');
            if (e?.data?.suggestion) setSuggestion(String(e.data.suggestion));
        } finally {
            setBusy(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.canvas }}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>{first ? `Welcome, ${first}` : 'Welcome to MoneyWise'}</Text>
                <Text style={styles.sub}>How will you use MoneyWise? You can add more later.</Text>

                {([
                    { value: 'INDIVIDUAL', title: 'Personal', body: 'Track your own money, savings and goals.', Icon: User },
                    { value: 'BUSINESS', title: 'Business', body: 'Run payments, requests and reporting for a business.', Icon: Building2 },
                ] as const).map(({ value, title, body, Icon }) => (
                    <Pressable key={value} onPress={() => { setType(value); setError(''); setSuggestion(''); }} style={[styles.card, type === value && styles.cardOn]}>
                        <View style={[styles.iconWrap, type === value && { backgroundColor: colors.blue }]}>
                            <Icon size={20} color={type === value ? '#FFFFFF' : colors.blue} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.cardTitle}>{title}</Text>
                            <Text style={styles.cardBody}>{body}</Text>
                        </View>
                        {type === value && <Check size={18} color={colors.blue} />}
                    </Pressable>
                ))}

                {type === 'BUSINESS' && (
                    <View style={{ marginTop: 6 }}>
                        <Text style={styles.label}>Business name</Text>
                        <TextInput value={businessName} onChangeText={(t) => { setBusinessName(t); setError(''); setSuggestion(''); }} placeholder="e.g. Kapambwe Traders" placeholderTextColor={colors.textFaint} style={styles.input} autoCapitalize="words" />
                    </View>
                )}

                {!!error && <Text style={styles.error}>{error}</Text>}
                {!!suggestion && (
                    <Pressable onPress={() => { setBusinessName(suggestion); void submit(suggestion); }} style={styles.suggest}>
                        <Text style={styles.suggestText}>Use “{suggestion}” instead</Text>
                    </Pressable>
                )}

                <Pressable onPress={() => submit()} disabled={!canContinue} style={({ pressed }) => [styles.cta, !canContinue && { opacity: 0.5 }, pressed && canContinue && { opacity: 0.85 }]}>
                    {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.ctaText}>Continue</Text>}
                </Pressable>

                <Pressable onPress={() => signOut()} style={{ alignItems: 'center', paddingVertical: 14 }}>
                    <Text style={styles.signOut}>Use a different account</Text>
                </Pressable>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    scroll: { paddingHorizontal: 22, gap: 12 },
    title: { fontFamily: fonts.display, fontSize: 28, color: colors.text },
    sub: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginBottom: 10 },
    card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
    cardOn: { borderColor: colors.blue, backgroundColor: '#F4F8FF' },
    iconWrap: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
    cardTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
    cardBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
    label: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted, marginBottom: 8 },
    input: { height: 52, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 18, fontFamily: fonts.body, fontSize: 15, color: colors.text, backgroundColor: colors.surface },
    error: { fontFamily: fonts.bodyMedium, fontSize: 13, color: '#B91C1C', lineHeight: 18 },
    suggest: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: '#EAF1FF' },
    suggestText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue },
    cta: { marginTop: 12, height: 54, borderRadius: radius.pill, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    ctaText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
    signOut: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
});

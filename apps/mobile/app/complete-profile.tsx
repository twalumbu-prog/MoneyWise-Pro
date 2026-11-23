import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiJson } from 'core';
import { useAuth } from '../src/context/AuthContext';
import { AccountTypeChooser } from '../src/components/auth/AccountTypeChooser';
import { track } from '../src/lib/analytics';
import { cacheStoreSync } from '../src/platform/storage';
import { PENDING_ACCOUNT_TYPE_KEY } from '../src/lib/pendingAccountType';
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
    // Personal or Pro was already chosen before the Apple/Google sheet (/(auth)/choose).
    const [picked] = useState<'INDIVIDUAL' | 'BUSINESS' | null>(() => {
        try { const v = cacheStoreSync.getItem(PENDING_ACCOUNT_TYPE_KEY); return v === 'INDIVIDUAL' || v === 'BUSINESS' ? v : null; } catch { return null; }
    });
    const [type, setType] = useState<'INDIVIDUAL' | 'BUSINESS'>(picked ?? 'INDIVIDUAL');
    const [businessName, setBusinessName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [suggestion, setSuggestion] = useState('');

    const first = (userName || '').split(' ')[0];
    const canContinue = !busy && (type === 'INDIVIDUAL' || businessName.trim().length >= 2);

    const submit = async (nameOverride?: string) => {
        setBusy(true); setError(''); setSuggestion('');
        track('account_type_chosen', { account_choice: type, via: 'social' });
        try {
            const res = await apiJson<{ organizationId: string }>('/auth/complete-social-signup', {
                method: 'POST',
                body: JSON.stringify({ accountType: type, organizationName: nameOverride ?? businessName.trim() }),
            });
            await refreshUserOrganizations();
            await switchOrganization(res.organizationId);
            try { cacheStoreSync.removeItem(PENDING_ACCOUNT_TYPE_KEY); } catch { /* nothing stored */ }
            router.replace('/');
        } catch (e: any) {
            setError(e?.message || 'Something went wrong. Please try again.');
            if (e?.data?.suggestion) setSuggestion(String(e.data.suggestion));
        } finally {
            setBusy(false);
        }
    };

    // A Personal pick needs nothing more, so create it straight away; a Pro pick still needs the business name below.
    useEffect(() => { if (picked === 'INDIVIDUAL') void submit(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.canvas }}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>{first ? `Welcome, ${first}` : 'Welcome to MoneyWise'}</Text>
                <Text style={styles.sub}>How will you use MoneyWise? Pick one to start. You can add the other later.</Text>

                <AccountTypeChooser value={type} onChange={(v) => { setType(v); setError(''); setSuggestion(''); }} />

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
    cta: { marginTop: 12, height: 46, borderRadius: radius.pill, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
    ctaText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: '#FFFFFF' },
    signOut: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
});

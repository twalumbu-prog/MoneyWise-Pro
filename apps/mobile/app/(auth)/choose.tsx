import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { AccountTypeChooser, type AccountType } from '../../src/components/auth/AccountTypeChooser';
import { track } from '../../src/lib/analytics';
import { signInWithSocial, SocialAuthCancelled, type SocialProvider } from '../../src/lib/socialAuth';
import { cacheStoreSync } from '../../src/platform/storage';
import { PENDING_ACCOUNT_TYPE_KEY } from '../../src/lib/pendingAccountType';
import { colors, fonts, radius } from '../../src/theme/tokens';

/**
 * Sign-up, step one for every method (?via=email|apple|google): Personal or Pro. Email registration creates the
 * workspace at once, so the choice has to come before the form; for Apple/Google it is remembered and used by
 * /complete-profile once the provider has signed the person in.
 */
export default function ChooseAccountTypeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { via } = useLocalSearchParams<{ via?: string }>();
    const [type, setType] = useState<AccountType>('INDIVIDUAL');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const next = async () => {
        track('account_type_chosen', { account_choice: type, via: via || 'email' });
        if (via === 'apple' || via === 'google') {
            if (busy) return;
            setBusy(true); setError('');
            try {
                try { cacheStoreSync.setItem(PENDING_ACCOUNT_TYPE_KEY, type); } catch { /* complete-profile just asks */ }
                await signInWithSocial(via as SocialProvider);
                router.replace('/');
            } catch (e: any) {
                try { cacheStoreSync.removeItem(PENDING_ACCOUNT_TYPE_KEY); } catch { /* nothing stored */ }
                if (!(e instanceof SocialAuthCancelled)) setError(`Couldn’t sign in with ${via === 'apple' ? 'Apple' : 'Google'}: ${e?.message || 'please try again'}`);
            } finally {
                setBusy(false);
            }
            return;
        }
        router.push({ pathname: '/(auth)/signin', params: { mode: 'signup', type } } as any);
    };

    return (
        <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} hitSlop={12} style={styles.circleBtn} accessibilityRole="button" accessibilityLabel="Back">
                    <ChevronLeft size={24} color={colors.text} />
                </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.title} accessibilityRole="header">How will you use MoneyWise?</Text>
                <Text style={styles.sub}>Pick one to start. You can add the other later.</Text>
                <View style={{ marginTop: 24 }}>
                    <AccountTypeChooser value={type} onChange={setType} />
                </View>
            </ScrollView>
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                {!!error && <Text style={styles.error}>{error}</Text>}
                <Pressable
                    onPress={next}
                    disabled={busy}
                    style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
                    accessibilityRole="button"
                >
                    {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.ctaText}>Continue</Text>}
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    header: { paddingHorizontal: 20 },
    circleBtn: {
        width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
    },
    body: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 24 },
    title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.text },
    sub: { fontFamily: fonts.body, fontSize: 15, color: colors.textMuted, marginTop: 8 },
    footer: { paddingHorizontal: 20, paddingTop: 12 },
    cta: { height: 46, borderRadius: radius.pill, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
    error: { fontFamily: fonts.bodyMedium, fontSize: 12, color: '#B91C1C', textAlign: 'center', marginBottom: 10 },
    ctaText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: '#FFFFFF' },
});

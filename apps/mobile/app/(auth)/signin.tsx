import React, { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, ActivityIndicator, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Eye, EyeOff, Building2 } from 'lucide-react-native';
import { AnimatedSegmented } from '../../src/components/AnimatedTabs';
import { WalletCardsIcon } from '../../src/components/icons/WalletCardsIcon';
import { useAuth } from '../../src/context/AuthContext';
import { SocialButtons } from '../../src/components/auth/SocialButtons';
import { MoneywiseMark } from '../../src/components/icons/MoneywiseMark';
import { Field } from '../../src/components/onboarding/personal/steps';
import { track } from '../../src/lib/analytics';
import { signInWithSocial, SocialAuthCancelled, type SocialProvider } from '../../src/lib/socialAuth';
import { cacheStoreSync } from '../../src/platform/storage';
import { PENDING_ACCOUNT_TYPE_KEY } from '../../src/lib/pendingAccountType';
import { colors, fonts, radius } from '../../src/theme/tokens';

/**
 * Email + password, Apple/Google underneath, and the same black Continue as the rest of onboarding pinned at the bottom.
 *  - ?mode=signup&type=INDIVIDUAL|BUSINESS (from /(auth)/choose): creates the account. Only the email and a password are
 *    asked here; the name, date of birth and the rest come next in onboarding.
 *  - no params (welcome's "I already have an account"): signs an existing account in.
 */
export default function SignInScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { signInWithPassword, signUp } = useAuth();
    const params = useLocalSearchParams<{ mode?: string; type?: string }>();
    const isSignup = params.mode === 'signup';
    // Sign-up: fixed by the Personal/Pro page. Login: the For Individuals / For Businesses tab, a hint for which account to open.
    const [tab, setTab] = useState<'INDIVIDUAL' | 'BUSINESS'>('INDIVIDUAL');
    const accountType: 'INDIVIDUAL' | 'BUSINESS' = isSignup ? (params.type === 'BUSINESS' ? 'BUSINESS' : 'INDIVIDUAL') : tab;
    const [businessName, setBusinessName] = useState('');
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const passwordRef = useRef<TextInput>(null);

    const looksLikeEmail = /^\S+@\S+\.\S+$/.test(identifier.trim());
    const canSubmit = !busy && password.length > 0
        && (isSignup ? looksLikeEmail && password.length >= 6 && (accountType === 'INDIVIDUAL' || businessName.trim().length >= 2) : identifier.trim().length > 0);

    // Apple/Google while creating an account: remember Personal/Pro, as /(auth)/choose does, for /complete-profile.
    const social = async (provider: SocialProvider) => {
        if (busy) return;
        setBusy(true); setError('');
        try {
            try { cacheStoreSync.setItem(PENDING_ACCOUNT_TYPE_KEY, accountType); } catch { /* complete-profile just asks */ }
            await signInWithSocial(provider);
            router.replace('/');
        } catch (e: any) {
            try { cacheStoreSync.removeItem(PENDING_ACCOUNT_TYPE_KEY); } catch { /* nothing stored */ }
            if (!(e instanceof SocialAuthCancelled)) setError(`Couldn’t sign in with ${provider === 'apple' ? 'Apple' : 'Google'}: ${e?.message || 'please try again'}`);
        } finally {
            setBusy(false);
        }
    };

    const submit = async () => {
        if (!canSubmit) return;
        setBusy(true); setError('');
        try {
            if (isSignup) {
                track('signup_submitted', { account_choice: accountType });
                const email = identifier.trim().toLowerCase();
                // The API wants a name, a workspace name and a username; the person's real name is asked next in onboarding,
                // which also renames a made-up "<name>'s Workspace". Pro asks for the business name here.
                const local = email.split('@')[0].replace(/[^a-z0-9]/gi, '') || 'me';
                const username = `${local.slice(0, 20).toLowerCase()}${Math.floor(1000 + Math.random() * 9000)}`;
                const org = accountType === 'BUSINESS' ? businessName.trim() : `${local}'s Workspace`;
                await signUp(email, password, local, org, username, accountType);
                await signInWithPassword(email, password, accountType);
            } else {
                track('signin_submitted');
                await signInWithPassword(identifier, password, accountType);
            }
            router.replace('/');
        } catch (e: any) {
            setError(e?.message || 'Couldn’t sign you in. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <KeyboardAvoidingView style={styles.root} behavior="padding">
            <View style={[styles.header, { paddingTop: insets.top + 8 }, !isSignup && styles.headerCentered]}>
                <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.back, !isSignup && styles.backAbs, !isSignup && { top: insets.top + 8 }]} accessibilityRole="button" accessibilityLabel="Back">
                    <ChevronLeft size={24} color={colors.text} />
                </Pressable>
                {isSignup ? (
                    <View style={styles.brand} accessibilityRole="header" accessibilityLabel="Moneywise">
                        <MoneywiseMark height={16} color="#0F172A" />
                        <Text style={styles.brandText}>Moneywise</Text>
                    </View>
                ) : (
                    <View style={styles.brandCentered} accessibilityRole="header" accessibilityLabel="Moneywise">
                        <MoneywiseMark height={22} color="#0F172A" />
                        <View style={styles.brandTitleWrap}>
                            <Text style={styles.brandTitleText}>Moneywise</Text>
                            <Text style={styles.trademarkBadge}>TM</Text>
                        </View>
                    </View>
                )}
            </View>

            <ScrollView contentContainerStyle={styles.body} bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {!isSignup && (
                    <AnimatedSegmented
                        value={tab}
                        onChange={(v) => setTab(v as 'INDIVIDUAL' | 'BUSINESS')}
                        trackStyle={styles.segTrack}
                        indicatorStyle={styles.segIndicator}
                        itemStyle={styles.segItem}
                        items={[
                            { value: 'INDIVIDUAL', content: (
                                <View style={styles.segRow}>
                                    <WalletCardsIcon size={15} color={tab === 'INDIVIDUAL' ? '#0055CC' : '#6B7280'} style={{ marginRight: 4 }} />
                                    <Text style={[styles.segText, tab === 'INDIVIDUAL' && styles.segTextOn]} numberOfLines={1}>For Individuals</Text>
                                </View>
                            ) },
                            { value: 'BUSINESS', content: (
                                <View style={styles.segRow}>
                                    <Building2 size={15} color={tab === 'BUSINESS' ? '#0F172A' : '#6B7280'} style={{ marginRight: 4 }} />
                                    <Text style={[styles.segText, tab === 'BUSINESS' && styles.segTextOn]} numberOfLines={1}>For Businesses</Text>
                                </View>
                            ) },
                        ]}
                    />
                )}
                <Text style={[styles.title, !isSignup && { marginTop: 22 }]} accessibilityRole="header">{isSignup ? 'Let’s get started' : 'Welcome back'}</Text>
                <Text style={styles.sub}>{isSignup ? 'Enter your email and create a password.' : 'Sign in to pick up where you left off.'}</Text>

                <View style={{ marginTop: 14 }}>
                    <Field
                        label={isSignup ? 'Email' : 'Email or username'} value={identifier} onChangeText={(t) => { setIdentifier(t); setError(''); }}
                        keyboardType="email-address" textContentType="username" autoComplete="username" maxLength={120}
                        returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()}
                    />
                    <View style={{ marginTop: 10 }}>
                        <Field
                            ref={passwordRef}
                            label="Password" value={password} onChangeText={(t) => { setPassword(t); setError(''); }}
                            secureTextEntry={!showPassword} textContentType={isSignup ? 'newPassword' : 'password'} autoComplete={isSignup ? 'new-password' : 'password'} maxLength={128}
                            returnKeyType="go" onSubmitEditing={submit}
                            suffix={(
                                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10} accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                                    {showPassword ? <EyeOff size={18} color={colors.textMuted} /> : <Eye size={18} color={colors.textMuted} />}
                                </Pressable>
                            )}
                        />
                    </View>
                    {isSignup && accountType === 'BUSINESS' && (
                        <View style={{ marginTop: 10 }}>
                            <Field label="Business name" value={businessName} onChangeText={(t) => { setBusinessName(t); setError(''); }} autoCapitalize="words" maxLength={80} />
                        </View>
                    )}
                    {isSignup ? <View style={{ height: 12 }} /> : (
                        <Pressable onPress={() => router.push({ pathname: '/(auth)/login', params: { mode: 'forgot' } } as any)} hitSlop={8} style={styles.forgot} accessibilityRole="button">
                            <Text style={styles.forgotText}>Forgot password?</Text>
                        </Pressable>
                    )}
                </View>

                {!!error && <Text style={styles.error}>{error}</Text>}

                {/* Pushed down the page, but still clear of the Continue button. */}
                <View style={styles.social}>
                    <View style={styles.dividerRow}>
                        <View style={styles.line} /><Text style={styles.dividerText}>or continue with</Text><View style={styles.line} />
                    </View>
                    <SocialButtons compact onError={setError} onProvider={isSignup ? social : undefined} />
                </View>
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                <Pressable
                    onPress={submit}
                    disabled={!canSubmit}
                    style={({ pressed }) => [styles.cta, !canSubmit && { opacity: 0.3 }, pressed && canSubmit && { opacity: 0.9 }]}
                    accessibilityRole="button"
                >
                    {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.ctaText}>{isSignup ? 'Continue' : 'Login'}</Text>}
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#FFFFFF', overflow: 'hidden' },
    header: { paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerCentered: { justifyContent: 'center', paddingBottom: 4 },
    backAbs: { position: 'absolute', left: 16, zIndex: 2 },
    brandCentered: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 10, paddingBottom: 6 },
    brandTitleWrap: { flexDirection: 'row', alignItems: 'flex-start', marginLeft: 8 },
    brandTitleText: { fontFamily: fonts.advercaseRegular, fontSize: 22, color: '#0F172A', letterSpacing: -0.3 },
    trademarkBadge: { fontSize: 9, fontWeight: '700', color: '#0F172A', marginLeft: 2, top: -4 },
    segTrack: { backgroundColor: '#F3F4F6', borderRadius: 9999, padding: 4 },
    segIndicator: { backgroundColor: '#FFFFFF', borderRadius: 9999, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 },
    segItem: { flex: 1, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
    segRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    segText: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: '#6B7280' },
    segTextOn: { fontFamily: fonts.bodyBold, color: '#0F172A' },
    back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    brandText: { fontFamily: fonts.advercaseRegular, fontSize: 17, color: '#0F172A', letterSpacing: -0.2 },
    body: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 40 },
    social: { marginTop: 'auto', paddingTop: 24 },
    title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.text },
    sub: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: 6 },
    forgot: { alignSelf: 'flex-end', paddingVertical: 12 },
    forgotText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    error: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 17, color: '#B91C1C', marginTop: 4 },
    dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong },
    dividerText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
    footer: { paddingHorizontal: 24, paddingTop: 10 },
    cta: { height: 46, borderRadius: radius.pill, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
    ctaText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: '#FFFFFF' },
});

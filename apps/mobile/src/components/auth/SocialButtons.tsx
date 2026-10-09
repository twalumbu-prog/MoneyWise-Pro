import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { signInWithSocial, appleNativeAvailable, SocialAuthCancelled, type SocialProvider } from '../../lib/socialAuth';
import { colors, fonts, radius } from '../../theme/tokens';

/**
 * "Continue with Apple / Google" — the same buttons sign a returning person in and a new person up:
 * a first-time login creates the account (they then pick personal or business), and a login whose email
 * already belongs to an email/password account is merged into that account by Supabase.
 */
/** Google's official four-colour "G" (per Google's sign-in branding guidelines). */
const GoogleLogo: React.FC<{ size?: number }> = ({ size = 20 }) => (
    <Svg width={size} height={size} viewBox="0 0 48 48">
        <Path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
        <Path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
        <Path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
        <Path fill="#34A853" d="M24 48c6.5 0 12-2.1 16-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </Svg>
);

export const SocialButtons: React.FC<{ onError: (message: string) => void }> = ({ onError }) => {
    const router = useRouter();
    const [busy, setBusy] = useState<SocialProvider | null>(null);
    const [showApple, setShowApple] = useState(false);

    // Apple's own sheet exists on iOS only; Google works everywhere (via the browser).
    useEffect(() => { void appleNativeAvailable().then(setShowApple); }, []);

    const go = async (provider: SocialProvider) => {
        if (busy) return;
        setBusy(provider);
        onError('');
        try {
            await signInWithSocial(provider);
            router.replace('/');
        } catch (e: any) {
            if (!(e instanceof SocialAuthCancelled)) {
                onError(`Couldn’t sign in with ${provider === 'apple' ? 'Apple' : 'Google'}: ${e?.message || 'please try again'}`);
            }
        } finally {
            setBusy(null);
        }
    };

    return (
        <View style={styles.wrap}>
            <View style={styles.dividerRow}>
                <View style={styles.line} /><Text style={styles.dividerText}>or continue with</Text><View style={styles.line} />
            </View>

            {showApple && (
                <Pressable style={({ pressed }) => [styles.btn, styles.apple, pressed && { opacity: 0.85 }]} onPress={() => go('apple')} disabled={!!busy} accessibilityLabel="Continue with Apple">
                    {busy === 'apple' ? <ActivityIndicator color="#FFFFFF" /> : (
                        <>
                            <Text style={styles.appleMark}>{''}</Text>
                            <Text style={[styles.btnText, { color: '#FFFFFF' }]}>Continue with Apple</Text>
                        </>
                    )}
                </Pressable>
            )}

            <Pressable style={({ pressed }) => [styles.btn, styles.google, pressed && { opacity: 0.85 }]} onPress={() => go('google')} disabled={!!busy} accessibilityLabel="Continue with Google">
                {busy === 'google' ? <ActivityIndicator color={colors.blue} /> : (
                    <>
                        <GoogleLogo />
                        <Text style={styles.btnText}>Continue with Google</Text>
                    </>
                )}
            </Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    wrap: { marginTop: 18, gap: 10 },
    dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
    line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
    dividerText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
    btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 52, borderRadius: radius.pill },
    apple: { backgroundColor: '#000000' },
    google: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.borderStrong },
    btnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    appleMark: { fontSize: 20, color: '#FFFFFF', marginTop: Platform.OS === 'ios' ? -2 : 0 },
});

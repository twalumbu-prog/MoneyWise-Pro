import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { signInWithSocial, appleNativeAvailable, SocialAuthCancelled, type SocialProvider } from '../../lib/socialAuth';
import { colors, fonts, radius } from '../../theme/tokens';

/**
 * "Continue with Apple / Google" — the same buttons sign a returning person in and a new person up:
 * a first-time login creates the account (they then pick personal or business), and a login whose email
 * already belongs to an email/password account is merged into that account by Supabase.
 */
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
                        <Text style={styles.googleG}>G</Text>
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
    googleG: { fontFamily: fonts.bodyBold, fontSize: 18, color: '#4285F4' },
});

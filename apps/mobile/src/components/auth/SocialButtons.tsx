import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Mail } from 'lucide-react-native';
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

/** Single-colour version of the Google "G" (same shapes as the four-colour logo), for the compact buttons. */
const GoogleGlyph: React.FC<{ size: number; color: string }> = ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 48 48">
        <Path fill={color} d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
        <Path fill={color} d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
        <Path fill={color} d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
        <Path fill={color} d="M24 48c6.5 0 12-2.1 16-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </Svg>
);

/** The Apple mark as a drawn shape, so it is exactly the same size as the other icons (the text glyph never is). */
const AppleGlyph: React.FC<{ size: number; color: string }> = ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path fill={color} d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </Svg>
);

const ICON = 18;

export const SocialButtons: React.FC<{
    onError: (message: string) => void;
    showDivider?: boolean;
    /** The welcome screen's smaller set: one-colour logos at one size, and a "Continue with email" button in the same style as Google's. */
    compact?: boolean;
    onEmail?: () => void;
    /** When given, tapping Apple/Google hands the provider to the caller instead of signing in (the welcome screen asks Personal or Pro first). */
    onProvider?: (provider: SocialProvider) => void;
}> = ({ onError, showDivider = true, compact = false, onEmail, onProvider }) => {
    const router = useRouter();
    const [busy, setBusy] = useState<SocialProvider | null>(null);
    const [showApple, setShowApple] = useState(false);

    // Apple's own sheet exists on iOS only; Google works everywhere (via the browser).
    useEffect(() => { void appleNativeAvailable().then(setShowApple); }, []);

    const go = async (provider: SocialProvider) => {
        if (busy) return;
        if (onProvider) { onProvider(provider); return; }
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

    if (compact) {
        return (
            <View style={styles.compactWrap}>
                {showApple && (
                    <Pressable style={({ pressed }) => [styles.cBtn, styles.apple, pressed && { opacity: 0.85 }]} onPress={() => go('apple')} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Continue with Apple">
                        {busy === 'apple' ? <ActivityIndicator color="#FFFFFF" /> : (<><AppleGlyph size={ICON} color="#FFFFFF" /><Text style={[styles.cText, { color: '#FFFFFF' }]}>Continue with Apple</Text></>)}
                    </Pressable>
                )}
                <Pressable style={({ pressed }) => [styles.cBtn, styles.outlined, pressed && { opacity: 0.85 }]} onPress={() => go('google')} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Continue with Google">
                    {busy === 'google' ? <ActivityIndicator color={colors.text} /> : (<><GoogleGlyph size={ICON} color={colors.text} /><Text style={styles.cText}>Continue with Google</Text></>)}
                </Pressable>
                {!!onEmail && (
                    <Pressable style={({ pressed }) => [styles.cBtn, styles.outlined, pressed && { opacity: 0.85 }]} onPress={onEmail} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Continue with email">
                        <Mail size={ICON} color={colors.text} strokeWidth={1.8} />
                        <Text style={styles.cText}>Continue with email</Text>
                    </Pressable>
                )}
            </View>
        );
    }

    return (
        <View style={[styles.wrap, !showDivider && { marginTop: 0 }]}>
            {showDivider && (
                <View style={styles.dividerRow}>
                    <View style={styles.line} /><Text style={styles.dividerText}>or continue with</Text><View style={styles.line} />
                </View>
            )}

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
    compactWrap: { gap: 10 },
    cBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 46, borderRadius: radius.pill },
    outlined: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.borderStrong },
    cText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
    line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
    dividerText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
    btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 52, borderRadius: radius.pill },
    apple: { backgroundColor: '#000000' },
    google: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.borderStrong },
    btnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    appleMark: { fontSize: 20, color: '#FFFFFF', marginTop: Platform.OS === 'ios' ? -2 : 0 },
});

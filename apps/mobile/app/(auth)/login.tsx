import { useState } from 'react';
import {
    View, Text, TextInput, Pressable, StyleSheet,
    KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { colors, radius, fonts } from '../../src/theme/tokens';

export default function LoginScreen() {
    const { signInWithPassword } = useAuth();
    const insets = useSafeAreaInsets();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const canSubmit = identifier.trim().length > 0 && password.length > 0 && !busy;

    const submit = async () => {
        if (!canSubmit) return;
        setBusy(true);
        setError(null);
        try {
            await signInWithPassword(identifier, password);
            // Navigation is handled by AuthGate once the session lands.
        } catch (err: any) {
            setError(err?.message || 'Could not sign you in. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView
                contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 64 }]}
                keyboardShouldPersistTaps="handled"
            >
                <Text style={styles.title}>MoneyWise Pro</Text>
                <Text style={styles.subtitle}>Sign in to continue</Text>

                <View style={styles.card}>
                    <Text style={styles.label}>Email or Username</Text>
                    <TextInput
                        style={styles.input}
                        value={identifier}
                        onChangeText={setIdentifier}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        textContentType="username"
                        placeholder="you@example.com"
                        placeholderTextColor={colors.textFaint}
                        returnKeyType="next"
                    />

                    <Text style={[styles.label, styles.labelSpaced]}>Password</Text>
                    <TextInput
                        style={styles.input}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        textContentType="password"
                        placeholder="••••••••"
                        placeholderTextColor={colors.textFaint}
                        returnKeyType="go"
                        onSubmitEditing={submit}
                    />

                    {error && <Text style={styles.error}>{error}</Text>}

                    <Pressable
                        style={({ pressed }) => [
                            styles.button,
                            !canSubmit && styles.buttonDisabled,
                            pressed && canSubmit && styles.buttonPressed,
                        ]}
                        onPress={submit}
                        disabled={!canSubmit}
                        accessibilityRole="button"
                    >
                        {busy
                            ? <ActivityIndicator color="#FFFFFF" />
                            : <Text style={styles.buttonText}>Sign In</Text>}
                    </Pressable>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.canvas },
    scroll: { paddingHorizontal: 24, paddingBottom: 48 },
    title: { fontFamily: fonts.display, fontSize: 32, color: colors.navy, textAlign: 'center' },
    subtitle: {
        fontFamily: fonts.body, fontSize: 15, color: colors.textMuted,
        textAlign: 'center', marginTop: 6, marginBottom: 32,
    },
    card: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 24,
        borderWidth: 1, borderColor: colors.border,
    },
    label: {
        fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, marginBottom: 8,
    },
    labelSpaced: { marginTop: 20 },
    input: {
        fontFamily: fonts.body, fontSize: 16, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.surface,
    },
    error: {
        fontFamily: fonts.body, fontSize: 13, color: colors.danger, marginTop: 16, lineHeight: 18,
    },
    button: {
        backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 16,
        alignItems: 'center', marginTop: 24, minHeight: 52, justifyContent: 'center',
    },
    buttonDisabled: { opacity: 0.4 },
    buttonPressed: { opacity: 0.85 },
    buttonText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
});

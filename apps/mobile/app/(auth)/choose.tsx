import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { AccountTypeChooser, type AccountType } from '../../src/components/auth/AccountTypeChooser';
import { track } from '../../src/lib/analytics';
import { colors, fonts, radius } from '../../src/theme/tokens';

/**
 * Email sign-up, step one: Personal or Pro. Email registration creates the workspace at once, so the choice has
 * to come before the form (Google/Apple ask the same question after signing in, on /complete-profile).
 */
export default function ChooseAccountTypeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [type, setType] = useState<AccountType>('INDIVIDUAL');

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
                <Pressable
                    onPress={() => {
                        track('account_type_chosen', { account_choice: type, via: 'email' });
                        router.push({ pathname: '/(auth)/login', params: { mode: 'signup', type } } as any);
                    }}
                    style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
                    accessibilityRole="button"
                >
                    <Text style={styles.ctaText}>Continue</Text>
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
    ctaText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: '#FFFFFF' },
});

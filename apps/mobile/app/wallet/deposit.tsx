import { useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet,
    ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cashbookService, formatKwacha } from 'core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';

const ACCOUNT_TYPES = [
    { value: 'CASH', label: 'Cash' },
    { value: 'BANK', label: 'Bank' },
    { value: 'AIRTEL_MONEY', label: 'Mobile Money' },
];

/**
 * Log a cash inflow. Mirrors the web CashInflowModal minus the denomination
 * breakdown, which is a till-counting aid that does not translate to a phone —
 * the field is still sent, empty, so the API contract is unchanged.
 */
export default function DepositScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();

    const [personName, setPersonName] = useState('');
    const [purpose, setPurpose] = useState('');
    const [contactDetails, setContactDetails] = useState('');
    const [amount, setAmount] = useState('');
    const [accountType, setAccountType] = useState('CASH');

    const numericAmount = Number(amount) || 0;
    const valid = personName.trim().length > 0 && purpose.trim().length > 0 && numericAmount > 0;

    const log = useMutation({
        mutationFn: () =>
            cashbookService.logInflow({
                personName: personName.trim(),
                purpose: purpose.trim(),
                contactDetails: contactDetails.trim(),
                date: new Date().toISOString().slice(0, 10),
                amount: numericAmount,
                denominations: {},
                accountType,
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['cashbook-entries'] });
            router.back();
        },
        onError: (e: Error) => Alert.alert('Deposit not logged', e.message),
    });

    return (
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Log Deposit" />

            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <View style={styles.card}>
                    <Text style={styles.label}>Amount (K)</Text>
                    <TextInput
                        style={[styles.input, styles.amountInput]}
                        value={amount}
                        onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={colors.textFaint}
                    />

                    <Text style={[styles.label, styles.spaced]}>Received into</Text>
                    <View style={styles.chips}>
                        {ACCOUNT_TYPES.map((t) => (
                            <Pressable
                                key={t.value}
                                onPress={() => setAccountType(t.value)}
                                style={[styles.chip, accountType === t.value && styles.chipActive]}
                            >
                                <Text style={[styles.chipText, accountType === t.value && styles.chipTextActive]}>
                                    {t.label}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.label}>Received from</Text>
                    <TextInput
                        style={styles.input}
                        value={personName}
                        onChangeText={setPersonName}
                        placeholder="Name of the person or business"
                        placeholderTextColor={colors.textFaint}
                    />

                    <Text style={[styles.label, styles.spaced]}>What is it for?</Text>
                    <TextInput
                        style={styles.input}
                        value={purpose}
                        onChangeText={setPurpose}
                        placeholder="e.g. Payment for invoice 104"
                        placeholderTextColor={colors.textFaint}
                    />

                    <Text style={[styles.label, styles.spaced]}>Contact (optional)</Text>
                    <TextInput
                        style={styles.input}
                        value={contactDetails}
                        onChangeText={setContactDetails}
                        placeholder="Phone or email"
                        placeholderTextColor={colors.textFaint}
                        keyboardType="phone-pad"
                    />
                </View>

                <View style={styles.totalCard}>
                    <Text style={styles.totalLabel}>Depositing</Text>
                    <Text style={styles.totalValue}>{formatKwacha(numericAmount)}</Text>
                </View>
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
                <Pressable
                    style={({ pressed }) => [styles.submit, !valid && styles.disabled, pressed && valid && { opacity: 0.85 }]}
                    onPress={() => log.mutate()}
                    disabled={!valid || log.isPending}
                >
                    {log.isPending
                        ? <ActivityIndicator color="#FFFFFF" />
                        : <Text style={styles.submitText}>Log deposit</Text>}
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    scroll: { padding: 20, gap: 14, paddingBottom: 32 },
    card: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20,
        borderWidth: 1, borderColor: colors.border,
    },
    label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, marginBottom: 8 },
    spaced: { marginTop: 18 },
    input: {
        fontFamily: fonts.body, fontSize: 15, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 14, paddingVertical: 12,
    },
    amountInput: { fontFamily: fonts.bodyBold, fontSize: 24 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill,
        borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface,
    },
    chipActive: { backgroundColor: colors.tabActiveBg, borderColor: colors.blue },
    chipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    chipTextActive: { color: colors.blue },
    totalCard: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20,
        borderWidth: 1, borderColor: colors.border,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    totalLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textMuted },
    totalValue: { fontFamily: fonts.display, fontSize: 24, color: colors.positiveInk },
    footer: {
        paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface,
        borderTopWidth: 1, borderTopColor: colors.border,
    },
    submit: {
        backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 16,
        alignItems: 'center', justifyContent: 'center', minHeight: 52,
    },
    disabled: { opacity: 0.4 },
    submitText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
});

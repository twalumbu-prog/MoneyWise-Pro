import { useEffect, useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet,
    ActivityIndicator, Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from 'core';
import type { PaymentInfo } from 'core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';

const BANK_OPTIONS = ['Absa Bank', 'Access Bank', 'Atlas Mara', 'Ecobank', 'FNB', 'Indo-Zambia Bank', 'Investrust', 'Stanbic Bank', 'Standard Chartered', 'ZANACO', 'Zambia Industrial Commercial Bank'];
const MOMO_OPTIONS = ['Airtel Money', 'MTN Mobile Money', 'Zamtel Kwacha'];

/**
 * Personal profile — disbursement details a requestor or staff loan recipient
 * gives so payouts can reach them directly. Name/role are read-only here
 * (an admin changes those via Team Members); this screen only edits payment info.
 */
export default function ProfileSettingsScreen() {
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ['users', 'me'],
        queryFn: () => userService.getMyProfile(),
    });

    const [payment, setPayment] = useState<PaymentInfo>({});
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        if (data?.payment_info) setPayment(data.payment_info);
    }, [data]);

    const set = (patch: Partial<PaymentInfo>) => { setPayment((p) => ({ ...p, ...patch })); setDirty(true); };

    const save = useMutation({
        mutationFn: () => userService.updatePaymentInfo(payment),
        onSuccess: () => {
            setDirty(false);
            qc.invalidateQueries({ queryKey: ['users', 'me'] });
            Alert.alert('Saved', 'Your payment information has been updated.');
        },
        onError: (e: Error) => Alert.alert('Could not save', e.message),
    });

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="My Profile" />

            {isLoading ? (
                <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
            ) : (
                <ScrollView contentContainerStyle={styles.scroll}>
                    <View style={styles.card}>
                        <Text style={styles.label}>Name</Text>
                        <Text style={styles.readonly}>{data?.name || '—'}</Text>
                        <Text style={[styles.label, styles.spaced]}>Role</Text>
                        <Text style={styles.readonly}>{data?.role || '—'}</Text>
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Bank details</Text>
                        <Text style={styles.label}>Bank</Text>
                        <ChipRow options={BANK_OPTIONS} value={payment.bank_name} onSelect={(v) => set({ bank_name: v })} />
                        <Text style={[styles.label, styles.spaced]}>Account number</Text>
                        <TextInput
                            style={styles.input}
                            value={payment.bank_account_number ?? ''}
                            onChangeText={(v) => set({ bank_account_number: v })}
                            keyboardType="number-pad"
                            placeholder="0123456789"
                            placeholderTextColor={colors.textFaint}
                        />
                        <Text style={[styles.label, styles.spaced]}>Account name</Text>
                        <TextInput
                            style={styles.input}
                            value={payment.bank_account_name ?? ''}
                            onChangeText={(v) => set({ bank_account_name: v })}
                            placeholder="As it appears on the account"
                            placeholderTextColor={colors.textFaint}
                        />
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Mobile money</Text>
                        <Text style={styles.label}>Provider</Text>
                        <ChipRow options={MOMO_OPTIONS} value={payment.mobile_money_provider} onSelect={(v) => set({ mobile_money_provider: v })} />
                        <Text style={[styles.label, styles.spaced]}>Number</Text>
                        <TextInput
                            style={styles.input}
                            value={payment.mobile_money_number ?? ''}
                            onChangeText={(v) => set({ mobile_money_number: v })}
                            keyboardType="phone-pad"
                            placeholder="09xxxxxxxx"
                            placeholderTextColor={colors.textFaint}
                        />
                        <Text style={[styles.label, styles.spaced]}>Registered name</Text>
                        <TextInput
                            style={styles.input}
                            value={payment.mobile_money_name ?? ''}
                            onChangeText={(v) => set({ mobile_money_name: v })}
                            placeholder="As registered with the provider"
                            placeholderTextColor={colors.textFaint}
                        />
                    </View>

                    <Pressable
                        style={[styles.saveBtn, !dirty && styles.saveBtnDisabled]}
                        onPress={() => save.mutate()}
                        disabled={!dirty || save.isPending}
                    >
                        {save.isPending
                            ? <ActivityIndicator color="#FFFFFF" />
                            : <Text style={styles.saveBtnText}>Save changes</Text>}
                    </Pressable>
                </ScrollView>
            )}
        </View>
    );
}

const ChipRow: React.FC<{ options: string[]; value?: string; onSelect: (v: string) => void }> = ({ options, value, onSelect }) => (
    <View style={styles.chips}>
        {options.map((o) => (
            <Pressable key={o} onPress={() => onSelect(o)} style={[styles.chip, value === o && styles.chipActive]}>
                <Text style={[styles.chipText, value === o && styles.chipTextActive]} numberOfLines={1}>{o}</Text>
            </Pressable>
        ))}
    </View>
);

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    centre: { paddingVertical: 64, alignItems: 'center' },
    scroll: { padding: 20, gap: 14, paddingBottom: 48 },
    card: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20,
        borderWidth: 1, borderColor: colors.border,
    },
    sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text, marginBottom: 10 },
    label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted, marginBottom: 7 },
    spaced: { marginTop: 14 },
    readonly: { fontFamily: fonts.body, fontSize: 15, color: colors.text },
    input: {
        fontFamily: fonts.body, fontSize: 14, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 14, paddingVertical: 11,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill,
        borderWidth: 1, borderColor: colors.borderStrong, maxWidth: '100%',
    },
    chipActive: { backgroundColor: colors.tabActiveBg, borderColor: colors.blue },
    chipText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    chipTextActive: { color: colors.blue },
    saveBtn: {
        backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 16,
        alignItems: 'center', justifyContent: 'center', minHeight: 52,
    },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
});

import { useState } from 'react';
import {
    View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { requisitionService, formatKwacha } from 'core';
import { colors, fonts, radius } from '../../theme/tokens';

const METHODS = [
    { value: 'CASH', label: 'Cash' },
    { value: 'BANK', label: 'Bank transfer' },
    { value: 'MOBILE_MONEY', label: 'Mobile money' },
] as const;

/**
 * Pay out an authorised requisition.
 *
 * CASH settles immediately in the ledger. BANK and MOBILE_MONEY go out through
 * Lenco and come back PROCESSING, so the copy says the payout is on its way
 * rather than done — an outbound MTN payout can sit pending for hours, and
 * telling the cashier it completed would be wrong.
 */
export const DisburseSheet: React.FC<{
    requisitionId: string;
    amount: number;
    recipientName?: string;
    recipientAccount?: string;
    onDone: () => void;
}> = ({ requisitionId, amount, recipientName, recipientAccount, onDone }) => {
    const qc = useQueryClient();
    const [method, setMethod] = useState<string>('CASH');
    const [account, setAccount] = useState(recipientAccount ?? '');
    const [accountName, setAccountName] = useState(recipientName ?? '');

    const needsAccount = method !== 'CASH';
    const valid = amount > 0 && (!needsAccount || account.trim().length > 0);

    const pay = useMutation({
        mutationFn: () =>
            requisitionService.disburse(requisitionId, {
                payment_method: method,
                total_prepared: amount,
                ...(needsAccount
                    ? { recipient_account: account.trim(), recipient_account_name: accountName.trim() || undefined }
                    : {}),
            }),
        onSuccess: (res: any) => {
            qc.invalidateQueries({ queryKey: ['requisitions'] });
            qc.invalidateQueries({ queryKey: ['cashbook-entries'] });
            Alert.alert(
                method === 'CASH' ? 'Disbursed' : 'Payout sent',
                method === 'CASH'
                    ? `${formatKwacha(amount)} recorded as paid out.`
                    : res?.lencoStatus === 'PROCESSING' || !res?.lencoStatus
                        ? 'The payout is on its way. It can take a while to settle — the status will update on its own.'
                        : `Payout status: ${res.lencoStatus}.`,
            );
            onDone();
        },
        onError: (e: Error) => Alert.alert('Disbursement failed', e.message),
    });

    return (
        <View style={styles.root}>
            <Text style={styles.sectionTitle}>Pay out {formatKwacha(amount)}</Text>

            <Text style={styles.label}>Method</Text>
            <View style={styles.chips}>
                {METHODS.map((m) => (
                    <Pressable
                        key={m.value}
                        onPress={() => setMethod(m.value)}
                        style={[styles.chip, method === m.value && styles.chipActive]}
                    >
                        <Text style={[styles.chipText, method === m.value && styles.chipTextActive]}>{m.label}</Text>
                    </Pressable>
                ))}
            </View>

            {needsAccount && (
                <>
                    <Text style={[styles.label, styles.spaced]}>
                        {method === 'BANK' ? 'Account number' : 'Mobile number'}
                    </Text>
                    <TextInput
                        style={styles.input}
                        value={account}
                        onChangeText={setAccount}
                        keyboardType={method === 'BANK' ? 'number-pad' : 'phone-pad'}
                        placeholder={method === 'BANK' ? '0123456789' : '09xxxxxxxx'}
                        placeholderTextColor={colors.textFaint}
                    />
                    <Text style={[styles.label, styles.spaced]}>Recipient name</Text>
                    <TextInput
                        style={styles.input}
                        value={accountName}
                        onChangeText={setAccountName}
                        placeholder="Who is being paid"
                        placeholderTextColor={colors.textFaint}
                    />
                </>
            )}

            <Pressable
                style={({ pressed }) => [styles.btn, !valid && styles.disabled, pressed && valid && { opacity: 0.85 }]}
                onPress={() => pay.mutate()}
                disabled={!valid || pay.isPending}
            >
                {pay.isPending
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <Text style={styles.btnText}>
                        {method === 'CASH' ? 'Record payout' : 'Send payout'}
                    </Text>}
            </Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    root: { gap: 8 },
    sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text, marginBottom: 6 },
    label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, marginBottom: 8 },
    spaced: { marginTop: 14 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill,
        borderWidth: 1, borderColor: colors.borderStrong,
    },
    chipActive: { backgroundColor: colors.tabActiveBg, borderColor: colors.blue },
    chipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    chipTextActive: { color: colors.blue },
    input: {
        fontFamily: fonts.body, fontSize: 15, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 14, paddingVertical: 12,
    },
    btn: {
        backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 15,
        alignItems: 'center', justifyContent: 'center', minHeight: 50, marginTop: 18,
    },
    disabled: { opacity: 0.4 },
    btnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
});

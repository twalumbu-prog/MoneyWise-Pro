import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView } from 'react-native';
import { Stack } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Mail } from 'lucide-react-native';
import { investmentService, ZAMBIA_BANK_NAMES } from 'core';
import { useAuth } from '../../src/context/AuthContext';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ErrorBanner, PrimaryButton, TextField, Toggle } from '../../src/components/onboarding/ui';
import { SelectField } from '../../src/components/invest/application/formFields';
import { colors, fonts, radius } from '../../src/theme/tokens';

/**
 * Where an investment company's investor deposits are sent. Saving verifies the bank
 * account, then keeps one Automation in step with it (deposit lands → transfer to this
 * account → proof-of-payment email). Admin only: it decides where money goes.
 */
export default function InvestorPayoutsScreen() {
    const qc = useQueryClient();
    const { userRole } = useAuth();
    const isAdmin = userRole === 'ADMIN';

    const { data, isLoading, error: loadError } = useQuery({
        queryKey: ['investor-payout-settings'],
        queryFn: () => investmentService.getPayoutSettings(),
        enabled: isAdmin,
    });

    const [bank, setBank] = useState('');
    const [branch, setBranch] = useState('');
    const [number, setNumber] = useState('');
    const [name, setName] = useState('');
    const [forward, setForward] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [banner, setBanner] = useState<string | null>(null);

    useEffect(() => {
        if (!data) return;
        setBank(data.bankName ?? '');
        setBranch(data.branch ?? '');
        setNumber(data.accountNumber ?? '');
        setName(data.accountName ?? '');
        setForward(data.forwardDeposits);
    }, [data]);

    const save = useMutation({
        mutationFn: () => investmentService.savePayoutSettings({
            bankName: bank, branch: branch || undefined, accountNumber: number, accountName: name || undefined, forwardDeposits: forward,
        }),
        onSuccess: (res) => {
            qc.setQueryData(['investor-payout-settings'], res);
            qc.invalidateQueries({ queryKey: ['automations'] });
            setBanner(null);
            Alert.alert(
                'Saved',
                res.forwardDeposits
                    ? `Investor deposits will be forwarded to ${res.accountName} (${res.bankName}).`
                    : 'Your payout details are saved. Forwarding is off.',
            );
        },
        onError: (e: any) => setBanner(e?.message || 'Could not save. Please try again.'),
    });

    const onSave = () => {
        const e: Record<string, string> = {};
        if (!bank) e.bank = 'Select a bank';
        if (!/^[0-9A-Za-z-]{4,34}$/.test(number.trim())) e.number = 'Enter a valid account number';
        setErrors(e);
        if (Object.keys(e).length) { setBanner('Please fix the highlighted fields.'); return; }
        setBanner(null);
        save.mutate();
    };

    if (!isAdmin) {
        return (
            <View style={styles.root}>
                <Stack.Screen options={{ headerShown: false }} />
                <ScreenHeader title="Investor payouts" />
                <View style={styles.centre}><Text style={styles.muted}>Only an admin can change where deposits are sent.</Text></View>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Investor payouts" />
            {isLoading ? (
                <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
            ) : loadError ? (
                <View style={styles.centre}><Text style={styles.muted}>{(loadError as Error).message}</Text></View>
            ) : data && !data.isInvestmentCompany ? (
                <View style={styles.centre}><Text style={styles.muted}>This organization isn't listed as an investment company, so there are no investor deposits to forward.</Text></View>
            ) : (
                <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
                    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                        <Text style={styles.intro}>Money investors deposit into your MoneyWise wallet can be sent on to your bank account automatically.</Text>
                        <ErrorBanner message={banner} />

                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>Bank account</Text>
                            <SelectField label="Bank" value={bank} options={ZAMBIA_BANK_NAMES.map((b) => ({ value: b, label: b }))} onChange={(v) => { setBank(v); setErrors((x) => ({ ...x, bank: '' })); }} error={errors.bank} searchable />
                            <TextField label="Branch" value={branch} onChangeText={setBranch} optional autoCapitalize="words" />
                            <TextField label="Account number" value={number} onChangeText={(t) => { setNumber(t); setErrors((x) => ({ ...x, number: '' })); }} error={errors.number} keyboardType="number-pad" />
                            <TextField label="Account name" value={name} onChangeText={setName} optional autoCapitalize="words" placeholder="Filled in from the bank when you save" />
                            <View style={styles.verify}><ShieldCheck size={15} color={colors.positiveInk} /><Text style={styles.verifyText}>We verify the account with the bank before saving.</Text></View>
                        </View>

                        <View style={styles.card}>
                            <Toggle
                                label="Forward investor deposits"
                                description="Every deposit into your wallet is transferred to this account automatically."
                                checked={forward}
                                onChange={setForward}
                            />
                            {!!data?.proofOfPaymentEmail && (
                                <View style={styles.verify}><Mail size={15} color={colors.blue} /><Text style={styles.verifyText}>A proof of payment is emailed to {data.proofOfPaymentEmail} after each transfer.</Text></View>
                            )}
                            <Text style={styles.fine}>Only deposits made after you switch this on are forwarded. Transfer fees are paid from the wallet when it can cover them, otherwise deducted from the transfer.</Text>
                        </View>

                        <PrimaryButton onPress={onSave} loading={save.isPending}>Save</PrimaryButton>
                    </ScrollView>
                </KeyboardAvoidingView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    muted: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
    scroll: { padding: 20, paddingBottom: 40, gap: 4 },
    intro: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: 16 },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 18, marginBottom: 16 },
    cardTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.navy, marginBottom: 14 },
    verify: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 4 },
    verifyText: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17 },
    fine: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, lineHeight: 17, marginTop: 10 },
});

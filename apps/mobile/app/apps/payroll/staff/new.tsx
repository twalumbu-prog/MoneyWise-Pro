import { useEffect, useRef, useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet,
    ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, AlertCircle } from 'lucide-react-native';
import { payrollService, lencoService, detectMobileNetwork } from 'core';
import { ScreenHeader } from '../../../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../../../src/theme/tokens';

const NETWORK_COLOR: Record<string, string> = { AIRTEL: '#DC2626', MTN: '#D97706', ZAMTEL: '#2563EB' };

/**
 * Add staff. Same fields as AddStaffWizard.tsx, as one scrolling form rather
 * than a paged wizard (the app's convention throughout the port — on a phone
 * the whole thing fits). The bank/mobile-money debounced verification against
 * Lenco is kept: it's what catches a mistyped payout account before the first
 * payroll run, not a cosmetic nicety.
 */
export default function AddStaffScreen() {
    const router = useRouter();
    const qc = useQueryClient();

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [department, setDepartment] = useState('');
    const [position, setPosition] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [basicPay, setBasicPay] = useState('');

    const [bankEnabled, setBankEnabled] = useState(false);
    const [bankId, setBankId] = useState('');
    const [bankAccountNumber, setBankAccountNumber] = useState('');
    const [bankResolving, setBankResolving] = useState(false);
    const [bankResolvedName, setBankResolvedName] = useState('');
    const [bankResolveError, setBankResolveError] = useState('');

    const [mobileEnabled, setMobileEnabled] = useState(false);
    const [mobileNumber, setMobileNumber] = useState('');
    const [mobileResolving, setMobileResolving] = useState(false);
    const [mobileResolvedName, setMobileResolvedName] = useState('');
    const [mobileResolveError, setMobileResolveError] = useState('');
    const mobileNetwork = mobileEnabled ? detectMobileNetwork(mobileNumber) : '';

    const { data: banks } = useQuery({
        queryKey: ['lenco-banks'],
        queryFn: () => lencoService.getBanks(),
        enabled: bankEnabled,
    });

    // Debounced bank account verification.
    const bankTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (bankTimer.current) clearTimeout(bankTimer.current);
        if (!bankEnabled || !bankId || bankAccountNumber.length < 5) {
            setBankResolvedName(''); setBankResolveError('');
            return;
        }
        bankTimer.current = setTimeout(async () => {
            setBankResolving(true); setBankResolvedName(''); setBankResolveError('');
            try {
                const res = await lencoService.resolveBankAccount(bankAccountNumber, bankId);
                setBankResolvedName(res.accountName || res.account_name || res.name || '');
            } catch {
                setBankResolveError('Could not verify account. Please check the details.');
            } finally {
                setBankResolving(false);
            }
        }, 600);
        return () => { if (bankTimer.current) clearTimeout(bankTimer.current); };
    }, [bankAccountNumber, bankId, bankEnabled]);

    // Debounced mobile-money verification.
    const momoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (momoTimer.current) clearTimeout(momoTimer.current);
        setMobileResolvedName(''); setMobileResolveError('');
        if (!mobileEnabled || !mobileNetwork || mobileNumber.replace(/[^0-9]/g, '').length < 10) return;
        momoTimer.current = setTimeout(async () => {
            setMobileResolving(true);
            try {
                const res = await lencoService.resolveMobileMoney(mobileNumber, mobileNetwork);
                setMobileResolvedName(res.accountName || res.account_name || res.name || '');
            } catch {
                setMobileResolveError('Could not verify number. Please check.');
            } finally {
                setMobileResolving(false);
            }
        }, 600);
        return () => { if (momoTimer.current) clearTimeout(momoTimer.current); };
    }, [mobileNumber, mobileEnabled, mobileNetwork]);

    const effectivePaymentMethod = (): 'BANK' | 'MOBILE_MONEY' => {
        const hasBank = bankEnabled && bankAccountNumber.trim();
        const hasMobile = mobileEnabled && mobileNumber.trim();
        if (hasMobile && !hasBank) return 'MOBILE_MONEY';
        return 'BANK';
    };

    const valid = firstName.trim().length > 0 && lastName.trim().length > 0 && Number(basicPay) > 0;

    const create = useMutation({
        mutationFn: () => {
            const bankNameLabel = (banks ?? []).find((b: any) => b.id === bankId)?.name || '';
            return payrollService.createStaffMember({
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                department: department.trim() || undefined,
                position: position.trim() || undefined,
                phone: phone.trim() || undefined,
                email: email.trim() || undefined,
                basic_pay: Number(basicPay),
                payment_method: effectivePaymentMethod(),
                bank_name: bankEnabled ? bankNameLabel : undefined,
                bank_account_number: bankEnabled ? bankAccountNumber.trim() : undefined,
                bank_account_name: bankEnabled ? bankResolvedName : undefined,
                mobile_money_provider: mobileEnabled ? mobileNetwork : undefined,
                mobile_money_number: mobileEnabled ? mobileNumber.trim() : undefined,
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['payroll-staff'] });
            router.back();
        },
        onError: (e: Error) => Alert.alert('Could not add staff', e.message),
    });

    return (
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Add Staff" />
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Personal details</Text>
                    <Row2>
                        <Field label="First name" value={firstName} onChange={setFirstName} />
                        <Field label="Last name" value={lastName} onChange={setLastName} />
                    </Row2>
                    <Row2>
                        <Field label="Department" value={department} onChange={setDepartment} />
                        <Field label="Position" value={position} onChange={setPosition} />
                    </Row2>
                    <Row2>
                        <Field label="Phone" value={phone} onChange={setPhone} keyboardType="phone-pad" />
                        <Field label="Email" value={email} onChange={setEmail} keyboardType="email-address" />
                    </Row2>
                </View>

                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Compensation</Text>
                    <Field label="Basic pay (K)" value={basicPay} onChange={(v) => setBasicPay(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
                </View>

                <View style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Bank account</Text>
                        <Switch value={bankEnabled} onValueChange={setBankEnabled} trackColor={{ true: colors.blue, false: colors.borderStrong }} />
                    </View>
                    {bankEnabled && (
                        <>
                            <Text style={[styles.label, styles.spaced]}>Bank</Text>
                            <View style={styles.chips}>
                                {(banks ?? []).slice(0, 12).map((b: any) => (
                                    <Pressable key={b.id} onPress={() => setBankId(b.id)} style={[styles.chip, bankId === b.id && styles.chipActive]}>
                                        <Text style={[styles.chipText, bankId === b.id && styles.chipTextActive]} numberOfLines={1}>{b.name}</Text>
                                    </Pressable>
                                ))}
                            </View>
                            <Text style={[styles.label, styles.spaced]}>Account number</Text>
                            <TextInput style={styles.input} value={bankAccountNumber} onChangeText={setBankAccountNumber} keyboardType="number-pad" placeholderTextColor={colors.textFaint} />
                            <VerificationRow busy={bankResolving} name={bankResolvedName} error={bankResolveError} />
                        </>
                    )}
                </View>

                <View style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Mobile money</Text>
                        <Switch value={mobileEnabled} onValueChange={setMobileEnabled} trackColor={{ true: colors.blue, false: colors.borderStrong }} />
                    </View>
                    {mobileEnabled && (
                        <>
                            <Text style={[styles.label, styles.spaced]}>Number</Text>
                            <TextInput style={styles.input} value={mobileNumber} onChangeText={setMobileNumber} keyboardType="phone-pad" placeholder="09xxxxxxxx" placeholderTextColor={colors.textFaint} />
                            {!!mobileNetwork && (
                                <View style={[styles.networkPill, { borderColor: NETWORK_COLOR[mobileNetwork] }]}>
                                    <Text style={[styles.networkPillText, { color: NETWORK_COLOR[mobileNetwork] }]}>{mobileNetwork}</Text>
                                </View>
                            )}
                            <VerificationRow busy={mobileResolving} name={mobileResolvedName} error={mobileResolveError} />
                        </>
                    )}
                </View>

                <Pressable style={[styles.saveBtn, !valid && styles.saveBtnDisabled]} onPress={() => create.mutate()} disabled={!valid || create.isPending}>
                    {create.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveBtnText}>Add staff member</Text>}
                </Pressable>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const Row2: React.FC<{ children: React.ReactNode }> = ({ children }) => <View style={styles.row2}>{children}</View>;
const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; keyboardType?: any }> = ({ label, value, onChange, keyboardType }) => (
    <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <TextInput style={styles.input} value={value} onChangeText={onChange} keyboardType={keyboardType} placeholderTextColor={colors.textFaint} />
    </View>
);
const VerificationRow: React.FC<{ busy: boolean; name: string; error: string }> = ({ busy, name, error }) => {
    if (busy) return <View style={styles.verifyRow}><ActivityIndicator size="small" color={colors.blue} /><Text style={styles.verifyText}>Verifying…</Text></View>;
    if (name) return <View style={styles.verifyRow}><CheckCircle2 size={14} color={colors.positiveInk} /><Text style={[styles.verifyText, { color: colors.positiveInk }]}>{name}</Text></View>;
    if (error) return <View style={styles.verifyRow}><AlertCircle size={14} color={colors.danger} /><Text style={[styles.verifyText, { color: colors.danger }]}>{error}</Text></View>;
    return null;
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    scroll: { padding: 20, gap: 14, paddingBottom: 48 },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, borderWidth: 1, borderColor: colors.border, gap: 10 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    row2: { flexDirection: 'row', gap: 10 },
    label: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textMuted, marginBottom: 6 },
    spaced: { marginTop: 4 },
    input: {
        fontFamily: fonts.body, fontSize: 13, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 12, paddingVertical: 10,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, maxWidth: 160 },
    chipActive: { backgroundColor: colors.tabActiveBg, borderColor: colors.blue },
    chipText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textMuted },
    chipTextActive: { color: colors.blue },
    networkPill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
    networkPillText: { fontFamily: fonts.bodyBold, fontSize: 10 },
    verifyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    verifyText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textFaint },
    saveBtn: { backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
});

import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, AlertCircle } from 'lucide-react-native';
import { lencoService } from 'core';
import { useAuth } from '../../../context/AuthContext';
import { BankAvatar } from '../../BankAvatar';
import { SelectField } from './formFields';
import { colors, fonts, radius } from '../../../theme/tokens';

/**
 * Bank + account number, the same as the "Send money" bank option: pick the bank (with its
 * logo), type the account number, and the account holder's name is fetched from the bank and
 * shown. The verified name is what gets saved on the application, so it can't be mistyped.
 */
export const BankAccountFields: React.FC<{
    bankName: string;
    accountNumber: string;
    accountName: string;
    onChange: (patch: { bank_name?: string; bank_account_number?: string; bank_account_name?: string }) => void;
    bankError?: string;
    numberError?: string;
}> = ({ bankName, accountNumber, accountName, onChange, bankError, numberError }) => {
    const { organizationId } = useAuth();
    const [verifying, setVerifying] = useState(false);
    const [failed, setFailed] = useState(false);
    const requestRef = useRef(0);

    const { data: banksRaw } = useQuery({ queryKey: ['lenco-banks'], queryFn: () => lencoService.getBanks(), staleTime: 60 * 60_000 });
    const banks: any[] = Array.isArray(banksRaw) ? banksRaw : (banksRaw?.data || []);

    const options = useMemo(
        () => banks.map((b) => ({ value: String(b.name), label: String(b.name), leading: <BankAvatar name={String(b.name)} size={26} /> })),
        [banks],
    );
    const bankId = useMemo(() => {
        const b = banks.find((x) => String(x.name) === bankName);
        return b ? String(b.id ?? b.code) : '';
    }, [banks, bankName]);

    // Look the account up as soon as there's a bank and a plausible number; ignore stale answers.
    useEffect(() => {
        const number = accountNumber.trim();
        if (!bankId || number.length < 5) {
            setVerifying(false); setFailed(false);
            if (accountName) onChange({ bank_account_name: '' });
            return;
        }
        const id = ++requestRef.current;
        setVerifying(true); setFailed(false);
        const timer = setTimeout(async () => {
            try {
                const res = await lencoService.resolveBankAccount(number, bankId, organizationId ?? undefined);
                if (id !== requestRef.current) return;
                const name = res?.accountName || res?.account_name || res?.name || '';
                onChange({ bank_account_name: name });
                setFailed(!name);
            } catch {
                if (id !== requestRef.current) return;
                onChange({ bank_account_name: '' });
                setFailed(true);
            } finally {
                if (id === requestRef.current) setVerifying(false);
            }
        }, 450);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bankId, accountNumber]);

    const showHolder = accountNumber.trim().length >= 5 && !!bankName;

    return (
        <View>
            <SelectField
                label="Bank"
                value={bankName}
                options={options}
                onChange={(v) => onChange({ bank_name: v, bank_account_name: '' })}
                placeholder={banks.length === 0 ? 'Loading banks…' : 'Select bank'}
                error={bankError}
                searchable
            />
            <View style={styles.field}>
                <Text style={styles.label}>Account number</Text>
                <TextInput
                    value={accountNumber}
                    onChangeText={(t) => onChange({ bank_account_number: t.replace(/[^0-9A-Za-z-]/g, ''), bank_account_name: '' })}
                    placeholder="Enter account number"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="number-pad"
                    style={[styles.input, !!numberError && styles.inputError]}
                    accessibilityLabel="Account number"
                />
                {!!numberError && <Text style={styles.error}>{numberError}</Text>}
            </View>

            {showHolder && (
                <View style={[styles.holder, failed && !verifying && styles.holderWarn]}>
                    {verifying ? <ActivityIndicator size="small" color={colors.blue} />
                        : accountName ? <CheckCircle size={18} color={colors.positiveInk} />
                        : <AlertCircle size={18} color={colors.warn} />}
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.holderLabel, failed && !verifying && { color: colors.warn }]}>Account holder</Text>
                        <Text style={styles.holderName}>
                            {verifying ? 'Verifying account…' : accountName || (failed ? 'We couldn’t verify this account. Check the bank and number.' : 'Waiting for valid details…')}
                        </Text>
                    </View>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    field: { marginBottom: 16 },
    label: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy, marginBottom: 6 },
    input: {
        minHeight: 48, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong,
        paddingHorizontal: 16, paddingVertical: 12, fontFamily: fonts.body, fontSize: 15, color: colors.text,
    },
    inputError: { borderColor: colors.danger },
    error: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.danger, marginTop: 4 },
    holder: {
        flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#EEF4FF',
        borderWidth: 1, borderColor: 'rgba(0,106,255,0.1)', borderRadius: radius.lg, padding: 14,
    },
    holderWarn: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
    holderLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.blue, textTransform: 'uppercase', letterSpacing: 0.5 },
    holderName: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy, marginTop: 2 },
});

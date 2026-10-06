import { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { Check, AlertCircle } from 'lucide-react-native';
import { lencoService, detectMobileNetwork } from 'core';
import { colors, fonts, radius } from '../../theme/tokens';
import { phoneFromPrefixedInput, prefixedInputValue } from '../../lib/phone';

const OPERATOR_COLOR: Record<string, string> = { AIRTEL: '#EF4444', MTN: '#F59E0B', ZAMTEL: '#10B981' };

/** Detects the network from the typed number and looks up the account holder's name (debounced). */
export function useMomoHolder(phone: string, enabled = true) {
    const operator = phone ? (detectMobileNetwork(phone) || null) : null;
    const [holder, setHolder] = useState('');
    const [resolving, setResolving] = useState(false);
    const [resolveFailed, setResolveFailed] = useState(false);

    useEffect(() => {
        if (!enabled || !operator) { setHolder(''); setResolving(false); setResolveFailed(false); return; }
        let stop = false;
        const t = setTimeout(async () => {
            setResolving(true); setResolveFailed(false);
            try {
                const r = await lencoService.resolveMobileMoney(phone, operator.toLowerCase());
                if (stop) return;
                setHolder(r?.accountName || '');
                setResolveFailed(!r?.accountName);
            } catch { if (!stop) { setHolder(''); setResolveFailed(true); } }
            finally { if (!stop) setResolving(false); }
        }, 450);
        return () => { stop = true; clearTimeout(t); };
    }, [phone, operator, enabled]);

    return { operator, holder, resolving, resolveFailed };
}

/**
 * The mobile-money number input every in-app Lenco payment uses: 🇿🇲 +260 prefix (type the number
 * without its leading 0), the network in its own colour, and the "Account holder" card so the
 * payer can confirm whose number it is before the prompt is sent.
 */
export const MobileMoneyNumberField: React.FC<{
    label?: string;
    phone: string;
    onChangePhone: (phone: string) => void;
    operator: string | null;
    holder: string;
    resolving: boolean;
    resolveFailed: boolean;
}> = ({ label = 'Your mobile money number', phone, onChangePhone, operator, holder, resolving, resolveFailed }) => (
    <View>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.phoneRow}>
            <View style={styles.phonePrefix}><Text style={styles.flag}>🇿🇲</Text><Text style={styles.prefixText}>+260</Text></View>
            <TextInput
                style={styles.phoneInput}
                value={prefixedInputValue(phone)}
                onChangeText={(t) => onChangePhone(phoneFromPrefixedInput(t))}
                placeholder="97 123 4567"
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
                accessibilityLabel="Mobile money number"
            />
            {!!operator && <Text style={[styles.operator, { color: OPERATOR_COLOR[operator.toUpperCase()] || colors.text }]}>{operator.toUpperCase()}</Text>}
        </View>

        {phone.replace(/[^0-9]/g, '').length >= 9 && (
            <View style={styles.holder}>
                {resolving ? <ActivityIndicator size="small" color={colors.blue} />
                    : holder ? <Check size={16} color={colors.positiveInk} />
                    : <AlertCircle size={16} color={colors.warn} />}
                <View style={{ flex: 1 }}>
                    <Text style={styles.holderLabel}>ACCOUNT HOLDER</Text>
                    <Text style={styles.holderName} numberOfLines={1}>
                        {resolving ? 'Verifying number…' : holder || (resolveFailed ? 'Could not verify — check the number' : 'Waiting for a valid number…')}
                    </Text>
                </View>
            </View>
        )}
    </View>
);

const styles = StyleSheet.create({
    label: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted, marginBottom: 8 },
    phoneRow: { flexDirection: 'row', alignItems: 'center', minHeight: 50, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, overflow: 'hidden' },
    phonePrefix: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, alignSelf: 'stretch', backgroundColor: '#F5F5F5', borderRightWidth: 1, borderRightColor: colors.borderStrong },
    flag: { fontSize: 16 },
    prefixText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.textMuted },
    phoneInput: { flex: 1, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 15, color: colors.text },
    operator: { fontFamily: fonts.bodyBold, fontSize: 12, marginRight: 14, letterSpacing: -0.3 },
    holder: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    holderLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, letterSpacing: 1 },
    holderName: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text, marginTop: 2 },
});

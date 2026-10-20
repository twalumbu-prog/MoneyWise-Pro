import { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { requisitionService, formatKwacha } from 'core';
import { colors, fonts, radius } from '../../theme/tokens';

/**
 * An admin acknowledges that (part of) a salary advance or staff loan has been paid back outside payroll — cash handed over, a
 * bank deposit… It lowers what is still owed, settles the loan when nothing is left, and, when the borrower holds the money in a
 * MoneyWise personal account, works the liability off in their books too. Payroll deductions are recorded by payroll itself.
 */
export const LoanRecoverySheet: React.FC<{ visible: boolean; requisitionId: string; kind: 'LOAN' | 'ADVANCE'; onClose: () => void; onDone: () => void }> = ({ visible, requisitionId, kind, onClose, onDone }) => {
    const insets = useSafeAreaInsets();
    const qc = useQueryClient();
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { data: bal, isLoading } = useQuery({
        queryKey: ['loan-balance', requisitionId],
        queryFn: () => requisitionService.getLoanBalance(requisitionId),
        enabled: visible,
    });

    useEffect(() => { if (visible && bal) setAmount(bal.outstanding > 0 ? String(bal.outstanding) : ''); }, [visible, bal?.outstanding]);

    const label = kind === 'LOAN' ? 'loan' : 'salary advance';
    const value = Number(amount) || 0;
    const valid = value > 0 && !!bal && value <= bal.outstanding + 0.005;

    const submit = async () => {
        setBusy(true); setError(null);
        try {
            const r = await requisitionService.recordLoanRecovery(requisitionId, value, note.trim() || undefined);
            await qc.invalidateQueries({ queryKey: ['loan-balance', requisitionId] });
            onDone();
            onClose();
            Alert.alert(r.settled ? 'Fully recovered' : 'Recovery recorded', r.settled
                ? `The ${label} is now fully recovered.`
                : `${formatKwacha(r.recovered)} recorded. ${formatKwacha(r.outstanding)} is still outstanding.`);
        } catch (e: any) {
            setError(e?.message || 'Could not record the recovery.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <KeyboardAvoidingView behavior="padding" style={styles.wrap} pointerEvents="box-none">
                <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
                    <View style={styles.handle} />
                    <View style={styles.header}>
                        <Text style={styles.title}>Record {label} recovery</Text>
                        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}><X size={18} color={colors.textFaint} /></Pressable>
                    </View>

                    {isLoading || !bal ? (
                        <View style={{ paddingVertical: 36 }}><ActivityIndicator color={colors.blue} /></View>
                    ) : (
                        <View style={styles.body}>
                            <View style={styles.summary}>
                                <Stat label="Owed" value={formatKwacha(bal.owed)} />
                                <Stat label="Recovered" value={formatKwacha(bal.recovered)} />
                                <Stat label="Outstanding" value={formatKwacha(bal.outstanding)} strong />
                            </View>
                            <Text style={styles.hint}>Use this for repayments made outside payroll. Payroll deductions are recorded automatically when a payroll run is approved.</Text>

                            <Text style={styles.label}>Amount recovered (K)</Text>
                            <TextInput style={styles.input} value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textFaint} />
                            <Text style={[styles.label, { marginTop: 14 }]}>Note (optional)</Text>
                            <TextInput style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]} value={note} onChangeText={setNote} multiline placeholder="e.g. Cash repaid on 20 Oct" placeholderTextColor={colors.textFaint} />

                            {!!error && <Text style={styles.error}>{error}</Text>}
                            {value > bal.outstanding + 0.005 && <Text style={styles.error}>Only {formatKwacha(bal.outstanding)} is still outstanding.</Text>}

                            <Pressable onPress={submit} disabled={!valid || busy} style={({ pressed }) => [styles.btn, (!valid || busy) && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}>
                                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnText}>Record recovery</Text>}
                            </Pressable>
                        </View>
                    )}
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const Stat: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
    <View style={{ flex: 1 }}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={[styles.statValue, strong && { color: colors.navy }]}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,42,60,0.5)' },
    wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginTop: 10 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.canvasAlt },
    title: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.navy },
    closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center' },
    body: { paddingHorizontal: 24, paddingTop: 16 },
    summary: { flexDirection: 'row', backgroundColor: colors.canvasAlt, borderRadius: radius.md, padding: 14, marginBottom: 12 },
    statLabel: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textFaint },
    statValue: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text, marginTop: 2 },
    hint: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17, marginBottom: 16 },
    label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, marginBottom: 6 },
    input: { fontFamily: fonts.body, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12 },
    error: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.danger, marginTop: 10 },
    btn: { backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', minHeight: 50, marginTop: 20 },
    btnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
});

import { useEffect, useState } from 'react';
import { KB_DONE_ID } from '../../src/components/KeyboardDoneBar';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet,
    ActivityIndicator, Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react-native';
import { userService } from 'core';
import type { BankAccount, MobileMoneyAccount } from 'core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { InlineSearchSelect } from '../../src/components/InlineSearchSelect';
import { colors, fonts, radius } from '../../src/theme/tokens';

const BANK_OPTIONS = ['Absa Bank', 'Access Bank', 'Atlas Mara', 'Ecobank', 'FNB', 'Indo-Zambia Bank', 'Investrust', 'Stanbic Bank', 'Standard Chartered', 'ZANACO', 'Zambia Industrial Commercial Bank'];
const MOMO_OPTIONS = ['Airtel Money', 'MTN Mobile Money', 'Zamtel Kwacha'];

let idSeq = 0;
const newId = () => `acc-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;

/**
 * Personal profile — the payout details a requestor, staff loan recipient or employee gives so money can reach them directly.
 * A person can keep several bank accounts and several mobile-money accounts; one of each is the primary (what is used by
 * default). Name/role are read-only here (an admin changes those via Team Members); this screen only edits payout details.
 */
export default function ProfileSettingsScreen() {
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ['users', 'me'],
        queryFn: () => userService.getMyProfile(),
    });

    const [banks, setBanks] = useState<BankAccount[]>([]);
    const [momos, setMomos] = useState<MobileMoneyAccount[]>([]);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        const pi = data?.payment_info;
        if (!pi) return;
        setBanks(pi.bank_accounts ?? (pi.bank_account_number ? [{ id: 'primary-bank', bank_name: pi.bank_name ?? '', account_number: pi.bank_account_number, account_name: pi.bank_account_name ?? '', is_default: true }] : []));
        setMomos(pi.mobile_money_accounts ?? (pi.mobile_money_number ? [{ id: 'primary-momo', provider: pi.mobile_money_provider ?? '', number: pi.mobile_money_number, name: pi.mobile_money_name ?? '', is_default: true }] : []));
        setDirty(false);
    }, [data]);

    const editBank = (id: string, patch: Partial<BankAccount>) => { setBanks((l) => l.map((a) => (a.id === id ? { ...a, ...patch } : a))); setDirty(true); };
    const editMomo = (id: string, patch: Partial<MobileMoneyAccount>) => { setMomos((l) => l.map((a) => (a.id === id ? { ...a, ...patch } : a))); setDirty(true); };
    const primaryBank = (id: string) => { setBanks((l) => l.map((a) => ({ ...a, is_default: a.id === id }))); setDirty(true); };
    const primaryMomo = (id: string) => { setMomos((l) => l.map((a) => ({ ...a, is_default: a.id === id }))); setDirty(true); };
    const removeBank = (id: string) => { setBanks((l) => { const next = l.filter((a) => a.id !== id); return next.length && !next.some((a) => a.is_default) ? next.map((a, i) => ({ ...a, is_default: i === 0 })) : next; }); setDirty(true); };
    const removeMomo = (id: string) => { setMomos((l) => { const next = l.filter((a) => a.id !== id); return next.length && !next.some((a) => a.is_default) ? next.map((a, i) => ({ ...a, is_default: i === 0 })) : next; }); setDirty(true); };
    const addBank = () => { setBanks((l) => [...l, { id: newId(), bank_name: '', account_number: '', account_name: '', is_default: l.length === 0 }]); setDirty(true); };
    const addMomo = () => { setMomos((l) => [...l, { id: newId(), provider: '', number: '', name: '', is_default: l.length === 0 }]); setDirty(true); };

    const save = useMutation({
        mutationFn: () => userService.updatePaymentInfo({
            // Half-filled rows (no number) are dropped by the server; send everything else as the person left it.
            bank_accounts: banks.filter((a) => a.account_number.trim()),
            mobile_money_accounts: momos.filter((a) => a.number.trim()),
        }),
        onSuccess: () => {
            setDirty(false);
            qc.invalidateQueries({ queryKey: ['users', 'me'] });
            qc.invalidateQueries({ queryKey: ['preferences'] });
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
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    <View style={styles.card}>
                        <Text style={styles.label}>Name</Text>
                        <Text style={styles.readonly}>{data?.name || '—'}</Text>
                        <Text style={[styles.label, styles.spaced]}>Role</Text>
                        <Text style={styles.readonly}>{data?.role || '—'}</Text>
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Bank accounts</Text>
                        {banks.length === 0 && <Text style={styles.empty}>No bank account yet.</Text>}
                        {banks.map((a, i) => (
                            <View key={a.id} style={[styles.account, i > 0 && styles.accountGap]}>
                                <AccountHeader index={i} isPrimary={a.is_default} showPrimary={banks.length > 1} onPrimary={() => primaryBank(a.id)} onRemove={() => removeBank(a.id)} />
                                <Text style={styles.label}>Bank</Text>
                                <InlineSearchSelect
                                    items={BANK_OPTIONS.map((b) => ({ id: b, label: b }))}
                                    selectedId={a.bank_name || null}
                                    placeholder="Select bank"
                                    searchPlaceholder="Search banks…"
                                    maxVisible={12}
                                    onSelect={(it) => editBank(a.id, { bank_name: it.id })}
                                />
                                <Text style={[styles.label, styles.spaced]}>Account number</Text>
                                <TextInput
                                    style={styles.input}
                                    value={a.account_number}
                                    onChangeText={(v) => editBank(a.id, { account_number: v })}
                                    keyboardType="number-pad" inputAccessoryViewID={KB_DONE_ID}
                                    placeholder="0123456789"
                                    placeholderTextColor={colors.textFaint}
                                />
                                <Text style={[styles.label, styles.spaced]}>Account name</Text>
                                <TextInput
                                    style={styles.input}
                                    value={a.account_name}
                                    onChangeText={(v) => editBank(a.id, { account_name: v })}
                                    placeholder="As it appears on the account"
                                    placeholderTextColor={colors.textFaint}
                                />
                            </View>
                        ))}
                        <Pressable onPress={addBank} style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]} accessibilityLabel="Add a bank account">
                            <Plus size={16} color={colors.blue} /><Text style={styles.addText}>Add a bank account</Text>
                        </Pressable>
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Mobile money accounts</Text>
                        {momos.length === 0 && <Text style={styles.empty}>No mobile money account yet.</Text>}
                        {momos.map((a, i) => (
                            <View key={a.id} style={[styles.account, i > 0 && styles.accountGap]}>
                                <AccountHeader index={i} isPrimary={a.is_default} showPrimary={momos.length > 1} onPrimary={() => primaryMomo(a.id)} onRemove={() => removeMomo(a.id)} />
                                <Text style={styles.label}>Provider</Text>
                                <InlineSearchSelect
                                    items={MOMO_OPTIONS.map((m) => ({ id: m, label: m }))}
                                    selectedId={a.provider || null}
                                    placeholder="Select provider"
                                    searchPlaceholder="Search providers…"
                                    onSelect={(it) => editMomo(a.id, { provider: it.id })}
                                />
                                <Text style={[styles.label, styles.spaced]}>Number</Text>
                                <TextInput
                                    style={styles.input}
                                    value={a.number}
                                    onChangeText={(v) => editMomo(a.id, { number: v })}
                                    keyboardType="phone-pad" inputAccessoryViewID={KB_DONE_ID}
                                    placeholder="09xxxxxxxx"
                                    placeholderTextColor={colors.textFaint}
                                />
                                <Text style={[styles.label, styles.spaced]}>Registered name</Text>
                                <TextInput
                                    style={styles.input}
                                    value={a.name}
                                    onChangeText={(v) => editMomo(a.id, { name: v })}
                                    placeholder="As registered with the provider"
                                    placeholderTextColor={colors.textFaint}
                                />
                            </View>
                        ))}
                        <Pressable onPress={addMomo} style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]} accessibilityLabel="Add a mobile money account">
                            <Plus size={16} color={colors.blue} /><Text style={styles.addText}>Add a mobile money account</Text>
                        </Pressable>
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

const AccountHeader: React.FC<{ index: number; isPrimary: boolean; showPrimary: boolean; onPrimary: () => void; onRemove: () => void }> = ({ index, isPrimary, showPrimary, onPrimary, onRemove }) => (
    <View style={styles.accountHead}>
        <View style={styles.accountTitleRow}>
            <Text style={styles.accountTitle}>Account {index + 1}</Text>
            {isPrimary && showPrimary && <View style={styles.primaryBadge}><Text style={styles.primaryBadgeText}>Primary</Text></View>}
        </View>
        <View style={styles.accountActions}>
            {!isPrimary && <Pressable onPress={onPrimary} hitSlop={8}><Text style={styles.linkText}>Make primary</Text></Pressable>}
            <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel="Remove this account"><Trash2 size={16} color={colors.danger} /></Pressable>
        </View>
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
    empty: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, marginBottom: 12 },
    account: { paddingBottom: 6 },
    accountGap: { marginTop: 18, paddingTop: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
    accountHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    accountTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    accountTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.navy },
    primaryBadge: { backgroundColor: colors.tabActiveBg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
    primaryBadgeText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.blue },
    accountActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    linkText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.blue },
    addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 16, paddingVertical: 8 },
    addText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue },
    saveBtn: {
        backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 16,
        alignItems: 'center', justifyContent: 'center', minHeight: 52,
    },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
});

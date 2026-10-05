import { useMemo, useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X, Sparkles, Plus, AlertCircle, Pencil } from 'lucide-react-native';
import { cashbookService, accountService } from 'core';
import type { ManualEntryResult } from 'core';
import { AnimatedSegmented } from '../src/components/AnimatedTabs';
import { BankAvatar } from '../src/components/BankAvatar';
import { AccountGlyph } from '../src/components/AccountGlyph';
import { SelectField, DateField, type SelectOption } from '../src/components/invest/application/formFields';
import { colors, fonts, radius } from '../src/theme/tokens';

const today = () => new Date().toISOString().split('T')[0];
const money = (n: number) => `K${n.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * New manual entry — for money that moved on an external account (a bank or mobile-money account
 * tracked by hand). Say what it was, how much, and which account; the AI works out the accounting
 * (which income or expense category) and it shows up in Reporting under that category.
 */
export default function ManualEntryScreen() {
    const router = useRouter();
    const qc = useQueryClient();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams<{ direction?: string }>();

    const [direction, setDirection] = useState<'IN' | 'OUT'>(params.direction === 'out' ? 'OUT' : 'IN');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState(today());
    const [walletId, setWalletId] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [banner, setBanner] = useState<string | null>(null);
    const [result, setResult] = useState<ManualEntryResult | null>(null);

    const { data: walletsRaw, isLoading: walletsLoading } = useQuery({
        queryKey: ['external-wallets'],
        queryFn: () => cashbookService.getExternalWallets(),
    });
    const wallets: any[] = Array.isArray(walletsRaw) ? walletsRaw : (walletsRaw?.data || []);

    const walletOptions: SelectOption[] = useMemo(
        () => wallets.map((w) => ({
            value: w.id,
            label: w.name,
            leading: <BankAvatar name={w.provider_name || w.name} size={26} />,
        })),
        [wallets],
    );

    const save = useMutation({
        mutationFn: () => cashbookService.recordManualEntry({
            direction, amount: Number(amount), description: description.trim(), date, externalWalletId: walletId,
        }),
        onSuccess: (res) => {
            setResult(res);
            // Balances, the inbox and every report that reads the ledger.
            qc.invalidateQueries();
        },
        onError: (e: any) => setBanner(e?.message || 'Could not save this entry. Please try again.'),
    });

    const onSave = () => {
        const e: Record<string, string> = {};
        const n = Number(amount);
        if (!amount || !Number.isFinite(n) || n <= 0) e.amount = 'Enter an amount';
        if (description.trim().length < 2) e.description = 'Say what this was for';
        if (!walletId) e.walletId = 'Choose the account';
        if (!date) e.date = 'Enter a valid date';
        setErrors(e);
        if (Object.keys(e).length) { setBanner('Please fix the highlighted fields.'); return; }
        setBanner(null);
        save.mutate();
    };

    if (result) {
        return (
            <ResultView
                result={result}
                onDone={() => router.back()}
                onAnother={() => { setResult(null); setAmount(''); setDescription(''); setErrors({}); }}
                onCategoryChanged={(category) => setResult((r) => (r ? { ...r, category } : r))}
                insetsBottom={insets.bottom}
                insetsTop={insets.top}
            />
        );
    }

    const isIn = direction === 'IN';

    return (
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
                <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close"><X size={22} color={colors.textMuted} /></Pressable>
                <Text style={styles.headerTitle}>New manual entry</Text>
                <View style={{ width: 22 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <AnimatedSegmented
                    value={direction}
                    onChange={(v) => setDirection(v as 'IN' | 'OUT')}
                    trackStyle={styles.segTrack}
                    indicatorStyle={styles.segIndicator}
                    itemStyle={styles.segItem}
                    items={[
                        { value: 'IN', content: <Text style={[styles.segText, isIn && styles.segTextActive]}>Money in</Text> },
                        { value: 'OUT', content: <Text style={[styles.segText, !isIn && styles.segTextActive]}>Money out</Text> },
                    ]}
                />

                {!!banner && <View style={styles.banner}><AlertCircle size={16} color="#B91C1C" /><Text style={styles.bannerText}>{banner}</Text></View>}

                <View style={styles.amountWrap}>
                    <Text style={styles.amountLabel}>Amount</Text>
                    <View style={styles.amountRow}>
                        <Text style={[styles.currency, { color: isIn ? colors.positiveInk : colors.text }]}>K</Text>
                        <TextInput
                            value={amount}
                            onChangeText={(t) => { setAmount(t.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')); setErrors((x) => ({ ...x, amount: '' })); }}
                            placeholder="0.00"
                            placeholderTextColor={colors.textFaint}
                            keyboardType="decimal-pad"
                            style={[styles.amountInput, !!errors.amount && { color: colors.danger }]}
                            accessibilityLabel="Amount"
                        />
                    </View>
                    {!!errors.amount && <Text style={styles.error}>{errors.amount}</Text>}
                </View>

                <View style={styles.field}>
                    <Text style={styles.label}>Details</Text>
                    <TextInput
                        value={description}
                        onChangeText={(t) => { setDescription(t); setErrors((x) => ({ ...x, description: '' })); }}
                        placeholder={isIn ? 'e.g. Salary from ABC Ltd, rent from tenant' : 'e.g. Groceries at Shoprite, school fees'}
                        placeholderTextColor={colors.textFaint}
                        multiline
                        style={[styles.input, styles.multiline, !!errors.description && styles.inputError]}
                        accessibilityLabel="Details"
                    />
                    {!!errors.description && <Text style={styles.error}>{errors.description}</Text>}
                </View>

                <DateField label="Date" value={date} onChange={setDate} error={errors.date} />

                {walletsLoading ? (
                    <ActivityIndicator color={colors.blue} style={{ marginVertical: 16 }} />
                ) : wallets.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyTitle}>Add an external account first</Text>
                        <Text style={styles.emptyText}>Manual entries are recorded against a bank or mobile-money account that you track here.</Text>
                        <Pressable onPress={() => router.push('/wallet/new?kind=EXTERNAL')} style={styles.emptyBtn}>
                            <Plus size={16} color="#FFFFFF" /><Text style={styles.emptyBtnText}>Add account</Text>
                        </Pressable>
                    </View>
                ) : (
                    <SelectField
                        label="Account"
                        value={walletId}
                        options={walletOptions}
                        onChange={(v) => { setWalletId(v); setErrors((x) => ({ ...x, walletId: '' })); }}
                        placeholder="Select bank or mobile-money account"
                        error={errors.walletId}
                    />
                )}

                <View style={styles.aiNote}>
                    <Sparkles size={16} color={colors.blue} />
                    <Text style={styles.aiNoteText}>
                        We'll work out the accounting for you: {isIn ? 'which income category this belongs to' : 'which expense category this belongs to'}, and record it in your reports.
                    </Text>
                </View>
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                <Pressable
                    onPress={onSave}
                    disabled={save.isPending || wallets.length === 0}
                    style={({ pressed }) => [styles.saveBtn, (save.isPending || wallets.length === 0) && { opacity: 0.55 }, pressed && { opacity: 0.85 }]}
                >
                    {save.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Save entry</Text>}
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
}

/** What happened: the amount, the account, and the category the AI chose (changeable). */
const ResultView: React.FC<{
    result: ManualEntryResult; onDone: () => void; onAnother: () => void;
    onCategoryChanged: (c: NonNullable<ManualEntryResult['category']>) => void;
    insetsTop: number; insetsBottom: number;
}> = ({ result, onDone, onAnother, onCategoryChanged, insetsTop, insetsBottom }) => {
    const qc = useQueryClient();
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const isIn = result.direction === 'IN';
    const cat = result.category;

    const { data: allAccounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => accountService.getAll() });
    const choices = allAccounts.filter((a) => a.type === (isIn ? 'INCOME' : 'EXPENSE'));

    const choose = async (a: (typeof choices)[number]) => {
        setSaving(true); setErr(null);
        try {
            await cashbookService.setEntryAccount(result.entryId, a.id);
            onCategoryChanged({ id: a.id, code: a.code, name: a.name, emoji: null, source: 'USER', reasoning: null, confidence: null });
            qc.invalidateQueries();
            setOpen(false);
        } catch (e: any) {
            setErr(e?.message || 'Could not change the category.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <View style={[styles.root, { paddingTop: insetsTop + 48, paddingBottom: Math.max(insetsBottom, 16) + 12, paddingHorizontal: 24 }]}>
            <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
            <View style={{ alignItems: 'center' }}>
                <View style={styles.tick}><Check size={40} color={colors.positive} strokeWidth={2.5} /></View>
                <Text style={styles.doneTitle}>Entry recorded</Text>
                <Text style={[styles.doneAmount, { color: isIn ? colors.positiveInk : colors.text }]}>{isIn ? '+' : '−'}{money(result.amount)}</Text>
                <Text style={styles.doneSub}>{isIn ? 'into' : 'from'} {result.externalWallet.name}</Text>
            </View>

            <View style={styles.catCard}>
                <Text style={styles.catLabel}>{isIn ? 'Income category' : 'Expense category'}</Text>
                {cat ? (
                    <>
                        <View style={styles.catRow}>
                            <AccountGlyph name={cat.name} type={isIn ? 'INCOME' : 'EXPENSE'} size={20} />
                            <Text style={styles.catName}>{cat.name}</Text>
                            {cat.source === 'AI' && (
                                <View style={styles.aiPill}><Sparkles size={11} color={colors.blue} /><Text style={styles.aiPillText}>AI</Text></View>
                            )}
                        </View>
                        {!!cat.reasoning && <Text style={styles.reason} numberOfLines={3}>{cat.reasoning}</Text>}
                    </>
                ) : (
                    <Text style={styles.reason}>We weren't sure where this belongs. Pick a category so it appears in your reports.</Text>
                )}
                <Pressable onPress={() => setOpen(true)} style={styles.changeBtn}>
                    <Pencil size={13} color={colors.blue} /><Text style={styles.changeText}>{cat ? 'Change category' : 'Choose category'}</Text>
                </Pressable>
            </View>

            <View style={{ flex: 1 }} />
            <Pressable onPress={onDone} style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}><Text style={styles.saveText}>Done</Text></Pressable>
            <Pressable onPress={onAnother} style={styles.anotherBtn}><Text style={styles.anotherText}>Add another entry</Text></Pressable>

            <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
                <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
                <View style={styles.sheetWrap} pointerEvents="box-none">
                    <View style={[styles.sheet, { paddingBottom: Math.max(insetsBottom, 16) }]}>
                        <View style={styles.handle} />
                        <Text style={styles.sheetTitle}>{isIn ? 'Income category' : 'Expense category'}</Text>
                        {!!err && <Text style={[styles.error, { paddingHorizontal: 24 }]}>{err}</Text>}
                        <FlatList
                            data={choices}
                            keyExtractor={(a) => a.id}
                            style={{ maxHeight: 420 }}
                            ListEmptyComponent={<Text style={styles.emptyText}>No categories found.</Text>}
                            renderItem={({ item }) => (
                                <Pressable onPress={() => choose(item)} disabled={saving} style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.chipActiveBg }]}>
                                    <AccountGlyph name={item.name} type={item.type} size={18} />
                                    <Text style={[styles.optionText, item.id === cat?.id && { color: colors.blue, fontFamily: fonts.bodyBold }]}>{item.name}</Text>
                                    {item.id === cat?.id && <Check size={16} color={colors.blue} />}
                                </Pressable>
                            )}
                        />
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
    headerTitle: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
    scroll: { padding: 20, paddingBottom: 32 },
    segTrack: { flexDirection: 'row', padding: 4, backgroundColor: colors.chipActiveBg, borderRadius: radius.pill, marginBottom: 20 },
    segItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.pill },
    segIndicator: { borderRadius: radius.pill, backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
    segText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    segTextActive: { color: colors.text, fontFamily: fonts.bodyBold },
    banner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: radius.md, padding: 12, marginBottom: 16 },
    bannerText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: '#991B1B' },
    amountWrap: { alignItems: 'center', paddingVertical: 8, marginBottom: 18 },
    amountLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    currency: { fontFamily: fonts.bodyBold, fontSize: 34 },
    amountInput: { fontFamily: fonts.bodyBold, fontSize: 44, color: colors.text, minWidth: 120, textAlign: 'center', padding: 0 },
    field: { marginBottom: 16 },
    label: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy, marginBottom: 6 },
    input: { minHeight: 48, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 16, paddingVertical: 12, fontFamily: fonts.body, fontSize: 15, color: colors.text },
    multiline: { minHeight: 84, textAlignVertical: 'top' },
    inputError: { borderColor: colors.danger },
    error: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.danger, marginTop: 4 },
    emptyCard: { padding: 18, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: 8, marginBottom: 16 },
    emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19, padding: 16 },
    emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.blue, borderRadius: radius.pill, paddingHorizontal: 18, height: 40, marginTop: 4 },
    emptyBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
    aiNote: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: radius.md, backgroundColor: colors.tabActiveBg, marginTop: 4 },
    aiNoteText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.navy, lineHeight: 19 },
    footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.border },
    saveBtn: { minHeight: 52, borderRadius: radius.pill, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    saveText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },

    tick: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: colors.positive, alignItems: 'center', justifyContent: 'center' },
    doneTitle: { fontFamily: fonts.bodyBold, fontSize: 22, color: colors.navy, marginTop: 18 },
    doneAmount: { fontFamily: fonts.bodyBold, fontSize: 34, marginTop: 6 },
    doneSub: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginTop: 2 },
    catCard: { marginTop: 28, padding: 18, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 8 },
    catLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    catRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    catName: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text, flexShrink: 1 },
    aiPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.tabActiveBg, borderRadius: radius.pill, paddingHorizontal: 8, height: 20 },
    aiPillText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.blue },
    reason: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
    changeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 4 },
    changeText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue },
    anotherBtn: { paddingVertical: 14, alignItems: 'center' },
    anotherText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textMuted },

    backdrop: { flex: 1, backgroundColor: 'rgba(0,42,60,0.5)' },
    sheetWrap: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
    handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 6 },
    sheetTitle: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.navy, paddingHorizontal: 24, paddingVertical: 12 },
    option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 15 },
    optionText: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.text },
});

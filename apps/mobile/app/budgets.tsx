import { useEffect, useMemo, useState } from 'react';
import {
    View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
    ScrollView, Switch, KeyboardAvoidingView, Alert,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Target } from 'lucide-react-native';
import { accountService, budgetService } from 'core';
import type { Account } from 'core';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { useAuth } from '../src/context/AuthContext';
import { cacheStoreSync } from '../src/platform/storage';
import { extractEmojiAndName } from '../src/utils/emoji';
import { AccountGlyph } from '../src/components/AccountGlyph';
import { colors, fonts, radius } from '../src/theme/tokens';

const toLocalISODate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Budgets are tracked against the current calendar month, matching web's
 * MONTHLY period_type and how the Reporting screen already merges them in. */
function currentMonthRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: toLocalISODate(start), end: toLocalISODate(end) };
}

export const budgetsActivatedKey = (organizationId: string | null) => `budgets_activated_${organizationId || 'none'}`;

/**
 * Settings screen for the personal-account budgeting feature: a single
 * on/off toggle (device-local — it only controls whether the Reporting
 * screen's target UI is shown, the underlying /budgets rows are always
 * organization-scoped and shared) plus a per-category monthly target input,
 * mirroring the data web's BudgetModal writes (packages/core budgetService)
 * but as one page covering every category instead of a modal per account.
 */
export default function BudgetsScreen() {
    const qc = useQueryClient();
    const { organizationId } = useAuth();
    const monthRange = useMemo(() => currentMonthRange(), []);

    const [activated, setActivated] = useState(() => cacheStoreSync.getItem(budgetsActivatedKey(organizationId)) === 'true');
    const [amounts, setAmounts] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['budgets-settings', organizationId, monthRange.start],
        queryFn: async () => {
            const [accounts, budgets] = await Promise.all([
                accountService.getAll(),
                budgetService.getBudgets(monthRange.start, monthRange.end, 'MONTHLY'),
            ]);
            return { accounts, budgets };
        },
    });

    // Grouped by type — matching the Income/Expenses sections on the Reporting
    // screen, rather than one flat list mixing both together.
    const incomeCategories = useMemo(
        () => (data?.accounts || []).filter((a: Account) => a.is_active && a.type === 'INCOME').sort((a, b) => a.name.localeCompare(b.name)),
        [data?.accounts],
    );
    const expenseCategories = useMemo(
        () => (data?.accounts || []).filter((a: Account) => a.is_active && a.type === 'EXPENSE').sort((a, b) => a.name.localeCompare(b.name)),
        [data?.accounts],
    );
    const categories = useMemo(() => [...incomeCategories, ...expenseCategories], [incomeCategories, expenseCategories]);

    useEffect(() => {
        if (!data?.budgets) return;
        const seeded: Record<string, string> = {};
        for (const b of data.budgets) seeded[b.qb_account_id] = String(b.amount);
        setAmounts(seeded);
    }, [data?.budgets]);

    const toggleActivated = (next: boolean) => {
        setActivated(next);
        cacheStoreSync.setItem(budgetsActivatedKey(organizationId), String(next));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const existing = new Map((data?.budgets || []).map((b) => [b.qb_account_id, b.amount]));
            const toSave = categories.filter((acc: Account) => {
                const raw = amounts[acc.id];
                const parsed = raw ? parseFloat(raw) : 0;
                return parsed > 0 && parsed !== (existing.get(acc.id) ?? -1);
            });

            await Promise.all(toSave.map((acc: Account) =>
                budgetService.setBudget({
                    qb_account_id: acc.id,
                    qb_account_name: acc.name,
                    amount: parseFloat(amounts[acc.id]),
                    period_type: 'MONTHLY',
                    start_date: monthRange.start,
                    end_date: monthRange.end,
                })));

            qc.invalidateQueries({ queryKey: ['budgets-settings'] });
            qc.invalidateQueries({ queryKey: ['report'] });
            Alert.alert('Saved', 'Your budget targets have been updated.');
        } catch (e: any) {
            Alert.alert('Could not save budgets', e?.message ?? 'Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.canvas }} behavior="padding">
            <ScreenHeader title="Budgets" />

            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <View style={styles.activateCard}>
                    <View style={styles.activateIconWrap}>
                        <Target size={18} color={colors.blue} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.activateTitle}>Activate Budgets</Text>
                        <Text style={styles.activateSub}>Set monthly targets and track progress on the Reporting tab.</Text>
                    </View>
                    <Switch
                        value={activated}
                        onValueChange={toggleActivated}
                        trackColor={{ false: colors.borderStrong, true: colors.blue }}
                        thumbColor="#FFFFFF"
                    />
                </View>

                {activated && (
                    isLoading ? (
                        <ActivityIndicator color={colors.blue} style={{ marginTop: 40 }} />
                    ) : (
                        <>
                            {([
                                ['Income', incomeCategories],
                                ['Expenses', expenseCategories],
                            ] as const).map(([label, items]) => items.length > 0 && (
                                <View key={label} style={{ gap: 10 }}>
                                    <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
                                    <View style={styles.list}>
                                        {items.map((acc: Account, idx: number) => {
                                            const { cleanName } = extractEmojiAndName(acc.name);
                                            return (
                                                <View key={acc.id} style={[styles.row, idx > 0 && styles.rowBorder]}>
                                                    <View style={styles.rowLeft}>
                                                        <AccountGlyph name={acc.name} type={acc.type} logoUrl={(acc as any).logo_url} />
                                                        <Text style={styles.rowName} numberOfLines={1}>{cleanName}</Text>
                                                    </View>
                                                    <View style={styles.amountWrap}>
                                                        <Text style={styles.currencyPrefix}>K</Text>
                                                        <TextInput
                                                            style={styles.amountInput}
                                                            value={amounts[acc.id] ?? ''}
                                                            onChangeText={(v) => setAmounts((prev) => ({ ...prev, [acc.id]: v.replace(/[^0-9.]/g, '') }))}
                                                            keyboardType="decimal-pad"
                                                            placeholder="0.00"
                                                            placeholderTextColor={colors.textFaint}
                                                        />
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </View>
                                </View>
                            ))}

                            {categories.length === 0 && (
                                <Text style={styles.emptyText}>No income or expense categories found yet.</Text>
                            )}

                            <Pressable style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
                                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveBtnText}>Save Targets</Text>}
                            </Pressable>
                        </>
                    )
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    scroll: { padding: 20, paddingBottom: 40, gap: 16 },
    activateCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
        padding: 16,
    },
    activateIconWrap: {
        width: 36, height: 36, borderRadius: 18, backgroundColor: colors.tabActiveBg,
        alignItems: 'center', justifyContent: 'center',
    },
    activateTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    activateSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
    sectionLabel: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textFaint, letterSpacing: 0.6, marginTop: 4 },
    list: {
        backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
        overflow: 'hidden',
    },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
    rowName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text, flexShrink: 1 },
    amountWrap: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: colors.canvasAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
        paddingHorizontal: 10, paddingVertical: 6, minWidth: 96,
    },
    currencyPrefix: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textFaint },
    amountInput: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text, padding: 0, textAlign: 'right' },
    emptyText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, fontStyle: 'italic', textAlign: 'center', padding: 20 },
    saveBtn: { backgroundColor: colors.blue, borderRadius: radius.pill, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
    saveBtnDisabled: { opacity: 0.6 },
    saveBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
});

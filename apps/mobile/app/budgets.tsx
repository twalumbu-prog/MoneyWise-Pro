import { useEffect, useMemo, useState } from 'react';
import { TourTarget } from '../src/components/walkthrough/TourTarget';
import { KB_DONE_ID } from '../src/components/KeyboardDoneBar';
import {
    View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
    ScrollView, Switch, KeyboardAvoidingView, Alert,
} from 'react-native';
import Animated, { useSharedValue, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Target, Plus, ChevronLeft, ChevronRight } from 'lucide-react-native';
import {
    accountService, budgetService, BUDGET_BASES, periodContaining, shiftPeriod, budgetForMonth, amountInMonth, isoToday,
} from 'core';
import type { Account, Budget } from 'core';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { BudgetSheet, type BudgetDraft } from '../src/components/budgets/BudgetSheet';
import { useAuth } from '../src/context/AuthContext';
import { cacheStoreSync } from '../src/platform/storage';
import { extractEmojiAndName } from '../src/utils/emoji';
import { AccountGlyph } from '../src/components/AccountGlyph';
import { hapticTick, hapticSuccess } from '../src/lib/haptics';
import { pushIn, pushOut } from '../src/lib/pagePush';
import { colors, fonts, radius } from '../src/theme/tokens';

export const budgetsActivatedKey = (organizationId: string | null) => `budgets_activated_${organizationId || 'none'}`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = MONTHS.map((m) => m.slice(0, 3));
const monthName = (isoDate: string) => MONTHS[Number(isoDate.slice(5, 7)) - 1];
const fmt = (n: number) => `K${n.toLocaleString(undefined, Number.isInteger(n) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const clean = (v: string) => v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
const PER: Record<string, string> = { QUARTERLY: 'a quarter', YEARLY: 'a year' };

/** The line as it stands (saved, or edited and not yet saved) for the month being viewed. */
interface Line { basis: Budget['period_type']; amount: number; due: number | null; thisMonth: number; carriedFrom: string | null; periodStart: string }

/**
 * Budgets, one month at a time — the same ‹ November 2026 › stepping as the Reporting tab.
 * Only budgeted line items are listed; + adds one (an existing category or a new one) with its amount and how often
 * it repeats. The amount on each line is what counts in THIS month: the monthly equivalent of a quarterly / yearly
 * budget spread across its months, or the whole amount in the month a paid-all-at-once budget is due (nothing in the
 * others, so a month never looks like it owes a whole quarter or year). Monthly figures are edited in place; tap a
 * line to change anything else. A month with no figure of its own uses the last one set; Save asks whether a change
 * is for this month only or from here on. Maths: core/budgets/periods.ts, which the Reporting screens use too.
 */
export default function BudgetsScreen() {
    const qc = useQueryClient();
    const insets = useSafeAreaInsets();
    const { organizationId } = useAuth();
    const reduced = useReducedMotion();
    const dirSV = useSharedValue(1);

    const [activated, setActivated] = useState(() => cacheStoreSync.getItem(budgetsActivatedKey(organizationId)) !== 'false');
    const [month, setMonth] = useState(() => periodContaining('MONTHLY', isoToday()));
    const [moved, setMoved] = useState(false);
    const [drafts, setDrafts] = useState<Record<string, BudgetDraft>>({});
    const [saving, setSaving] = useState(false);
    const [sheet, setSheet] = useState<{ account: Account | null } | null>(null);

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['budgets-settings', organizationId],
        queryFn: async () => {
            const [accounts, budgets] = await Promise.all([accountService.getAll(), budgetService.getBudgets()]);
            return { accounts, budgets };
        },
    });
    const rows: Budget[] = data?.budgets ?? [];
    const categories = useMemo(
        () => (data?.accounts || []).filter((a: Account) => a.is_active && (a.type === 'INCOME' || a.type === 'EXPENSE')),
        [data?.accounts],
    );

    // Drafts belong to the month they were made in.
    useEffect(() => { setDrafts({}); }, [month.start]);

    const savedLine = (id: string): Line => {
        const b = budgetForMonth(rows, id, month.start);
        return {
            basis: b.basis, amount: b.amount, due: b.due, thisMonth: b.thisMonth, periodStart: b.period.start,
            carriedFrom: b.carried && b.source ? b.source.start_date.slice(0, 10) : null,
        };
    };
    const line = (id: string): Line => {
        const s = savedLine(id), d = drafts[id];
        if (!d) return s;
        const p = periodContaining(d.basis, month.start);
        const amount = parseFloat(d.amount) || 0;
        return { basis: d.basis, amount, due: d.due, periodStart: p.start, carriedFrom: null, thisMonth: amountInMonth(amount, d.basis, d.due, p.start, month.start) };
    };

    const dirtyIds = Object.keys(drafts).filter((id) => {
        const s = savedLine(id), d = drafts[id];
        return d.basis !== s.basis || (parseFloat(d.amount) || 0) !== s.amount || (d.basis !== 'MONTHLY' && d.due !== s.due);
    });

    // Listed: everything with a budget in this month, plus anything added or edited here.
    const sections = useMemo(() => {
        const shown = categories.filter((a: Account) => {
            const d = drafts[a.id];
            return d ? (parseFloat(d.amount) || 0) > 0 : savedLine(a.id).amount > 0;
        });
        const by = (t: string) => shown
            .filter((a: Account) => a.type === t)
            .sort((a: Account, b: Account) => extractEmojiAndName(a.name).cleanName.localeCompare(extractEmojiAndName(b.name).cleanName));
        return [['Income', by('INCOME')], ['Expenses', by('EXPENSE')]] as const;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categories, drafts, rows, month.start]);
    const budgetedIds = new Set(sections.flatMap(([, items]) => items.map((a) => a.id)));

    const setDraft = (id: string, patch: Partial<BudgetDraft>) => setDrafts((prev) => {
        const s = savedLine(id);
        const base = prev[id] ?? { amount: s.amount ? String(s.amount) : '', basis: s.basis as BudgetDraft['basis'], due: s.due };
        return { ...prev, [id]: { ...base, ...patch } };
    });

    const toggleActivated = (next: boolean) => {
        setActivated(next);
        cacheStoreSync.setItem(budgetsActivatedKey(organizationId), String(next));
    };

    const changeMonth = (to: ReturnType<typeof periodContaining>, dir: 1 | -1) => {
        const move = () => { hapticTick(); dirSV.value = dir; setMoved(true); setMonth(to); };
        if (!dirtyIds.length) return move();
        Alert.alert(`Save ${monthName(month.start)}'s changes?`, undefined, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Discard', style: 'destructive', onPress: move },
            { text: 'Save', onPress: () => askAndSave(move) },
        ]);
    };

    /** A changed figure that would otherwise carry into the next period (same basis and timing, nothing saved there). */
    function pinnable(id: string) {
        const d = drafts[id], s = savedLine(id);
        if (!d || d.basis !== s.basis || (d.basis !== 'MONTHLY' && d.due !== s.due) || s.amount <= 0) return false;
        const next = shiftPeriod(d.basis, s.periodStart, 1);
        return !rows.some((r) => r.qb_account_id === id && r.period_type === d.basis && r.start_date.slice(0, 10) === next.start);
    }

    async function write(onlyThisPeriod: boolean): Promise<boolean> {
        setSaving(true);
        try {
            const names = new Map(categories.map((a: Account) => [a.id, a.name]));
            const calls: Promise<unknown>[] = [];
            for (const id of dirtyIds) {
                const d = drafts[id], s = savedLine(id);
                const p = periodContaining(d.basis, month.start);
                const payload = (start: string, end: string, amount: number, due: number | null) => ({
                    qb_account_id: id, qb_account_name: names.get(id) ?? id, amount, period_type: d.basis, start_date: start, end_date: end,
                    ...(d.basis === 'MONTHLY' ? {} : { due_offset: due }),
                });
                calls.push(budgetService.setBudget(payload(p.start, p.end, parseFloat(d.amount) || 0, d.basis === 'MONTHLY' ? null : d.due)));
                // Only this period: the next one goes back to the figure from before, unless it already has its own.
                if (onlyThisPeriod && pinnable(id)) {
                    const next = shiftPeriod(d.basis, p.start, 1);
                    calls.push(budgetService.setBudget(payload(next.start, next.end, s.amount, s.due)));
                }
            }
            await Promise.all(calls);
            await refetch();
            qc.invalidateQueries({ queryKey: ['report'] });
            setDrafts({});
            hapticSuccess();
            return true;
        } catch (e: any) {
            Alert.alert('Could not save budgets', e?.message ?? 'Please try again.');
            return false;
        } finally {
            setSaving(false);
        }
    }

    function askAndSave(after?: () => void) {
        if (!dirtyIds.length) return;
        const go = (only: boolean) => { void write(only).then((ok) => { if (ok) after?.(); }); };
        if (!dirtyIds.some(pinnable)) return go(false);
        const m = monthName(month.start);
        Alert.alert(
            'Keep these for later months?',
            `Use the new figures from ${m} on, or only for ${m} and go back to the old ones after? Quarterly and yearly lines change for their whole quarter or year.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: `Only ${m}`, onPress: () => go(true) },
                { text: `${m} onwards`, onPress: () => go(false) },
            ],
        );
    }

    const createCategory = async (name: string, emoji: string, type: 'INCOME' | 'EXPENSE') => {
        const prefix = type === 'INCOME' ? 'INC' : 'EXP';
        const used = (data?.accounts || []).map((a: Account) => String(a.code));
        let n = 100 + used.filter((c) => c.startsWith(prefix)).length;
        while (used.includes(`${prefix}-${n}`)) n++;
        const acc = await accountService.create({ code: `${prefix}-${n}`, name: `${emoji} ${name}`, type, is_active: true });
        await refetch();
        qc.invalidateQueries({ queryKey: ['accounts'] });
        return acc;
    };

    const isCurrent = month.start === periodContaining('MONTHLY', isoToday()).start;
    const total = (items: readonly Account[]) => items.reduce((t, a) => t + line(a.id).thisMonth, 0);
    const sheetAccount = sheet?.account ?? null;
    const sheetInitial = useMemo<BudgetDraft | undefined>(() => {
        if (!sheetAccount) return undefined;
        if (drafts[sheetAccount.id]) return drafts[sheetAccount.id];
        const s = savedLine(sheetAccount.id);
        return { amount: s.amount ? String(s.amount) : '', basis: s.basis as BudgetDraft['basis'], due: s.due };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sheet]);

    return (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.canvas }} behavior="padding">
            <ScreenHeader
                title="Budgets"
                right={activated ? (
                    <Pressable onPress={() => { hapticTick(); setSheet({ account: null }); }} hitSlop={10} style={styles.addBtn} accessibilityLabel="Add a budget">
                        <Plus size={20} color={colors.blue} />
                    </Pressable>
                ) : undefined}
            />

            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <TourTarget id="budgets-activate">
                    <View style={styles.activateCard}>
                        <View style={styles.activateIconWrap}>
                            <Target size={18} color={colors.blue} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.activateTitle}>Activate Budgets</Text>
                            <Text style={styles.activateSub}>Set targets and track progress on the Reporting tab.</Text>
                        </View>
                        <Switch
                            value={activated}
                            onValueChange={toggleActivated}
                            trackColor={{ false: colors.borderStrong, true: colors.blue }}
                            thumbColor="#FFFFFF"
                        />
                    </View>
                </TourTarget>

                {activated && (
                    <>
                        <View style={styles.stepRow}>
                            <Pressable onPress={() => changeMonth(shiftPeriod('MONTHLY', month.start, -1), -1)} style={styles.stepBtn} hitSlop={8} accessibilityLabel="Previous month">
                                <ChevronLeft size={18} color={colors.text} />
                            </Pressable>
                            <View style={{ flex: 1, alignItems: 'center' }}>
                                <Text style={styles.stepTitle} numberOfLines={1}>{month.label}</Text>
                                {!isCurrent && (
                                    <Pressable onPress={() => changeMonth(periodContaining('MONTHLY', isoToday()), month.start < isoToday() ? 1 : -1)} hitSlop={6}>
                                        <Text style={styles.todayLink}>Back to this month</Text>
                                    </Pressable>
                                )}
                            </View>
                            <Pressable onPress={() => changeMonth(shiftPeriod('MONTHLY', month.start, 1), 1)} style={styles.stepBtn} hitSlop={8} accessibilityLabel="Next month">
                                <ChevronRight size={18} color={colors.text} />
                            </Pressable>
                        </View>

                        {isLoading ? (
                            <ActivityIndicator color={colors.blue} style={{ marginTop: 40 }} />
                        ) : (
                            <View style={{ overflow: 'hidden' }}>
                                <Animated.View
                                    key={month.start}
                                    style={{ gap: 16 }}
                                    entering={moved && !reduced ? pushIn(dirSV) : undefined}
                                    exiting={reduced ? undefined : pushOut(dirSV)}
                                >
                                    {sections.map(([label, items]) => items.length > 0 && (
                                        <View key={label} style={{ gap: 10 }}>
                                            <View style={styles.sectionHead}>
                                                <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
                                                <Text style={styles.sectionTotal}>{fmt(Math.round(total(items) * 100) / 100)} this month</Text>
                                            </View>
                                            <View style={styles.list}>
                                                {items.map((acc: Account, idx: number) => {
                                                    const { cleanName } = extractEmojiAndName(acc.name);
                                                    const l = line(acc.id);
                                                    const monthly = l.basis === 'MONTHLY';
                                                    const basisLabel = BUDGET_BASES.find((b) => b.value === l.basis)?.label ?? l.basis;
                                                    const dueMonth = l.due !== null ? SHORT[(Number(l.periodStart.slice(5, 7)) - 1 + l.due) % 12] : null;
                                                    const note = monthly
                                                        ? (l.carriedFrom ? `From ${monthName(l.carriedFrom)}` : '')
                                                        : dueMonth
                                                            ? (l.thisMonth > 0 ? `${fmt(l.amount)} due this month` : `${fmt(l.amount)} due in ${dueMonth}`)
                                                            : `${fmt(l.amount)} ${PER[l.basis] ?? ''}`;
                                                    const open = () => { hapticTick(); setSheet({ account: acc }); };
                                                    return (
                                                        <Pressable key={acc.id} onPress={open} style={({ pressed }) => [styles.row, idx > 0 && styles.rowBorder, pressed && { backgroundColor: colors.canvas }]}>
                                                            <AccountGlyph name={acc.name} type={acc.type} logoUrl={(acc as any).logo_url} />
                                                            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                                                                <Text style={styles.rowName} numberOfLines={1}>{cleanName}</Text>
                                                                <View style={styles.metaRow}>
                                                                    <View style={styles.chip}><Text style={styles.chipText}>{basisLabel}</Text></View>
                                                                    {!!note && <Text style={styles.note} numberOfLines={1}>{note}</Text>}
                                                                </View>
                                                            </View>
                                                            {monthly ? (
                                                                <View style={styles.amountWrap}>
                                                                    <Text style={styles.currencyPrefix}>K</Text>
                                                                    <TextInput
                                                                        style={[styles.amountInput, !!l.carriedFrom && { color: colors.textMuted }]}
                                                                        value={drafts[acc.id] ? drafts[acc.id].amount : l.amount ? String(l.amount) : ''}
                                                                        onChangeText={(v) => setDraft(acc.id, { amount: clean(v) })}
                                                                        keyboardType="decimal-pad" inputAccessoryViewID={KB_DONE_ID}
                                                                        placeholder="0"
                                                                        placeholderTextColor={colors.textFaint}
                                                                        selectTextOnFocus
                                                                    />
                                                                </View>
                                                            ) : (
                                                                <View style={styles.equivWrap}>
                                                                    <Text style={[styles.equivAmount, l.thisMonth === 0 && { color: colors.textFaint }]}>
                                                                        {l.thisMonth > 0 ? fmt(Math.round(l.thisMonth * 100) / 100) : '—'}
                                                                    </Text>
                                                                    <Text style={styles.equivSub}>{l.thisMonth > 0 ? 'this month' : 'not due'}</Text>
                                                                </View>
                                                            )}
                                                        </Pressable>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    ))}

                                    {sections.every(([, items]) => items.length === 0) ? (
                                        <Pressable onPress={() => setSheet({ account: null })} style={styles.emptyCard}>
                                            <View style={styles.activateIconWrap}><Plus size={18} color={colors.blue} /></View>
                                            <Text style={styles.emptyTitle}>No budgets for {monthName(month.start)}</Text>
                                            <Text style={styles.emptySub}>Add a category, how much and how often it repeats.</Text>
                                        </Pressable>
                                    ) : (
                                        <Text style={styles.hint}>
                                            Amounts are what count in {monthName(month.start)}. A new month starts with the figures set before; tap a line to change it.
                                        </Text>
                                    )}
                                </Animated.View>
                            </View>
                        )}
                    </>
                )}
            </ScrollView>

            {activated && (
                <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
                    <Pressable
                        style={[styles.saveBtn, (saving || !dirtyIds.length) && styles.saveBtnDisabled]}
                        onPress={() => askAndSave()}
                        disabled={saving || !dirtyIds.length}
                    >
                        {saving
                            ? <ActivityIndicator color="#FFFFFF" />
                            : <Text style={styles.saveBtnText}>{dirtyIds.length ? `Save ${monthName(month.start)} budgets` : 'All changes saved'}</Text>}
                    </Pressable>
                </View>
            )}

            <BudgetSheet
                visible={!!sheet}
                monthStart={month.start}
                account={sheetAccount}
                initial={sheetInitial}
                choices={categories.filter((a: Account) => !budgetedIds.has(a.id))}
                onClose={() => setSheet(null)}
                onDone={(id, d) => { setDrafts((prev) => ({ ...prev, [id]: d })); setSheet(null); }}
                onRemove={(id) => { setDraft(id, { amount: '0' }); setSheet(null); }}
                onCreateCategory={createCategory}
            />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    scroll: { padding: 20, paddingBottom: 32, gap: 16 },
    addBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.tabActiveBg, alignItems: 'center', justifyContent: 'center' },
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
    stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    stepBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
    stepTitle: { textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 15, color: colors.navy },
    todayLink: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.blue, marginTop: 2 },
    sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 },
    sectionLabel: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textFaint, letterSpacing: 0.6 },
    sectionTotal: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textMuted },
    list: {
        backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
        overflow: 'hidden',
    },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    rowName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    chip: { backgroundColor: colors.chipActiveBg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
    chipText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.text },
    note: { flexShrink: 1, fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    amountWrap: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: colors.canvasAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
        paddingHorizontal: 10, paddingVertical: 6, width: 110,
    },
    currencyPrefix: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textFaint },
    amountInput: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text, padding: 0, textAlign: 'right' },
    equivWrap: { width: 110, alignItems: 'flex-end', paddingRight: 4 },
    equivAmount: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    equivSub: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint, marginTop: 1 },
    emptyCard: {
        alignItems: 'center', gap: 8, padding: 24, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed',
        borderColor: colors.borderStrong, backgroundColor: colors.surface,
    },
    emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    emptySub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
    hint: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: colors.textFaint, textAlign: 'center', paddingHorizontal: 12 },
    footer: {
        paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.canvas,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong,
    },
    saveBtn: { backgroundColor: colors.blue, borderRadius: radius.pill, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
    saveBtnDisabled: { opacity: 0.45 },
    saveBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
});

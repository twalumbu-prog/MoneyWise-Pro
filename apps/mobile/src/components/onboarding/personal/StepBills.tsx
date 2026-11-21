import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { ChevronRight, Mail } from 'lucide-react-native';
import {
    BILL_SUGGESTIONS, BILL_CADENCE_LABEL, billMonthly, nextBillDue,
    type BillCadence, type BillCategory, type ScheduledItem,
} from 'core';
import { PersonalStepShell } from './PersonalStepShell';
import { Sheet, MoneyField, fmtK, formatTyped, parseTyped, moneyStyles as m } from './moneyUi';
import { Field } from './steps';
import type { StepContext } from './stepContext';
import { colors, fonts, radius } from '../../../theme/tokens';

/**
 * Step "bills": regular payments as scheduled items. Suggestions come first from the mailbox (with the amount it saw),
 * then loans added in "Your money" (with their repayment), then the common list. On each due date the person gets a
 * payment request to approve: nothing is ever paid on its own.
 */
interface Draft {
    id?: string; key: string; title: string; category: BillCategory; cadence: BillCadence;
    amount: string; day: string; weekday: number | null; fromEmail?: boolean;
}
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CADENCES: BillCadence[] = ['MONTHLY', 'WEEKLY', 'BIWEEKLY', 'QUARTERLY'];
/** 'YYYY-MM-DD' as a local calendar date (new Date('YYYY-MM-DD') is UTC midnight and can show the day before). */
const ymd = (s: string) => { const [y, mo, da] = s.slice(0, 10).split('-').map(Number); return new Date(y, mo - 1, da); };
const asCadence = (c: string): BillCadence => (CADENCES as string[]).includes(c) ? (c as BillCadence) : 'MONTHLY';

export function StepBills({ ctx }: { ctx: StepContext }) {
    const [bills, setBills] = useState<ScheduledItem[] | null>(null);
    const [editing, setEditing] = useState<Draft | null>(null);
    const [loadErr, setLoadErr] = useState<string | null>(null);

    const load = useCallback(async () => {
        try { setBills(await ctx.service.listBills()); setLoadErr(null); }
        catch (e: any) { setBills([]); setLoadErr(e?.message || 'Couldn’t load your bills.'); }
    }, [ctx.service]);
    useEffect(() => { void load(); }, [load]);

    const monthly = useMemo(() => (bills ?? []).reduce((a, b) => a + billMonthly(Number(b.amount), asCadence(b.cadence)), 0), [bills]);
    useEffect(() => { if (bills) ctx.setDraft('billsMonthly', Math.round(monthly * 100) / 100); }, [monthly, bills]); // eslint-disable-line react-hooks/exhaustive-deps

    // Suggestions: mailbox → loans → common list, without the ones already added (matched by title).
    const suggestions = useMemo(() => {
        const have = new Set((bills ?? []).map((b) => b.title.toLowerCase()));
        const out: Draft[] = [];
        for (const g of ctx.drafts.gmail?.bills ?? []) {
            const base = BILL_SUGGESTIONS.find((s) => s.key === g.key);
            out.push({ key: `gmail-${g.key}`, title: base?.label ?? g.label, category: base?.category ?? 'BILLS', cadence: base?.cadence ?? 'MONTHLY', amount: g.amount ? formatTyped(String(g.amount)) : '', day: g.lastSeen ? String(new Date(g.lastSeen).getDate()) : '', weekday: null, fromEmail: true });
        }
        for (const h of ctx.money?.holdings ?? []) {
            if (h.type !== 'LIABILITY' || !h.monthlyRepayment) continue;
            out.push({ key: `loan-${h.accountId}`, title: `${h.name} repayment`, category: 'LOAN_REPAYMENTS', cadence: 'MONTHLY', amount: formatTyped(String(h.monthlyRepayment)), day: h.repaymentDay ? String(h.repaymentDay) : '', weekday: null });
        }
        for (const s of BILL_SUGGESTIONS) out.push({ key: s.key, title: s.label, category: s.category, cadence: s.cadence, amount: '', day: '', weekday: null });
        const seen = new Set<string>();
        return out.filter((d) => {
            const k = d.title.toLowerCase();
            if (have.has(k) || seen.has(k)) return false;
            seen.add(k);
            return true;
        });
    }, [bills, ctx.drafts.gmail, ctx.money]);

    const emoji = (title: string) => BILL_SUGGESTIONS.find((s) => s.label.toLowerCase() === title.toLowerCase())?.emoji ?? '🗓️';

    return (
        <PersonalStepShell
            def={ctx.def} progress={ctx.progress} onBack={ctx.onBack} onSkip={ctx.skip}
            onContinue={() => ctx.done({ count: bills?.length ?? 0, monthly })} saving={ctx.saving} error={ctx.error ?? loadErr}
            continueLabel={ctx.single ? 'Done' : bills?.length ? 'Continue' : 'No regular bills, continue'}
        >
            <View style={styles.chips}>
                {suggestions.slice(0, 18).map((d) => (
                    <Pressable key={d.key} onPress={() => setEditing(d)} style={[styles.chip, d.fromEmail && styles.chipEmail]} accessibilityRole="button" accessibilityLabel={`Add ${d.title}${d.fromEmail ? ', found in your email' : ''}`}>
                        <Text style={styles.chipEmoji}>{emoji(d.title)}</Text>
                        <Text style={styles.chipText}>{d.title}</Text>
                        {d.fromEmail && <Mail size={13} color={colors.blue} />}
                    </Pressable>
                ))}
                <Pressable onPress={() => setEditing({ key: 'custom', title: '', category: 'BILLS', cadence: 'MONTHLY', amount: '', day: '', weekday: null })} style={[styles.chip, { borderStyle: 'dashed' }]} accessibilityRole="button">
                    <Text style={[styles.chipText, { color: colors.blue }]}>+ Add another</Text>
                </Pressable>
            </View>

            <Text style={m.sectionTitle}>Your regular bills</Text>
            {!bills ? <ActivityIndicator color={colors.blue} /> : bills.length === 0 ? <Text style={m.empty}>Tap a suggestion above to add it.</Text> : (
                <View>
                    {bills.map((b) => (
                        <Pressable
                            key={b.id}
                            onPress={() => setEditing({ id: b.id, key: b.id, title: b.title, category: b.category as BillCategory, cadence: asCadence(b.cadence), amount: formatTyped(String(b.amount)), day: String(ymd(b.next_due_date).getDate()), weekday: ymd(b.next_due_date).getDay() })}
                            style={m.row} accessibilityRole="button" accessibilityLabel={`${b.title}, ${fmtK(Number(b.amount))} ${BILL_CADENCE_LABEL[asCadence(b.cadence)]}. Edit`}
                        >
                            <Text style={{ fontSize: 22 }}>{emoji(b.title)}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={m.rowName}>{b.title}</Text>
                                <Text style={styles.sub}>{BILL_CADENCE_LABEL[asCadence(b.cadence)]} · next {ymd(b.next_due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Text>
                            </View>
                            <Text style={m.rowAmount}>{fmtK(Number(b.amount))}</Text>
                            <ChevronRight size={18} color={colors.textFaint} />
                        </Pressable>
                    ))}
                    <View style={m.totalRow}>
                        <Text style={m.totalLabel}>About a month</Text>
                        <Text style={m.totalValue}>{fmtK(monthly)}</Text>
                    </View>
                </View>
            )}
            <Text style={styles.note}>On each due date you’ll get a reminder and a payment request to approve. Nothing is paid without you.</Text>

            <BillSheet draft={editing} ctx={ctx} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
        </PersonalStepShell>
    );
}

function BillSheet({ draft, ctx, onClose, onSaved }: { draft: Draft | null; ctx: StepContext; onClose: () => void; onSaved: () => void }) {
    const [d, setD] = useState<Draft | null>(draft);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => { setD(draft); setError(null); }, [draft]);
    if (!d) return null;

    const weekly = d.cadence === 'WEEKLY' || d.cadence === 'BIWEEKLY';
    const dayNum = Number(d.day);
    const valid = d.title.trim().length >= 2 && parseTyped(d.amount) > 0 && (weekly || (dayNum >= 1 && dayNum <= 31));

    const save = async () => {
        setBusy(true); setError(null);
        try {
            await ctx.service.saveBill({
                id: d.id, title: d.title.trim(), amount: parseTyped(d.amount), category: d.category, cadence: d.cadence,
                nextDueDate: nextBillDue(d.cadence, { day: weekly ? null : dayNum, weekday: weekly ? d.weekday : null }),
            });
            onSaved();
        } catch (e: any) { setError(e?.message || 'Couldn’t save. Try again.'); } finally { setBusy(false); }
    };
    const remove = async () => {
        if (!d.id) return;
        setBusy(true);
        try { await ctx.service.removeBill(d.id); onSaved(); } catch (e: any) { setError(e?.message || 'Couldn’t remove it.'); } finally { setBusy(false); }
    };

    return (
        <Sheet
            visible title={d.id ? `Edit ${d.title}` : d.title || 'New regular payment'} onClose={onClose} busy={busy} error={error}
            primary={{ label: 'Save', onPress: () => void save(), disabled: !valid }}
            secondary={d.id ? { label: 'Remove', onPress: () => void remove(), danger: true } : undefined}
        >
            {(d.key === 'custom' || d.id) && <Field label="What is it?" value={d.title} onChangeText={(t) => setD({ ...d, title: t })} placeholder="e.g. Rent" autoCapitalize="sentences" />}
            {d.fromEmail && <Text style={styles.fromEmail}>Found in your email{d.amount ? '. Check the amount is still right.' : '.'}</Text>}
            <MoneyField label="Amount" value={d.amount} onChange={(v) => setD({ ...d, amount: v })} autoFocus={!d.amount && d.key !== 'custom'} />
            <View>
                <Text style={styles.label}>How often</Text>
                <View style={styles.chips}>
                    {CADENCES.map((c) => (
                        <Pressable key={c} onPress={() => setD({ ...d, cadence: c })} style={[styles.opt, d.cadence === c && styles.optOn]} accessibilityRole="radio" accessibilityState={{ selected: d.cadence === c }}>
                            <Text style={[styles.optText, d.cadence === c && { color: colors.blue }]}>{BILL_CADENCE_LABEL[c]}</Text>
                        </Pressable>
                    ))}
                </View>
            </View>
            {weekly ? (
                <View>
                    <Text style={styles.label}>Which day (optional)</Text>
                    <View style={styles.chips}>
                        {WEEKDAYS.map((w, i) => (
                            <Pressable key={w} onPress={() => setD({ ...d, weekday: d.weekday === i ? null : i })} style={[styles.opt, d.weekday === i && styles.optOn]} accessibilityRole="radio" accessibilityState={{ selected: d.weekday === i }}>
                                <Text style={[styles.optText, d.weekday === i && { color: colors.blue }]}>{w}</Text>
                            </Pressable>
                        ))}
                    </View>
                </View>
            ) : (
                <Field label="Day of the month it’s due" value={d.day} onChangeText={(t) => setD({ ...d, day: t.replace(/\D/g, '').slice(0, 2) })} keyboardType="number-pad" placeholder="e.g. 1" error={d.day && (dayNum < 1 || dayNum > 31) ? 'Pick a day from 1 to 31' : undefined} />
            )}
        </Sheet>
    );
}

const styles = StyleSheet.create({
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
    chipEmail: { borderColor: colors.blue, backgroundColor: '#F4F8FF' },
    chipEmoji: { fontSize: 16 },
    chipText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    sub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
    note: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textFaint, marginTop: 18 },
    label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, marginBottom: 8 },
    opt: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.borderStrong, justifyContent: 'center' },
    optOn: { borderColor: colors.blue, backgroundColor: '#F4F8FF' },
    optText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    fromEmail: { fontFamily: fonts.body, fontSize: 13, color: colors.blue },
});

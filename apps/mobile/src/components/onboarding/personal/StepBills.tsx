import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { ChevronRight, Mail, Plus, Pencil } from 'lucide-react-native';
import {
    BILL_SUGGESTIONS, BILL_CADENCE_LABEL, billMonthly, nextBillDue,
    type BillCadence, type BillCategory, type ScheduledItem,
} from 'core';
import { PersonalStepShell } from './PersonalStepShell';
import { Sheet, MoneyField, fmtK, formatTyped, parseTyped, moneyStyles as m } from './moneyUi';
import { CalendarPicker, fromIso } from './CalendarPicker';
import { Field } from './steps';
import type { StepContext } from './stepContext';
import { colors, fonts, radius } from '../../../theme/tokens';

/**
 * Step "bills": the person's regular payments, saved as scheduled items. The screen is just their list and the monthly
 * total, with one Add button. Add slides up a sheet: pick what it is (from the mailbox first, then loans, then the
 * common Zambian list), then the amount, how often, and the next due date picked on a calendar. On each due date they
 * get a payment request to approve: nothing is ever paid on its own.
 */
interface Draft {
    id?: string; key: string; title: string; category: BillCategory; cadence: BillCadence;
    amount: string; date: string | null; fromEmail?: boolean;
}
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CADENCES: BillCadence[] = ['MONTHLY', 'WEEKLY', 'BIWEEKLY', 'QUARTERLY'];
const asCadence = (c: string): BillCadence => (CADENCES as string[]).includes(c) ? (c as BillCadence) : 'MONTHLY';
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
const short = (iso: string) => fromIso(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** What picking this date means for how the bill repeats, in words. */
function repeatText(cadence: BillCadence, iso: string | null): string {
    if (!iso) return 'Tap the day it’s next due.';
    const d = fromIso(iso);
    if (cadence === 'WEEKLY') return `Repeats every ${WEEKDAYS[d.getDay()]}, starting ${short(iso)}.`;
    if (cadence === 'BIWEEKLY') return `Repeats every 2 weeks, starting ${short(iso)}.`;
    if (cadence === 'QUARTERLY') return `Repeats every 3 months, starting ${short(iso)}.`;
    return `Repeats on the ${ordinal(d.getDate())} of every month, starting ${short(iso)}.`;
}

export function StepBills({ ctx }: { ctx: StepContext }) {
    const [bills, setBills] = useState<ScheduledItem[] | null>(null);
    const [sheet, setSheet] = useState<{ draft: Draft | null } | null>(null);
    const [loadErr, setLoadErr] = useState<string | null>(null);

    const load = useCallback(async () => {
        try { setBills(await ctx.service.listBills()); setLoadErr(null); }
        catch (e: any) { setBills([]); setLoadErr(e?.message || 'Couldn’t load your bills.'); }
    }, [ctx.service]);
    useEffect(() => { void load(); }, [load]);

    const monthly = useMemo(() => (bills ?? []).reduce((a, b) => a + billMonthly(Number(b.amount), asCadence(b.cadence)), 0), [bills]);
    useEffect(() => { if (bills) ctx.setDraft('billsMonthly', Math.round(monthly * 100) / 100); }, [monthly, bills]); // eslint-disable-line react-hooks/exhaustive-deps

    const emoji = (title: string) => BILL_SUGGESTIONS.find((s) => s.label.toLowerCase() === title.toLowerCase())?.emoji ?? '🗓️';

    return (
        <PersonalStepShell
            def={ctx.def} progress={ctx.progress} onBack={ctx.onBack} onSkip={ctx.skip}
            onContinue={() => ctx.done({ count: bills?.length ?? 0, monthly })} saving={ctx.saving} error={ctx.error ?? loadErr}
            continueLabel={ctx.single ? 'Done' : 'Continue'}
            stickyAbove={(
                <View style={styles.sticky}>
                    <Text style={m.totalLabel}>About a month</Text>
                    <Text style={m.totalValue}>{fmtK(monthly)}</Text>
                </View>
            )}
        >
            <Text style={[m.sectionTitle, { marginTop: 0 }]}>Your regular bills</Text>
            {!bills ? <ActivityIndicator color={colors.blue} /> : bills.length === 0 ? (
                <Text style={m.empty}>Nothing yet. Tap Add to put in rent, ZESCO, bundles or anything else you pay again and again.</Text>
            ) : (
                <View>
                    {bills.map((b) => (
                        <Pressable
                            key={b.id}
                            onPress={() => setSheet({ draft: { id: b.id, key: b.id, title: b.title, category: b.category as BillCategory, cadence: asCadence(b.cadence), amount: formatTyped(String(b.amount)), date: b.next_due_date.slice(0, 10) } })}
                            style={m.row} accessibilityRole="button" accessibilityLabel={`${b.title}, ${fmtK(Number(b.amount))} ${BILL_CADENCE_LABEL[asCadence(b.cadence)]}. Edit`}
                        >
                            <Text style={{ fontSize: 22 }}>{emoji(b.title)}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={m.rowName}>{b.title}</Text>
                                <Text style={styles.sub}>{BILL_CADENCE_LABEL[asCadence(b.cadence)]} · next {short(b.next_due_date.slice(0, 10))}</Text>
                            </View>
                            <Text style={m.rowAmount}>{fmtK(Number(b.amount))}</Text>
                            <ChevronRight size={18} color={colors.textFaint} />
                        </Pressable>
                    ))}
                </View>
            )}

            <Pressable onPress={() => setSheet({ draft: null })} style={({ pressed }) => [styles.add, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel="Add a regular bill">
                <Plus size={18} color={colors.blue} />
                <Text style={styles.addText}>{bills?.length ? 'Add another' : 'Add a bill'}</Text>
            </Pressable>

            <Text style={styles.note}>On each due date you’ll get a reminder and a payment request to approve. Nothing is paid without you.</Text>

            {sheet && (
                <BillSheet
                    initial={sheet.draft} ctx={ctx} existing={bills ?? []} emoji={emoji}
                    onClose={() => setSheet(null)} onSaved={() => { setSheet(null); void load(); }}
                />
            )}
        </PersonalStepShell>
    );
}

function BillSheet({ initial, ctx, existing, emoji, onClose, onSaved }: {
    initial: Draft | null; ctx: StepContext; existing: ScheduledItem[]; emoji: (t: string) => string; onClose: () => void; onSaved: () => void;
}) {
    const [d, setD] = useState<Draft | null>(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Choices: found in the mailbox, then loan repayments, then the common list; anything already added is left out.
    const options = useMemo(() => {
        const have = new Set(existing.map((b) => b.title.toLowerCase()));
        const out: Draft[] = [];
        for (const g of ctx.drafts.gmail?.bills ?? []) {
            const base = BILL_SUGGESTIONS.find((s) => s.key === g.key);
            const cadence = base?.cadence ?? 'MONTHLY';
            out.push({ key: `gmail-${g.key}`, title: base?.label ?? g.label, category: base?.category ?? 'BILLS', cadence, amount: g.amount ? formatTyped(String(g.amount)) : '', date: g.lastSeen && cadence === 'MONTHLY' ? nextBillDue('MONTHLY', { day: new Date(g.lastSeen).getDate() }) : null, fromEmail: true });
        }
        for (const h of ctx.money?.holdings ?? []) {
            if (h.type !== 'LIABILITY' || !h.monthlyRepayment) continue;
            out.push({ key: `loan-${h.accountId}`, title: `${h.name} repayment`, category: 'LOAN_REPAYMENTS', cadence: 'MONTHLY', amount: formatTyped(String(h.monthlyRepayment)), date: h.repaymentDay ? nextBillDue('MONTHLY', { day: h.repaymentDay }) : null });
        }
        for (const s of BILL_SUGGESTIONS) out.push({ key: s.key, title: s.label, category: s.category, cadence: s.cadence, amount: '', date: null });
        const seen = new Set<string>();
        return out.filter((o) => { const k = o.title.toLowerCase(); if (have.has(k) || seen.has(k)) return false; seen.add(k); return true; });
    }, [existing, ctx.drafts.gmail, ctx.money]);

    const valid = !!d && d.title.trim().length >= 2 && parseTyped(d.amount) > 0 && !!d.date;

    const save = async () => {
        if (!d || !d.date) return;
        setBusy(true); setError(null);
        try {
            await ctx.service.saveBill({ id: d.id, title: d.title.trim(), amount: parseTyped(d.amount), category: d.category, cadence: d.cadence, nextDueDate: d.date });
            onSaved();
        } catch (e: any) { setError(e?.message || 'Couldn’t save. Try again.'); } finally { setBusy(false); }
    };
    const remove = async () => {
        if (!d?.id) return;
        setBusy(true);
        try { await ctx.service.removeBill(d.id); onSaved(); } catch (e: any) { setError(e?.message || 'Couldn’t remove it.'); } finally { setBusy(false); }
    };

    // Step 1: what is it?
    if (!d) {
        return (
            <Sheet visible title="What do you pay?" onClose={onClose}>
                <View style={{ gap: 2 }}>
                    {options.map((o) => (
                        <Pressable key={o.key} onPress={() => setD(o)} style={styles.option} accessibilityRole="button" accessibilityLabel={`${o.title}${o.fromEmail ? ', found in your email' : ''}`}>
                            <Text style={{ fontSize: 22 }}>{emoji(o.title)}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.optionTitle}>{o.title}</Text>
                                {o.fromEmail && <Text style={styles.fromEmail}>Found in your email{o.amount ? ` · K ${o.amount}` : ''}</Text>}
                            </View>
                            {o.fromEmail ? <Mail size={16} color={colors.blue} /> : <ChevronRight size={18} color={colors.textFaint} />}
                        </Pressable>
                    ))}
                    <Pressable onPress={() => setD({ key: 'custom', title: '', category: 'BILLS', cadence: 'MONTHLY', amount: '', date: null })} style={styles.option} accessibilityRole="button">
                        <Pencil size={20} color={colors.blue} />
                        <Text style={[styles.optionTitle, { flex: 1, color: colors.blue }]}>Something else</Text>
                        <ChevronRight size={18} color={colors.textFaint} />
                    </Pressable>
                </View>
            </Sheet>
        );
    }

    // Step 2: the details.
    return (
        <Sheet
            visible title={d.id ? `Edit ${d.title}` : d.key === 'custom' ? 'Something else' : d.title} onClose={onClose} busy={busy} error={error}
            primary={{ label: 'Save', onPress: () => void save(), disabled: !valid }}
            secondary={d.id ? { label: 'Remove', onPress: () => void remove(), danger: true } : undefined}
        >
            {d.key === 'custom' && <Field label="What is it?" value={d.title} onChangeText={(t) => setD({ ...d, title: t })} placeholder="e.g. Rent" autoCapitalize="sentences" autoFocus />}
            {d.fromEmail && <Text style={styles.fromEmail}>Found in your email. Check the amount is still right.</Text>}
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
            <View>
                <Text style={styles.label}>When is it next due?</Text>
                <CalendarPicker value={d.date} onChange={(iso) => setD({ ...d, date: iso })} />
                <Text style={[styles.repeat, d.date && { color: colors.text }]} accessibilityLiveRegion="polite">{repeatText(d.cadence, d.date)}</Text>
            </View>
            {!d.id && (
                <Pressable onPress={() => setD(null)} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'flex-start' }}>
                    <Text style={styles.change}>Choose a different bill</Text>
                </Pressable>
            )}
        </Sheet>
    );
}

const styles = StyleSheet.create({
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    sub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
    add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, marginTop: 14, borderRadius: radius.pill, backgroundColor: '#EAF1FF' },
    sticky: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.canvas },
    addText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.blue },
    note: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textFaint, marginTop: 18 },
    label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, marginBottom: 8 },
    opt: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.borderStrong, justifyContent: 'center' },
    optOn: { borderColor: colors.blue, backgroundColor: '#F4F8FF' },
    optText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    option: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, borderBottomWidth: 1, borderColor: colors.border },
    optionTitle: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.text },
    fromEmail: { fontFamily: fonts.body, fontSize: 13, color: colors.blue, marginTop: 1 },
    repeat: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: 10 },
    change: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.blue },
});

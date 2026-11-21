import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Polyline, Line } from 'react-native-svg';
import { AlertTriangle } from 'lucide-react-native';
import { projectGrowPlan, monthKeyOf, addMonths, planLength, type GrowPlan } from 'core';
import { PersonalStepShell } from './PersonalStepShell';
import { MoneyField, fmtK, formatTyped, parseTyped } from './moneyUi';
import type { StepContext } from './stepContext';
import { useGrowPlan } from '../../grow/useGrow';
import { colors, fonts, radius } from '../../../theme/tokens';

/**
 * Step "grow": the Grow plan in one screen — monthly income, spending (suggested from the bills), saving and
 * investing, and how long — with the projection from today's net worth. Saved where Reporting → Grow reads it, so
 * Grow is already set up afterwards. The full Grow setup (other frequencies, returns, stretch goal) stays in Grow.
 */
const HORIZONS = [6, 12, 24, 36];
const signedK = (n: number) => `${n < 0 ? '− ' : ''}${fmtK(Math.abs(n))}`;

export function StepGrow({ ctx }: { ctx: StepContext }) {
    const { plan: existing, save } = useGrowPlan();
    const bills = ctx.drafts.billsMonthly ?? 0;
    const startNw = ctx.money?.total ?? 0;
    const [income, setIncome] = useState(existing ? formatTyped(String(existing.income.amount)) : '');
    const [expense, setExpense] = useState(existing ? formatTyped(String(existing.expense.amount)) : bills ? formatTyped(String(Math.round(bills))) : '');
    const [savings, setSavings] = useState(existing ? formatTyped(String(existing.savings.amount)) : '');
    const [invest, setInvest] = useState(existing ? formatTyped(String(existing.investment.amount)) : '');
    // A saved plan keeps its length (snapped to the nearest choice); a new one starts at a year.
    const [horizon, setHorizon] = useState(() => (existing ? HORIZONS.reduce((a, h) => (Math.abs(h - planLength(existing)) < Math.abs(a - planLength(existing)) ? h : a), 12) : 12));

    const startMonth = useMemo(() => { const now = new Date(); const k = monthKeyOf(now); return now.getDate() > 20 ? addMonths(k, 1) : k; }, []);
    const draft = useMemo(() => ({
        startMonth, goalMonth: addMonths(startMonth, horizon - 1),
        income: { amount: parseTyped(income), frequency: 'MONTHLY' as const },
        expense: { amount: parseTyped(expense), frequency: 'MONTHLY' as const },
        savings: { amount: parseTyped(savings), frequency: 'MONTHLY' as const },
        investment: { amount: parseTyped(invest), frequency: 'MONTHLY' as const },
        annualReturnPct: existing?.annualReturnPct ?? 10, goalAmount: null,
    }), [startMonth, horizon, income, expense, savings, invest, existing]);
    const projection = useMemo(() => projectGrowPlan(draft, startNw), [draft, startNw]);

    const left = draft.income.amount - draft.expense.amount;
    const unallocated = left - draft.savings.amount - draft.investment.amount;
    const overspend = draft.income.amount > 0 && draft.expense.amount > draft.income.amount;
    const overAllocated = !overspend && draft.income.amount > 0 && unallocated < 0;

    const finish = () => void ctx.run('continue', async () => {
        if (!ctx.preview) {
            const now = new Date().toISOString();
            const plan: GrowPlan = { version: 1, ...draft, startNetWorth: startNw, createdAt: existing?.createdAt ?? now, updatedAt: now };
            await save(plan); // saved on the phone at once, synced in the background (Grow's own behaviour)
        }
        return ctx.service.saveStep('grow', 'done', { horizon, monthlyIncome: draft.income.amount });
    });

    // Projection sparkline.
    const pts = [startNw, ...projection.months.map((mo) => mo.targetNetWorth)];
    const W = 300, H = 90;
    const lo = Math.min(...pts, 0), hi = Math.max(...pts, 1);
    const xy = pts.map((v, i) => `${(i / (pts.length - 1)) * W},${H - ((v - lo) / (hi - lo || 1)) * H}`).join(' ');
    const end = projection.months[projection.months.length - 1]?.targetNetWorth ?? startNw;

    return (
        <PersonalStepShell
            def={ctx.def} progress={ctx.progress} onBack={ctx.onBack} onSkip={ctx.skip}
            onContinue={finish} continueDisabled={draft.income.amount <= 0} saving={ctx.saving} error={ctx.error}
            continueLabel={ctx.single ? 'Save' : 'Save my plan'}
        >
            <View style={{ gap: 16 }}>
                <MoneyField label="What you earn in a month" value={income} onChange={setIncome} autoFocus={!income} />
                <MoneyField label="What you spend in a month" value={expense} onChange={setExpense} hint={bills ? `Your regular bills come to about ${fmtK(bills)} a month.` : undefined} />
                <MoneyField label="What you’ll save each month" value={savings} onChange={setSavings} />
                <MoneyField label="What you’ll invest each month" value={invest} onChange={setInvest} />
            </View>

            {(overspend || overAllocated) && (
                <View style={styles.warn}>
                    <AlertTriangle size={18} color={colors.warn} />
                    <Text style={styles.warnText}>
                        {overspend ? 'You’re planning to spend more than you earn. You can still save this, and adjust it in Grow later.'
                            : `Saving and investing add up to ${fmtK(-unallocated)} more than you have left each month.`}
                    </Text>
                </View>
            )}

            <Text style={styles.label}>Plan for</Text>
            <View style={styles.chips}>
                {HORIZONS.map((h) => (
                    <Pressable key={h} onPress={() => setHorizon(h)} style={[styles.opt, horizon === h && styles.optOn]} accessibilityRole="radio" accessibilityState={{ selected: horizon === h }}>
                        <Text style={[styles.optText, horizon === h && { color: colors.blue }]}>{h < 12 ? `${h} months` : `${h / 12} year${h > 12 ? 's' : ''}`}</Text>
                    </Pressable>
                ))}
            </View>

            {draft.income.amount > 0 && (
                <View style={styles.card} accessibilityLabel={`In ${horizon} months your net worth would be ${fmtK(end)}`}>
                    <Text style={styles.cardLabel}>In {horizon} months you’d be at</Text>
                    <Text style={[styles.cardValue, end < 0 && { color: colors.danger }]}>{signedK(end)}</Text>
                    <Text style={styles.cardSub}>From {signedK(startNw)} today{projection.monthlySurplus > 0 ? `, growing about ${fmtK(projection.monthlySurplus)} a month` : ''}.</Text>
                    <Svg width="100%" height={H + 8} viewBox={`0 -4 ${W} ${H + 8}`} style={{ marginTop: 12 }}>
                        {lo < 0 && <Line x1={0} x2={W} y1={H - ((0 - lo) / (hi - lo)) * H} y2={H - ((0 - lo) / (hi - lo)) * H} stroke={colors.borderStrong} strokeDasharray="4 4" />}
                        <Polyline points={xy} fill="none" stroke={end >= startNw ? colors.positive : colors.danger} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
                    </Svg>
                </View>
            )}
        </PersonalStepShell>
    );
}

const styles = StyleSheet.create({
    label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, marginTop: 22, marginBottom: 8 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    opt: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.borderStrong, justifyContent: 'center' },
    optOn: { borderColor: colors.blue, backgroundColor: '#F4F8FF' },
    optText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    warn: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: radius.md, backgroundColor: '#FFFBEB', marginTop: 16 },
    warnText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text },
    card: { marginTop: 22, padding: 16, borderRadius: radius.md, backgroundColor: colors.canvas },
    cardLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    cardValue: { fontFamily: fonts.display, fontSize: 28, color: colors.text, marginTop: 4 },
    cardSub: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 4 },
});

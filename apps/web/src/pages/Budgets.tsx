import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { accountService, budgetService, formatKwacha, reportService } from 'core';
import type { Account } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { PlanTabs } from '../components/ui/PlanTabs';
import { ErrorNote, PrimaryButton, ProgressBar } from '../components/ui/Dialog';
import { useAuth } from '../context/AuthContext';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plainName = (name: string) => name.replace(/^[^\p{L}\p{N}]+/u, '').trim() || name;

/**
 * Budgets: a monthly target for each category, set on one page, shown against what has actually been spent so far this month.
 * Reads and writes the same budgets as Reports and the mobile app, so a target set here shows up there.
 */
export const Budgets: React.FC = () => {
    const qc = useQueryClient();
    const { organizationId } = useAuth();
    const month = useMemo(() => {
        const now = new Date();
        return {
            start: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
            end: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
            label: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        };
    }, []);

    const [amounts, setAmounts] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { data, isLoading, isError } = useQuery({
        queryKey: ['budgets-settings', organizationId, month.start],
        enabled: !!organizationId,
        queryFn: async () => {
            const [accounts, budgets, spent] = await Promise.all([
                accountService.getAll(),
                budgetService.getBudgets(month.start, month.end, 'MONTHLY'),
                reportService.getExpenditures(month.start, month.end, 'EXPENSE').catch(() => [] as any[]),
            ]);
            return { accounts, budgets, spent };
        },
    });

    const spentBy = useMemo(() => {
        const m = new Map<string, number>();
        for (const r of (data?.spent ?? []) as any[]) m.set(String(r.account_id), Number(r.total_amount) || 0);
        return m;
    }, [data?.spent]);

    const expense = useMemo(() => (data?.accounts ?? []).filter((a: Account) => a.is_active && a.type === 'EXPENSE').sort((a, b) => plainName(a.name).localeCompare(plainName(b.name))), [data?.accounts]);
    const income = useMemo(() => (data?.accounts ?? []).filter((a: Account) => a.is_active && a.type === 'INCOME').sort((a, b) => plainName(a.name).localeCompare(plainName(b.name))), [data?.accounts]);

    useEffect(() => {
        if (!data?.budgets) return;
        const seeded: Record<string, string> = {};
        for (const b of data.budgets) seeded[b.qb_account_id] = String(b.amount);
        setAmounts(seeded);
    }, [data?.budgets]);

    const existing = useMemo(() => new Map((data?.budgets ?? []).map((b) => [b.qb_account_id, b.amount])), [data?.budgets]);
    const all = useMemo(() => [...income, ...expense], [income, expense]);
    const changed = all.filter((a) => {
        const parsed = amounts[a.id] ? parseFloat(amounts[a.id]) : 0;
        return parsed > 0 && parsed !== (existing.get(a.id) ?? -1);
    });

    const totalBudget = expense.reduce((s, a) => s + (existing.get(a.id) ?? 0), 0);
    const totalSpent = expense.reduce((s, a) => s + (spentBy.get(a.id) ?? 0), 0);

    const save = async () => {
        setSaving(true); setError(null); setSaved(false);
        try {
            await Promise.all(changed.map((a) => budgetService.setBudget({
                qb_account_id: a.id,
                qb_account_name: a.name,
                amount: parseFloat(amounts[a.id]),
                period_type: 'MONTHLY',
                start_date: month.start,
                end_date: month.end,
            })));
            qc.invalidateQueries({ queryKey: ['budgets-settings'] });
            qc.invalidateQueries({ queryKey: ['report'] });
            setSaved(true);
        } catch (e: any) {
            setError(e?.message || 'Could not save your budgets. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const row = (a: Account, isExpense: boolean) => {
        const target = Number(amounts[a.id]) || 0;
        const spent = spentBy.get(a.id) ?? 0;
        const ratio = target > 0 ? spent / target : 0;
        const tone = ratio > 1 ? 'red' : ratio >= 0.8 ? 'amber' : 'blue';
        return (
            <li key={a.id} className="flex flex-col gap-2 border-t border-[rgba(116,119,117,0.14)] py-4 first:border-t-0 md:flex-row md:items-center md:gap-6">
                <div className="min-w-0 md:w-1/3">
                    <p className="truncate text-sm font-medium text-[#1F1F1F]">{plainName(a.name)}</p>
                    {isExpense && <p className="text-xs text-[#80868B] tabular-nums">{formatKwacha(spent)} spent</p>}
                </div>
                <div className="flex-1">
                    {isExpense && target > 0 ? (
                        <>
                            <ProgressBar value={Math.min(ratio, 1)} tone={tone} />
                            <p className={`mt-1 text-xs tabular-nums ${ratio > 1 ? 'text-[#B31412]' : 'text-[#5F6368]'}`}>
                                {ratio > 1 ? `Over by ${formatKwacha(spent - target)}` : `${formatKwacha(target - spent)} left`}
                            </p>
                        </>
                    ) : (
                        <p className="text-xs text-[#80868B]">{isExpense ? 'No target set' : 'Monthly target'}</p>
                    )}
                </div>
                <div className="relative md:w-44">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#80868B]">K</span>
                    <input
                        className="h-11 w-full rounded-xl border border-[#C4C7C5] bg-white pl-8 pr-3 text-right text-sm font-semibold tabular-nums text-[#1F1F1F] focus:border-[#0B57D0] focus:outline-none focus:ring-1 focus:ring-[#0B57D0]"
                        inputMode="decimal"
                        aria-label={`Monthly budget for ${plainName(a.name)}`}
                        value={amounts[a.id] ?? ''}
                        onChange={(e) => { setSaved(false); setAmounts((prev) => ({ ...prev, [a.id]: e.target.value.replace(/[^0-9.]/g, '') })); }}
                        placeholder="0.00"
                    />
                </div>
            </li>
        );
    };

    return (
        <PagePanel
            title="Plan"
            subtitle={`Monthly budgets · ${month.label}`}
            tabs={<PlanTabs active="budgets" />}
            maxWidth="max-w-[1400px]"
            actions={
                <PrimaryButton onClick={save} busy={saving} disabled={changed.length === 0} className="h-10 px-5">
                    {saved && changed.length === 0 ? <><Check size={16} /> Saved</> : `Save${changed.length ? ` (${changed.length})` : ''}`}
                </PrimaryButton>
            }
        >
            <ErrorNote text={error} />
            <section className="mb-8 rounded-[28px] bg-gradient-to-br from-[#0B57D0] to-[#0842A0] p-6 text-white md:p-8">
                <p className="text-[11px] font-medium uppercase tracking-wider text-white/60">Spent against budget</p>
                <p className="mt-2 text-4xl font-bold leading-none tracking-tight tabular-nums md:text-[44px]">{formatKwacha(totalSpent)}</p>
                <p className="mt-2 text-[11px] font-medium text-white/70">{totalBudget > 0 ? `of ${formatKwacha(totalBudget)} budgeted for ${month.label}` : 'Set a monthly target for a category to start tracking.'}</p>
                {totalBudget > 0 && (
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/25">
                        <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, (totalSpent / totalBudget) * 100)}%` }} />
                    </div>
                )}
            </section>

            {isLoading ? (
                <p className="py-10 text-center text-sm text-[#80868B]">Loading your categories…</p>
            ) : isError ? (
                <p className="py-10 text-center text-sm text-[#5F6368]">Couldn’t load your budgets. Please try again.</p>
            ) : (
                <>
                    <section className="mb-6 rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-5">
                        <h2 className="mb-1 text-sm font-bold text-[#1F1F1F]">Expenses</h2>
                        <p className="mb-2 text-xs text-[#5F6368]">A monthly limit for each category you spend on.</p>
                        {expense.length === 0 ? <p className="py-4 text-sm text-[#80868B]">No expense categories yet.</p> : <ul>{expense.map((a) => row(a, true))}</ul>}
                    </section>
                    {income.length > 0 && (
                        <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-5">
                            <h2 className="mb-1 text-sm font-bold text-[#1F1F1F]">Income</h2>
                            <p className="mb-2 text-xs text-[#5F6368]">How much you expect to earn from each source.</p>
                            <ul>{income.map((a) => row(a, false))}</ul>
                        </section>
                    )}
                </>
            )}
        </PagePanel>
    );
};

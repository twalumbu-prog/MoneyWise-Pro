import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Users } from 'lucide-react';
import { formatKwacha, reportService, savingsService, scheduleService } from 'core';
import { useAuth } from '../../context/AuthContext';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Account names are stored with a leading emoji ("🍔 Food"); the insights show just the name. */
const plainName = (name: string) => name.replace(/^[^\p{L}\p{N}]+/u, '').trim() || name;

function when(due: string, today: string): string {
    const days = Math.round((Date.parse(`${due}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86_400_000);
    if (days < 0) return `${-days}d overdue`;
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days < 7) return `In ${days} days`;
    return new Date(`${due}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const Section: React.FC<{ title: string; to: string; children: React.ReactNode }> = ({ title, to, children }) => {
    const navigate = useNavigate();
    return (
        <div>
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wide text-[#80868B]">{title}</h3>
                <button type="button" onClick={() => navigate(to)} className="flex items-center gap-0.5 text-xs text-[#5F6368] hover:text-[#1F1F1F]">
                    See more <ChevronRight size={12} />
                </button>
            </div>
            {children}
        </div>
    );
};

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="text-[13px] text-[#80868B]">{children}</p>;

/** Spending: the three biggest expense accounts this month. */
const SpendingSection: React.FC = () => {
    const { organizationId } = useAuth();
    const period = useMemo(() => {
        const now = new Date();
        return {
            start: ymd(new Date(now.getFullYear(), now.getMonth(), 1)),
            end: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
            label: now.toLocaleDateString('en-US', { month: 'long' }),
        };
    }, []);
    const { data, isLoading, isError } = useQuery({
        queryKey: ['home-overview', organizationId, period.start],
        queryFn: () => reportService.getExpenditures(period.start, period.end, 'EXPENSE'),
        enabled: !!organizationId,
    });
    const { top, total } = useMemo(() => {
        const rows = (data ?? []).filter((r: any) => r.type === 'EXPENSE' && Number(r.total_amount) > 0)
            .sort((a: any, b: any) => Number(b.total_amount) - Number(a.total_amount));
        return { top: rows.slice(0, 3), total: rows.reduce((s: number, r: any) => s + Number(r.total_amount), 0) };
    }, [data]);

    return (
        <Section title={`Spent in ${period.label}`} to="/reporting">
            {isLoading ? <Empty>Loading…</Empty> : isError ? <Empty>Couldn’t load your spending.</Empty> : total <= 0 ? (
                <Empty>No spending recorded in {period.label} yet.</Empty>
            ) : (
                <>
                    <p className="mb-3 text-2xl font-bold text-[#1F1F1F]">{formatKwacha(total)}</p>
                    <ul className="flex flex-col gap-2.5">
                        {top.map((r: any) => {
                            const share = Math.round((Number(r.total_amount) / total) * 100);
                            return (
                                <li key={r.account_id}>
                                    <div className="mb-1 flex items-center justify-between text-sm">
                                        <span className="truncate text-[#1F1F1F]">{plainName(String(r.account_name))}</span>
                                        <span className="ml-3 font-medium text-[#1F1F1F]">{formatKwacha(Number(r.total_amount))}</span>
                                    </div>
                                    <div className="h-1.5 overflow-hidden rounded-full bg-[#E9EEF6]">
                                        <div className="h-full rounded-full bg-[#4285F4]" style={{ width: `${share}%` }} />
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </Section>
    );
};

/** Savings: progress for goals, wishlist items and groups, closest to done first. */
const SavingsSection: React.FC = () => {
    const { data, isLoading, isError } = useQuery({ queryKey: ['savings'], queryFn: () => savingsService.list() });
    const items = useMemo(() => {
        const all: any[] = [...(data?.groups ?? []), ...(data?.goals ?? []), ...(data?.wishlist ?? [])];
        const withTarget = all.filter((i) => i.targetAmount && i.targetAmount > 0);
        return (withTarget.length ? withTarget : all).sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0)).slice(0, 3);
    }, [data]);

    return (
        <Section title="Savings" to="/savings">
            {isLoading ? <Empty>Loading…</Empty> : isError ? <Empty>Couldn’t load your savings.</Empty> : items.length === 0 ? (
                <Empty>No savings yet. Start a goal and watch it fill up here.</Empty>
            ) : (
                <ul className="flex flex-col gap-3">
                    {items.map((i) => {
                        const pct = Math.round((i.progress ?? 0) * 100);
                        return (
                            <li key={i.id}>
                                <div className="mb-1 flex items-center gap-1.5 text-sm">
                                    {i.kind === 'GROUP' && <Users size={13} className="text-[#80868B]" />}
                                    <span className="flex-1 truncate text-[#1F1F1F]">{i.name}</span>
                                    <span className="font-medium text-[#1F1F1F]">{i.targetAmount ? `${pct}%` : formatKwacha(i.balance)}</span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-[#E9EEF6]">
                                    <div className={`h-full rounded-full ${pct >= 100 ? 'bg-[#34A853]' : 'bg-[#4285F4]'}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                                </div>
                                {!!i.targetAmount && <p className="mt-1 text-xs text-[#80868B]">{formatKwacha(i.balance)} of {formatKwacha(i.targetAmount)}</p>}
                            </li>
                        );
                    })}
                </ul>
            )}
        </Section>
    );
};

/** Coming up: a week strip with a dot on each day something is due, then the next scheduled payments. */
const UpcomingSection: React.FC = () => {
    const { organizationId } = useAuth();
    const { data, isLoading, isError } = useQuery({
        queryKey: ['schedules', organizationId, 'ALL'],
        queryFn: () => scheduleService.getAll('ALL'),
        enabled: !!organizationId,
    });
    const { week, upcoming, today } = useMemo(() => {
        const now = new Date();
        const todayStr = ymd(now);
        const items: any[] = (Array.isArray(data) ? data : []).filter((i: any) => i.status === 'ACTIVE')
            .sort((a: any, b: any) => a.next_due_date.localeCompare(b.next_due_date));
        const dueOn = new Set(items.map((i) => i.next_due_date));
        const days = Array.from({ length: 7 }, (_, n) => {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
            return { key: ymd(d), letter: DAY[d.getDay()], num: d.getDate(), has: dueOn.has(ymd(d)), isToday: n === 0 };
        });
        return { week: days, upcoming: items.slice(0, 3), today: todayStr };
    }, [data]);

    return (
        <Section title="Coming up" to="/schedules">
            {isLoading ? <Empty>Loading…</Empty> : isError ? <Empty>Couldn’t load your schedule.</Empty> : upcoming.length === 0 ? (
                <Empty>Nothing scheduled. Bills and repayments show up here before they’re due.</Empty>
            ) : (
                <>
                    <div className="mb-3 grid grid-cols-7 gap-1">
                        {week.map((d) => (
                            <div key={d.key} className={`flex flex-col items-center rounded-xl py-1.5 ${d.isToday ? 'bg-[#0B57D0] text-white' : 'text-[#5F6368]'}`}>
                                <span className="text-[10px] font-medium">{d.letter}</span>
                                <span className="text-sm font-semibold">{d.num}</span>
                                <span className={`mt-0.5 h-1 w-1 rounded-full ${d.has ? (d.isToday ? 'bg-white' : 'bg-[#0B57D0]') : 'bg-transparent'}`} />
                            </div>
                        ))}
                    </div>
                    <ul className="flex flex-col gap-2">
                        {upcoming.map((i: any) => (
                            <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
                                <span className="min-w-0">
                                    <span className="block truncate text-[#1F1F1F]">{i.name ?? i.title ?? i.description ?? 'Scheduled payment'}</span>
                                    <span className="block text-xs text-[#80868B]">{when(i.next_due_date, today)}</span>
                                </span>
                                {i.amount != null && <span className="font-medium text-[#1F1F1F]">{formatKwacha(Number(i.amount))}</span>}
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </Section>
    );
};

/** The Home insights card: this month's spending, savings progress and what's coming up (the web take on the mobile Home's information card). */
export const PersonalInsights: React.FC = () => (
    <div className="flex flex-col gap-6 divide-y divide-[rgba(116,119,117,0.14)] [&>*:not(:first-child)]:pt-6">
        <SpendingSection />
        <SavingsSection />
        <UpcomingSection />
    </div>
);

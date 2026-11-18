import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Sparkles } from 'lucide-react';
import { formatKwacha, reportService, savingsService, scheduleService } from 'core';
import { useAuth } from '../../context/AuthContext';

const ROTATE_MS = 7000;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plainName = (name: string) => name.replace(/^[^\p{L}\p{N}]+/u, '').trim() || name;

interface Advice {
    id: string;
    text: string;
    /** The button under the advice; clicking it sends `prompt` to the Assistant. */
    action: string;
    prompt: string;
}

interface Props {
    totalBalance: number;
    walletCount: number;
    /** Counts of things waiting on the person (requests, approvals, money to send, vouchers, new money). */
    counts: { requisitions: number; approvals: number; disbursements: number; vouchers: number; wallets: number };
    ready: boolean;
    onAsk: (prompt: string) => void;
}

function dueIn(due: string, today: string): number {
    return Math.round((Date.parse(`${due}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86_400_000);
}

/**
 * Advice from MoneyWise: a short note that cycles through what is worth the person's attention right now, worked out from their own
 * numbers (what is due, how this month's spending compares to last month's, their savings, what is waiting on them). It reads the same
 * queries the rest of the app keeps fresh, so paying a bill, moving money or starting a goal changes the advice without a reload.
 * Each note has a button that hands it to the Assistant to act on.
 */
export const PersonalAdvice: React.FC<Props> = ({ totalBalance, walletCount, counts, ready, onAsk }) => {
    const { organizationId } = useAuth();

    const months = useMemo(() => {
        const now = new Date();
        return {
            thisStart: ymd(new Date(now.getFullYear(), now.getMonth(), 1)),
            thisEnd: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
            prevStart: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
            prevEnd: ymd(new Date(now.getFullYear(), now.getMonth(), 0)),
            day: now.getDate(),
            daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
            prevLabel: new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-US', { month: 'long' }),
            today: ymd(now),
        };
    }, []);

    // Same keys as the Insights card and the Savings / Schedules screens, so a change made anywhere refreshes the advice.
    const { data: thisMonth } = useQuery({
        queryKey: ['home-overview', organizationId, months.thisStart],
        queryFn: () => reportService.getExpenditures(months.thisStart, months.thisEnd, 'EXPENSE'),
        enabled: !!organizationId,
    });
    const { data: lastMonth } = useQuery({
        queryKey: ['home-overview', organizationId, months.prevStart],
        queryFn: () => reportService.getExpenditures(months.prevStart, months.prevEnd, 'EXPENSE'),
        enabled: !!organizationId,
    });
    const { data: savings } = useQuery({ queryKey: ['savings'], queryFn: () => savingsService.list() });
    const { data: schedules } = useQuery({
        queryKey: ['schedules', organizationId, 'ALL'],
        queryFn: () => scheduleService.getAll('ALL'),
        enabled: !!organizationId,
    });

    const advice = useMemo<Advice[]>(() => {
        const out: Advice[] = [];
        const expenses = (rows: any[] | undefined) => (rows ?? []).filter((r) => r.type === 'EXPENSE' && Number(r.total_amount) > 0)
            .sort((a, b) => Number(b.total_amount) - Number(a.total_amount));
        const spentNow = expenses(thisMonth);
        const spentPrev = expenses(lastMonth);
        const totalNow = spentNow.reduce((s, r) => s + Number(r.total_amount), 0);
        const totalPrev = spentPrev.reduce((s, r) => s + Number(r.total_amount), 0);

        // 1. What is due soon, and whether the money is there.
        const items: any[] = (Array.isArray(schedules) ? schedules : []).filter((i) => i.status === 'ACTIVE')
            .sort((a, b) => String(a.next_due_date).localeCompare(String(b.next_due_date)));
        const next = items[0];
        if (next) {
            const days = dueIn(next.next_due_date, months.today);
            if (days <= 7) {
                const when = days < 0 ? `${-days} day${days === -1 ? '' : 's'} overdue` : days === 0 ? 'due today' : days === 1 ? 'due tomorrow' : `due in ${days} days`;
                const short = Number(next.amount) > totalBalance;
                out.push({
                    id: 'due',
                    text: short
                        ? `${next.title} (${formatKwacha(Number(next.amount))}) is ${when}, but your balance is ${formatKwacha(totalBalance)}. Top up before it's due.`
                        : `${next.title} (${formatKwacha(Number(next.amount))}) is ${when}. You have enough in your wallets to cover it.`,
                    action: short ? 'Ways to top up' : 'Pay it now',
                    prompt: short
                        ? `${next.title} for ${formatKwacha(Number(next.amount))} is ${when} and my balance is ${formatKwacha(totalBalance)}. What are my options to cover it?`
                        : `Help me pay ${next.title} for ${formatKwacha(Number(next.amount))}, which is ${when}.`,
                });
            }
        }

        // 2. Spending against last month, scaled to how far through the month we are.
        if (totalPrev > 0 && totalNow > 0) {
            const pace = (totalNow / months.day) * months.daysInMonth;
            if (pace > totalPrev * 1.15) {
                out.push({
                    id: 'pace',
                    text: `You've spent ${formatKwacha(totalNow)} so far this month. At this pace you'll pass ${months.prevLabel}'s ${formatKwacha(totalPrev)} by about ${Math.round(((pace - totalPrev) / totalPrev) * 100)}%.`,
                    action: 'Find where to cut back',
                    prompt: `I'm on track to spend more than last month. Compare my spending this month with ${months.prevLabel} by category and tell me where I can cut back.`,
                });
            } else if (pace < totalPrev * 0.85) {
                out.push({
                    id: 'under',
                    text: `Nice work: you're spending less than in ${months.prevLabel}. At this pace you'll finish about ${formatKwacha(totalPrev - pace)} under.`,
                    action: 'Put the difference to work',
                    prompt: `I'm spending less than last month. Suggest how I could save or invest the difference.`,
                });
            }
        }

        // 3. The biggest category.
        if (spentNow[0] && totalNow > 0) {
            const share = Math.round((Number(spentNow[0].total_amount) / totalNow) * 100);
            if (share >= 35) {
                const name = plainName(String(spentNow[0].account_name));
                out.push({
                    id: 'top',
                    text: `${name} is ${share}% of what you've spent this month (${formatKwacha(Number(spentNow[0].total_amount))}). A budget for it would keep it in check.`,
                    action: `Set a ${name} budget`,
                    prompt: `Help me set a monthly budget for ${name}. Base it on what I spent on it recently.`,
                });
            }
        }

        // 4. Savings.
        const goals: any[] = [...(savings?.groups ?? []), ...(savings?.goals ?? []), ...(savings?.wishlist ?? [])];
        if (savings && goals.length === 0 && totalBalance > 0) {
            out.push({
                id: 'nosave',
                text: 'You have no savings goals yet. Even a small amount set aside each week adds up.',
                action: 'Start a savings goal',
                prompt: 'Help me start a savings goal. Ask me what I am saving for and how much, then set it up.',
            });
        }
        const close = goals.filter((g) => g.targetAmount && (g.progress ?? 0) >= 0.8 && (g.progress ?? 0) < 1)
            .sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))[0];
        if (close) {
            out.push({
                id: 'close',
                text: `You're ${Math.round((close.progress ?? 0) * 100)}% of the way to "${close.name}". Just ${formatKwacha(close.targetAmount - close.balance)} to go.`,
                action: 'Add to it',
                prompt: `Help me add ${formatKwacha(close.targetAmount - close.balance)} to my "${close.name}" savings so I reach the goal.`,
            });
        }

        // 5. Low balance.
        if (ready && walletCount > 0 && totalBalance < 50) {
            out.push({
                id: 'low',
                text: `Your total balance is ${formatKwacha(totalBalance)}. Receive money with a pay link, or move savings back into your main wallet.`,
                action: 'Get my pay link',
                prompt: 'Show me my pay link and QR code so I can receive money.',
            });
        }

        // 6. What is waiting on the person.
        const waiting = counts.requisitions + counts.approvals + counts.disbursements + counts.vouchers;
        if (waiting > 0) {
            out.push({
                id: 'waiting',
                text: `${waiting} thing${waiting === 1 ? ' is' : 's are'} waiting on you: requests to review, approvals or payments to send.`,
                action: 'Go through them',
                prompt: 'List what is waiting on me (requests, approvals, money to send) and help me clear it.',
            });
        }
        if (counts.wallets > 0) {
            out.push({
                id: 'received',
                text: `You've received new money in ${counts.wallets} ${counts.wallets === 1 ? 'entry' : 'entries'}. Sort it into categories so your reports stay accurate.`,
                action: 'Categorise it',
                prompt: 'Show me the money I recently received and help me categorise it.',
            });
        }

        // Always something useful to say.
        if (out.length === 0) {
            out.push({
                id: 'general',
                text: "You're on top of things. Ask me for a summary of your month or a plan for your next goal.",
                action: 'Summarise my month',
                prompt: 'Give me a short summary of my money this month: what came in, what went out, and anything I should know.',
            });
        }
        return out;
    }, [thisMonth, lastMonth, savings, schedules, totalBalance, walletCount, counts, ready, months]);

    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);
    const [visible, setVisible] = useState(true);
    const lastIds = useRef('');

    // New advice (after a payment, a new goal, ...) starts from the top.
    useEffect(() => {
        const ids = advice.map((a) => a.id).join('|');
        if (ids !== lastIds.current) { lastIds.current = ids; setIndex(0); }
    }, [advice]);

    const goTo = (next: number) => {
        setVisible(false);
        window.setTimeout(() => { setIndex(next); setVisible(true); }, 180);
    };

    useEffect(() => {
        if (paused || advice.length < 2) return;
        const t = window.setTimeout(() => goTo((index + 1) % advice.length), ROTATE_MS);
        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [index, paused, advice.length]);

    const current = advice[Math.min(index, advice.length - 1)];

    return (
        <div
            className="rounded-2xl bg-[#E8F0FE] p-4 text-[#1F1F1F]"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
        >
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#1967D2]">
                <Sparkles size={12} />
                Advice for you
            </div>
            <div className={`min-h-[84px] transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`} aria-live="polite">
                <p className="text-[13px] leading-relaxed text-[#1F1F1F]">{current.text}</p>
                <button
                    type="button"
                    onClick={() => onAsk(current.prompt)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-[#0B57D0] shadow-sm transition hover:bg-[#0B57D0] hover:text-white"
                >
                    {current.action}
                    <ArrowRight size={12} />
                </button>
            </div>
            {advice.length > 1 && (
                <div className="mt-3 flex items-center gap-1.5">
                    {advice.map((a, i) => (
                        <button
                            key={a.id}
                            type="button"
                            onClick={() => goTo(i)}
                            aria-label={`Advice ${i + 1} of ${advice.length}`}
                            className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-[#0B57D0]' : 'w-1.5 bg-[#0B57D0]/25 hover:bg-[#0B57D0]/50'}`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

import React from 'react';
import { Link } from 'react-router-dom';
import { PiggyBank, Target, Trophy } from 'lucide-react';

export type PlanTab = 'savings' | 'budgets' | 'rewards';

const TABS: { id: PlanTab; label: string; to: string; icon: React.ComponentType<any> }[] = [
    { id: 'savings', label: 'Savings', to: '/savings', icon: PiggyBank },
    { id: 'budgets', label: 'Budgets', to: '/budgets', icon: Target },
    { id: 'rewards', label: 'Rewards', to: '/rewards', icon: Trophy },
];

/**
 * The top-level tabs of the Plan area (Savings, Budgets, Rewards): the way you set money aside, limit what you spend, and earn from it.
 * Material "primary tabs": text with a blue indicator under the current one. Each tab keeps its own address, so links and the browser's
 * back button still work.
 */
export const PlanTabs: React.FC<{ active: PlanTab }> = ({ active }) => (
    <nav className="mb-6 flex gap-1 border-b border-[rgba(116,119,117,0.22)]" aria-label="Plan sections" role="tablist">
        {TABS.map(({ id, label, to, icon: Icon }) => {
            const on = id === active;
            return (
                <Link
                    key={id}
                    to={to}
                    role="tab"
                    aria-selected={on}
                    className={`-mb-px flex items-center gap-2 border-b-[3px] px-5 py-3 text-sm transition-colors ${on ? 'border-[#0B57D0] font-bold text-[#0B57D0]' : 'border-transparent font-medium text-[#5F6368] hover:bg-[#F1F3F4] hover:text-[#1F1F1F]'}`}
                >
                    <Icon size={16} />
                    {label}
                </Link>
            );
        })}
    </nav>
);

import React, { useMemo, useState } from 'react';
import { Search, Check } from 'lucide-react';
import { INDUSTRIES } from './constants';
import { StepFooter, ErrorBanner } from './ui';

interface Props {
    initial: string[];
    onSave: (industries: string[]) => Promise<void>;
    onBack: () => void;
    saving: boolean;
}

/**
 * Step 5 — industries the business operates in. Pinterest-style: every option is
 * an always-visible tappable pill (filtered live by the search bar above), not
 * hidden behind a dropdown — selection is a single tap, and multiple picks are
 * obvious from the filled pills themselves.
 */
export const StepIndustries: React.FC<Props> = ({ initial, onSave, onBack, saving }) => {
    const [selected, setSelected] = useState<string[]>(initial);
    const [query, setQuery] = useState('');
    const [error, setError] = useState<string | null>(null);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return INDUSTRIES.filter(i => !q || i.toLowerCase().includes(q));
    }, [query]);

    const toggle = (industry: string) => {
        setError(null);
        setSelected(prev =>
            prev.includes(industry) ? prev.filter(i => i !== industry) : [...prev, industry]
        );
    };

    const handleContinue = async () => {
        if (selected.length === 0) {
            setError('Select at least one industry so we can tailor your setup.');
            return;
        }
        await onSave(selected);
    };

    return (
        <div>
            <ErrorBanner message={error} />

            <div className="relative mb-5">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                    aria-label="Search industries"
                    placeholder="Search industries…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="appearance-none block w-full pl-11 pr-4 py-3.5 border border-gray-200 rounded-2xl bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-sm transition-all"
                />
            </div>

            {filtered.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">No industries match "{query}"</p>
            ) : (
                <div className="flex flex-wrap gap-2.5" role="group" aria-label="Industries">
                    {filtered.map(industry => {
                        const isSelected = selected.includes(industry);
                        return (
                            <button
                                key={industry}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => toggle(industry)}
                                className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold border-2 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-600/30 ${
                                    isSelected
                                        ? 'border-blue-700 bg-blue-600 text-white shadow-sm'
                                        : 'border-gray-200 bg-white text-gray-800 hover:border-blue-600/50 hover:bg-blue-50'
                                }`}
                            >
                                {isSelected && (
                                    <Check className="h-3.5 w-3.5 mw-anim" strokeWidth={3} style={{ animation: 'mw-scale-in 0.2s ease-out both' }} />
                                )}
                                {industry}
                            </button>
                        );
                    })}
                </div>
            )}

            <p className="mt-5 text-xs text-gray-400">
                {selected.length === 0 ? 'Nothing selected yet' : `${selected.length} selected — tap as many as apply`}
            </p>

            <StepFooter onBack={onBack} loading={saving} onContinue={handleContinue} />
        </div>
    );
};

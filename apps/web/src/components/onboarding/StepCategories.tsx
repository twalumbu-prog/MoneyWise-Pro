import React, { useMemo, useState } from 'react';
import { Search, Check } from 'lucide-react';
import { STORE_CATEGORIES } from './constants';
import { StepFooter, ErrorBanner } from './ui';

interface Props {
    initial: string[];
    onSave: (categories: string[]) => Promise<void>;
    onBack: () => void;
    saving: boolean;
}

/** Step 6 — store category cards with search and multi-select. */
export const StepCategories: React.FC<Props> = ({ initial, onSave, onBack, saving }) => {
    const [selected, setSelected] = useState<string[]>(initial);
    const [query, setQuery] = useState('');
    const [error, setError] = useState<string | null>(null);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return STORE_CATEGORIES.filter(c => !q || c.name.toLowerCase().includes(q));
    }, [query]);

    const toggle = (name: string) => {
        setError(null);
        setSelected(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);
    };

    const handleContinue = async () => {
        if (selected.length === 0) {
            setError('Pick at least one category — it organises your store for customers.');
            return;
        }
        await onSave(selected);
    };

    return (
        <div>
            <ErrorBanner message={error} />

            <div className="relative mb-6">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                    aria-label="Search categories"
                    placeholder="Search categories…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="appearance-none block w-full pl-11 pr-4 py-3.5 border border-gray-200 rounded-2xl bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-sm transition-all"
                />
            </div>

            {filtered.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">No categories match "{query}"</p>
            ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-4" role="group" aria-label="Store categories">
                    {filtered.map(({ name, icon: Icon }) => {
                        const isSelected = selected.includes(name);
                        return (
                            <button
                                key={name}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => toggle(name)}
                                className="flex flex-col items-center gap-2 focus:outline-none"
                            >
                                <span
                                    className={`relative w-full aspect-square rounded-2xl border bg-white flex items-center justify-center shadow-sm transition-all active:scale-[0.96] ${
                                        isSelected ? 'border-blue-700 ring-2 ring-inset ring-blue-700' : 'border-slate-200'
                                    }`}
                                >
                                    <Icon className={`h-8 w-8 transition-colors ${isSelected ? 'text-blue-700' : 'text-gray-400'}`} strokeWidth={1.5} />
                                    {isSelected && (
                                        <span
                                            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black flex items-center justify-center shadow-md mw-anim"
                                            style={{ animation: 'mw-scale-in 0.25s ease-out both' }}
                                        >
                                            <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                                        </span>
                                    )}
                                </span>
                                <span className="text-center text-gray-600 text-sm leading-5">
                                    {name}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            <p className="mt-4 text-xs text-gray-400">
                {selected.length === 0 ? 'Nothing selected yet' : `${selected.length} selected`}
            </p>

            <StepFooter onBack={onBack} loading={saving} onContinue={handleContinue} />
        </div>
    );
};

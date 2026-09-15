import React, { useMemo, useState } from 'react';
import { Search, Check, Sparkles, LucideIcon, Plus, Tag } from 'lucide-react';
import { STORE_CATEGORIES } from './constants';
import { StepFooter, ErrorBanner } from './ui';

interface Props {
    initial: string[];
    industries?: string[];
    onSave: (categories: string[]) => Promise<void>;
    onBack: () => void;
    saving: boolean;
}

function getRecommendedCategoryNames(industries: string[] = []): Set<string> {
    if (!industries || industries.length === 0) return new Set();

    const recommended = new Set<string>();
    const combinedText = industries.join(' ').toLowerCase();

    const rules: { keywords: string[]; categories: string[] }[] = [
        {
            keywords: ['food', 'restaurant', 'cafe', 'dining', 'bakery', 'bar', 'beverage', 'catering', 'eatery', 'hospitality', 'kitchen'],
            categories: ['Restaurant', 'Grocery'],
        },
        {
            keywords: ['retail', 'shop', 'store', 'boutique', 'fashion', 'clothing', 'apparel', 'shoes', 'wear', 'supermarket', 'grocery', 'mart'],
            categories: ['Clothing & Shoes', 'Grocery'],
        },
        {
            keywords: ['tech', 'technology', 'digital', 'software', 'it', 'telecom', 'online', 'computer', 'gadget', 'app', 'mobile', 'phone'],
            categories: ['Digital Products', 'Electronics', 'Mobile Phones'],
        },
        {
            keywords: ['school', 'education', 'academy', 'tuition', 'training', 'learning', 'college', 'university', 'kindergarten', 'kids', 'nursery', 'masterfees', 'teacher'],
            categories: ['Education', 'Stationery', 'Printing', 'Services'],
        },
        {
            keywords: ['farm', 'farming', 'agriculture', 'produce', 'crop', 'livestock', 'poultry', 'agro'],
            categories: ['Agriculture', 'Grocery'],
        },
        {
            keywords: ['salon', 'beauty', 'barber', 'spa', 'health', 'wellness', 'clinic', 'medical', 'dental', 'pharmacy', 'fitness', 'gym', 'cosmetics'],
            categories: ['Beauty', 'Pharmacy'],
        },
        {
            keywords: ['hardware', 'construct', 'contruct', 'constuct', 'building', 'plumbing', 'electrical', 'repair', 'tools', 'materials', 'carpentry', 'civil', 'engineer'],
            categories: ['Hardware', 'Repairs', 'Services'],
        },
        {
            keywords: ['auto', 'automotive', 'car', 'vehicle', 'transport', 'logistics', 'mechanic', 'garage', 'parts', 'drive'],
            categories: ['Repairs', 'Services'],
        },
        {
            keywords: ['hotel', 'lodging', 'accommodation', 'guesthouse', 'motel', 'stay'],
            categories: ['Hotel', 'Services'],
        },
        {
            keywords: ['print', 'printing', 'paper', 'stationery', 'office', 'book', 'copy', 'publish'],
            categories: ['Printing', 'Stationery'],
        },
        {
            keywords: ['furniture', 'decor', 'interior', 'home', 'appliance', 'furnishing'],
            categories: ['Furniture', 'Home Appliances'],
        },
        {
            keywords: ['event', 'party', 'wedding', 'celebration', 'planner', 'entertainment'],
            categories: ['Events', 'Services'],
        },
        {
            keywords: ['service', 'consulting', 'agency', 'freelance', 'cleaning', 'laundry', 'financial', 'legal', 'accounting', 'professional', 'advisor'],
            categories: ['Services', 'Consulting'],
        },
    ];

    for (const rule of rules) {
        if (rule.keywords.some(kw => combinedText.includes(kw))) {
            rule.categories.forEach(cat => recommended.add(cat));
        }
    }

    // Word-level fallback matching for custom industry keywords
    const words = combinedText.split(/\s+/).filter(w => w.length >= 3);
    STORE_CATEGORIES.forEach(c => {
        const catLower = c.name.toLowerCase();
        for (const w of words) {
            if (catLower.includes(w) || w.includes(catLower)) {
                recommended.add(c.name);
            }
        }
    });

    return recommended;
}

/** Step 6 — store category cards with search, AI recommendations, custom additions, and multi-select. */
export const StepCategories: React.FC<Props> = ({ initial, industries = [], onSave, onBack, saving }) => {
    const [selected, setSelected] = useState<string[]>(initial);
    const [query, setQuery] = useState('');
    const [error, setError] = useState<string | null>(null);

    const customQuery = query.trim();
    const exactMatch = useMemo(() => {
        if (!customQuery) return true;
        const q = customQuery.toLowerCase();
        return STORE_CATEGORIES.some(c => c.name.toLowerCase() === q) || selected.some(s => s.toLowerCase() === q);
    }, [customQuery, selected]);

    const canAddCustom = customQuery.length > 0 && !exactMatch;

    const recommendedNames = useMemo(() => getRecommendedCategoryNames(industries), [industries]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return STORE_CATEGORIES.filter(c => !q || c.name.toLowerCase().includes(q));
    }, [query]);

    const customSelectedItems = useMemo(() => {
        const q = query.trim().toLowerCase();
        return selected
            .filter(s => !STORE_CATEGORIES.some(c => c.name === s) && (!q || s.toLowerCase().includes(q)))
            .map(name => ({ name, icon: Tag as LucideIcon }));
    }, [selected, query]);

    const { recommendedList, otherList } = useMemo(() => {
        if (recommendedNames.size === 0) {
            return { recommendedList: [], otherList: [...filtered, ...customSelectedItems] };
        }
        const rec: typeof STORE_CATEGORIES = [];
        const oth: typeof STORE_CATEGORIES = [];
        filtered.forEach(c => {
            if (recommendedNames.has(c.name)) {
                rec.push(c);
            } else {
                oth.push(c);
            }
        });
        return { recommendedList: rec, otherList: [...oth, ...customSelectedItems] };
    }, [filtered, recommendedNames, customSelectedItems]);

    const toggle = (name: string) => {
        setError(null);
        setSelected(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);
    };

    const addCustomCategory = (name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        setError(null);
        if (!selected.includes(trimmed)) {
            setSelected(prev => [...prev, trimmed]);
        }
        setQuery('');
    };

    const handleContinue = async () => {
        if (selected.length === 0) {
            setError('Pick at least one category — it organises your store for customers.');
            return;
        }
        await onSave(selected);
    };

    const renderCard = (name: string, Icon: LucideIcon) => {
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
                        isSelected ? 'border-blue-700 ring-2 ring-inset ring-blue-700' : 'border-slate-200 hover:border-blue-300'
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
    };

    const renderCustomAddCard = () => (
        <button
            key="custom-add-card"
            type="button"
            onClick={() => addCustomCategory(customQuery)}
            className="flex flex-col items-center gap-2 focus:outline-none"
        >
            <span className="relative w-full aspect-square rounded-2xl border-2 border-dashed border-blue-600 bg-blue-50/70 hover:bg-blue-100 flex items-center justify-center shadow-sm transition-all active:scale-[0.96]">
                <Plus className="h-8 w-8 text-blue-700" strokeWidth={2.5} />
            </span>
            <span className="text-center text-blue-700 font-bold text-sm leading-5 truncate max-w-full px-1">
                + Add "{customQuery}"
            </span>
        </button>
    );

    const hasAnyCategoryToDisplay = recommendedList.length > 0 || otherList.length > 0 || canAddCustom;

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

            {!hasAnyCategoryToDisplay ? (
                <p className="py-10 text-center text-sm text-gray-400">No categories match "{query}"</p>
            ) : (
                <div className="space-y-6">
                    {recommendedList.length > 0 && (
                        <div>
                            <div className="mb-3 flex items-center gap-1.5">
                                <Sparkles className="h-4 w-4 text-blue-600" />
                                <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">Recommended for your business</span>
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-4" role="group" aria-label="Recommended store categories">
                                {recommendedList.map(({ name, icon }) => renderCard(name, icon))}
                            </div>
                        </div>
                    )}

                    {(otherList.length > 0 || canAddCustom) && (
                        <div>
                            {recommendedList.length > 0 && (
                                <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                                    All Categories
                                </div>
                            )}
                            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-4" role="group" aria-label="Store categories">
                                {canAddCustom && renderCustomAddCard()}
                                {otherList.map(({ name, icon }) => renderCard(name, icon))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <p className="mt-4 text-xs text-gray-400">
                {selected.length === 0 ? 'Nothing selected yet' : `${selected.length} selected`}
            </p>

            <StepFooter onBack={onBack} loading={saving} onContinue={handleContinue} />
        </div>
    );
};



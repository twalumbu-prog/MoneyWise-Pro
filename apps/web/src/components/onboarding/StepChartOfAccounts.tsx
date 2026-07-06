import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Sparkles, RefreshCw, FileBarChart2, CirclePlus, Check, X, Pencil } from 'lucide-react';
import { onboardingService, CoaAccount, PlSection, PL_SECTIONS } from '../../services/onboarding.service';
import { StepFooter, ErrorBanner, SkeletonRow, GhostButton } from './ui';

interface Props {
    onBack: () => void;
    onSaved: () => Promise<void>;
    saving: boolean;
}

const SECTION_TYPE: Record<PlSection, 'INCOME' | 'EXPENSE'> = {
    'Revenue': 'INCOME',
    'Cost of Sales': 'EXPENSE',
    'Operating Expenses': 'EXPENSE',
    'Other Income': 'INCOME',
    'Other Expenses': 'EXPENSE',
};

const SECTION_CODE_BASE: Record<PlSection, number> = {
    'Revenue': 4000, 'Cost of Sales': 5000, 'Operating Expenses': 6000,
    'Other Income': 7000, 'Other Expenses': 8000,
};

const SECTION_LABEL: Record<PlSection, string> = {
    'Revenue': 'Income/Revenue Categories',
    'Cost of Sales': 'Cost of Sales Categories',
    'Operating Expenses': 'Operating Expenses Categories',
    'Other Income': 'Other Income Categories',
    'Other Expenses': 'Other Expenses Categories',
};

/** Stable pseudo-random illustrative amount for the sample P&L (per name+section). */
const illustrativeAmount = (name: string, section: PlSection): number => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    const unit = (h % 90) + 10; // 10-99
    switch (section) {
        case 'Revenue': return unit * 450;
        case 'Cost of Sales': return unit * 180;
        case 'Operating Expenses': return unit * 60;
        case 'Other Income': return unit * 15;
        case 'Other Expenses': return unit * 10;
    }
};

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Step 8 — AI-generated chart of accounts. Users can rename, enable/disable,
 * delete and add accounts, see a sample P&L built from them, then save.
 * Balance-sheet accounts come from the standard MoneyWise template and are
 * intentionally not shown here.
 */
export const StepChartOfAccounts: React.FC<Props> = ({ onBack, onSaved, saving }) => {
    const [accounts, setAccounts] = useState<CoaAccount[] | null>(null);
    const [method, setMethod] = useState<'AI' | 'TEMPLATE' | null>(null);
    const [generating, setGenerating] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [savingCoa, setSavingCoa] = useState(false);

    // The single row currently in edit mode (only one at a time), and its
    // draft name — accounts only become editable via the pencil icon, not by
    // tapping the name directly.
    const [editingCode, setEditingCode] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState('');

    const generate = async () => {
        setGenerating(true);
        setError(null);
        setEditingCode(null);
        try {
            const result = await onboardingService.generateChartOfAccounts();
            setAccounts(result.accounts.map(a => ({ ...a, is_active: true })));
            setMethod(result.method);
        } catch (err: any) {
            setError(err.message || 'Failed to generate your chart of accounts.');
        } finally {
            setGenerating(false);
        }
    };

    useEffect(() => { generate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const updateAccount = (code: string, patch: Partial<CoaAccount>) => {
        setAccounts(prev => prev!.map(a => a.code === code ? { ...a, ...patch } : a));
    };

    const removeAccount = (code: string) => {
        setAccounts(prev => prev!.filter(a => a.code !== code));
    };

    const addAccount = (section: PlSection) => {
        const existing = accounts || [];
        const sectionCodes = existing
            .filter(a => a.subtype === section)
            .map(a => parseInt(a.code, 10))
            .filter(n => !isNaN(n));
        const nextCode = (sectionCodes.length ? Math.max(...sectionCodes) : SECTION_CODE_BASE[section]) + 10;
        const newAccount: CoaAccount = {
            code: String(nextCode),
            name: '',
            type: SECTION_TYPE[section],
            subtype: section,
            description: '',
            is_active: true,
        };
        setAccounts(prev => [...(prev || []), newAccount]);
        // Jump straight into editing the new (blank) row so the user is
        // prompted for a name immediately instead of seeing an empty row.
        setEditingCode(newAccount.code);
        setEditDraft('');
    };

    const startEdit = (account: CoaAccount) => {
        setEditingCode(account.code);
        setEditDraft(account.name);
    };

    const commitEdit = () => {
        if (!editingCode) return;
        const name = editDraft.trim();
        if (name) updateAccount(editingCode, { name });
        setEditingCode(null);
    };

    const cancelEdit = () => setEditingCode(null);

    const deleteEditing = () => {
        if (!editingCode) return;
        removeAccount(editingCode);
        setEditingCode(null);
    };

    // Sample P&L totals from currently-enabled accounts.
    const pl = useMemo(() => {
        if (!accounts) return null;
        const active = accounts.filter(a => a.is_active !== false && a.name.trim());
        const sum = (section: PlSection) =>
            active.filter(a => a.subtype === section)
                .reduce((t, a) => t + illustrativeAmount(a.name, section), 0);
        const revenue = sum('Revenue');
        const cos = sum('Cost of Sales');
        const opex = sum('Operating Expenses');
        const otherIncome = sum('Other Income');
        const otherExpenses = sum('Other Expenses');
        return {
            revenue, cos, opex, otherIncome, otherExpenses,
            grossProfit: revenue - cos,
            netProfit: revenue - cos - opex + otherIncome - otherExpenses,
        };
    }, [accounts]);

    const handleSave = async () => {
        if (!accounts) return;
        const named = accounts.filter(a => a.name.trim());
        if (named.length === 0) {
            setError('Keep at least one account.');
            return;
        }
        if (!named.some(a => a.subtype === 'Revenue' && a.is_active !== false)) {
            setError('You need at least one active Revenue account.');
            return;
        }
        setSavingCoa(true);
        setError(null);
        try {
            await onboardingService.saveChartOfAccounts(named);
            await onSaved();
        } catch (err: any) {
            setError(err.message || 'Failed to save your chart of accounts.');
        } finally {
            setSavingCoa(false);
        }
    };

    return (
        <div>
            <ErrorBanner message={error} />

            {generating ? (
                <div className="space-y-6" aria-label="Generating chart of accounts" role="status">
                    <div className="flex items-center gap-3 p-4 rounded-2xl bg-blue-50 border border-blue-100">
                        <Sparkles className="h-5 w-5 text-blue-600 animate-pulse" />
                        <p className="text-sm font-bold text-gray-800">
                            Analysing your industries, store and products…
                        </p>
                    </div>
                    {[0, 1, 2].map(i => (
                        <div key={i} className="space-y-2">
                            <SkeletonRow className="h-5 w-40" />
                            <SkeletonRow className="h-12" />
                            <SkeletonRow className="h-12" />
                        </div>
                    ))}
                </div>
            ) : accounts && (
                <>
                    <div className="flex items-center justify-between mb-4">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full">
                            <Sparkles className="h-3.5 w-3.5" />
                            {method === 'AI' ? 'AI-generated for your business' : 'Built from your industry profile'}
                        </span>
                        <GhostButton onClick={generate} className="!min-h-0 !py-2 !px-3 text-xs">
                            <RefreshCw className="h-3.5 w-3.5" />
                            Regenerate
                        </GhostButton>
                    </div>

                    <div className="space-y-4">
                        {PL_SECTIONS.map(section => {
                            const rows = accounts.filter(a => a.subtype === section);
                            return (
                                <section
                                    key={section}
                                    aria-label={section}
                                    className="bg-white rounded-3xl shadow-[0px_4px_4px_0px_rgba(0,0,0,0.06)] border border-gray-100 px-5 pt-4 pb-6"
                                >
                                    <div className="flex items-center gap-2 mb-5">
                                        <h3 className="flex-1 mw-font-dmsans text-xs text-gray-700">{SECTION_LABEL[section]}</h3>
                                        <span className="px-2.5 py-1 bg-blue-50 rounded-full text-xs font-medium text-blue-600 flex-shrink-0">
                                            {rows.length} {rows.length === 1 ? 'Item' : 'Items'}
                                        </span>
                                    </div>

                                    {rows.length === 0 ? (
                                        <p className="text-xs text-gray-300 italic py-2 mb-5">No accounts in this section</p>
                                    ) : (
                                        <div className="flex flex-col gap-4 mb-6">
                                            {rows.map(account => {
                                                const disabled = account.is_active === false;
                                                const isEditing = editingCode === account.code;
                                                return (
                                                    <div key={account.code} className="flex items-center gap-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => updateAccount(account.code, { is_active: disabled })}
                                                            aria-pressed={!disabled}
                                                            aria-label={`${disabled ? 'Enable' : 'Disable'} ${account.name || 'account'}`}
                                                            className="w-6 h-6 flex items-center justify-center flex-shrink-0"
                                                        >
                                                            {disabled ? (
                                                                <CirclePlus className="h-6 w-6 text-gray-800" strokeWidth={1.5} />
                                                            ) : (
                                                                <span className="w-5 h-5 bg-black rounded-md flex items-center justify-center">
                                                                    <Check className="h-3 w-3 text-white" strokeWidth={3} />
                                                                </span>
                                                            )}
                                                        </button>

                                                        {isEditing ? (
                                                            <>
                                                                <input
                                                                    autoFocus
                                                                    value={editDraft}
                                                                    placeholder="Account name"
                                                                    aria-label={`Edit account name (${section})`}
                                                                    onChange={(e) => setEditDraft(e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                                                                        if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                                                                    }}
                                                                    className="flex-1 min-w-0 text-base text-gray-800 bg-transparent outline-none border-b-2 border-blue-600 py-0.5"
                                                                />
                                                                <button type="button" onClick={commitEdit} aria-label="Save" className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 flex-shrink-0">
                                                                    <Check className="h-4 w-4" strokeWidth={2.5} />
                                                                </button>
                                                                <button type="button" onClick={cancelEdit} aria-label="Cancel" className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 flex-shrink-0">
                                                                    <X className="h-4 w-4" />
                                                                </button>
                                                                <button type="button" onClick={deleteEditing} aria-label={`Delete ${account.name || 'account'}`} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 flex-shrink-0">
                                                                    <Trash2 className="h-4 w-4" />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className={`flex-1 min-w-0 truncate text-base ${disabled ? 'text-gray-400 line-through' : 'text-black'}`}>
                                                                    {account.name || <span className="italic text-gray-300">Untitled account</span>}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => startEdit(account)}
                                                                    aria-label={`Edit ${account.name || 'account'}`}
                                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex-shrink-0"
                                                                >
                                                                    <Pencil className="h-4 w-4" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => addAccount(section)}
                                        className="w-full h-11 bg-zinc-100 rounded-full flex items-center justify-center gap-1.5 text-zinc-600 text-xs font-bold hover:bg-zinc-200 transition-colors"
                                    >
                                        <Plus className="h-3.5 w-3.5" strokeWidth={3} />
                                        Add New Category
                                    </button>
                                </section>
                            );
                        })}
                    </div>

                    {/* Sample P&L preview */}
                    {pl && (
                        <div className="mt-8 rounded-2xl border border-gray-200 overflow-hidden">
                            <div className="flex items-center gap-2 px-5 py-3.5 bg-gray-800">
                                <FileBarChart2 className="h-4 w-4 text-white/70" />
                                <h3 className="text-sm font-bold text-white">Sample Profit & Loss</h3>
                                <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-white/50">
                                    Illustrative figures only
                                </span>
                            </div>
                            <dl className="px-5 py-4 text-sm">
                                <div className="flex justify-between py-1.5">
                                    <dt className="text-gray-500">Revenue</dt>
                                    <dd className="font-bold text-gray-800">K {fmt(pl.revenue)}</dd>
                                </div>
                                <div className="flex justify-between py-1.5">
                                    <dt className="text-gray-500">Cost of Sales</dt>
                                    <dd className="font-bold text-gray-800">(K {fmt(pl.cos)})</dd>
                                </div>
                                <div className="flex justify-between py-2 border-t border-gray-100 font-bold">
                                    <dt className="text-gray-800">Gross Profit</dt>
                                    <dd className="text-gray-800">K {fmt(pl.grossProfit)}</dd>
                                </div>
                                <div className="flex justify-between py-1.5">
                                    <dt className="text-gray-500">Operating Expenses</dt>
                                    <dd className="font-bold text-gray-800">(K {fmt(pl.opex)})</dd>
                                </div>
                                <div className="flex justify-between py-1.5">
                                    <dt className="text-gray-500">Other Income</dt>
                                    <dd className="font-bold text-gray-800">K {fmt(pl.otherIncome)}</dd>
                                </div>
                                <div className="flex justify-between py-1.5">
                                    <dt className="text-gray-500">Other Expenses</dt>
                                    <dd className="font-bold text-gray-800">(K {fmt(pl.otherExpenses)})</dd>
                                </div>
                                <div className={`flex justify-between py-2.5 border-t-2 border-gray-200 font-bold text-base ${
                                    pl.netProfit >= 0 ? 'text-green-600' : 'text-red-500'
                                }`}>
                                    <dt>Net Profit</dt>
                                    <dd>K {fmt(pl.netProfit)}</dd>
                                </div>
                            </dl>
                        </div>
                    )}

                    <StepFooter
                        onBack={onBack}
                        loading={savingCoa || saving}
                        continueLabel="Save"
                        onContinue={handleSave}
                    />
                </>
            )}
        </div>
    );
};

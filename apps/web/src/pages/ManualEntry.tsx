import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Pencil, Plus, Sparkles } from 'lucide-react';
import { accountService, cashbookService, formatKwacha } from 'core';
import type { ManualEntryResult } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { Dialog, PrimaryButton, TonalButton, fieldClass, labelClass } from '../components/ui/Dialog';

const today = () => new Date().toISOString().split('T')[0];

/**
 * New manual entry: for money that moved on an external account (a bank or mobile-money account tracked by hand). Say what it was, how
 * much and which account; the AI works out the accounting category and it shows up in Reporting under it. The web twin of the Expo screen.
 */
export const ManualEntry: React.FC = () => {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [params] = useSearchParams();

    const [direction, setDirection] = useState<'IN' | 'OUT'>(params.get('direction') === 'out' ? 'OUT' : 'IN');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState(today());
    const [walletId, setWalletId] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [banner, setBanner] = useState<string | null>(null);
    const [result, setResult] = useState<ManualEntryResult | null>(null);

    const { data: walletsRaw, isLoading: walletsLoading } = useQuery({ queryKey: ['external-wallets'], queryFn: () => cashbookService.getExternalWallets() });
    const wallets: any[] = Array.isArray(walletsRaw) ? walletsRaw : (walletsRaw?.data || []);

    const save = useMutation({
        mutationFn: () => cashbookService.recordManualEntry({ direction, amount: Number(amount), description: description.trim(), date, externalWalletId: walletId }),
        onSuccess: (res) => {
            setResult(res);
            qc.invalidateQueries();
        },
        onError: (e: any) => setBanner(e?.message || 'Could not save this entry. Please try again.'),
    });

    const onSave = () => {
        const e: Record<string, string> = {};
        const n = Number(amount);
        if (!amount || !Number.isFinite(n) || n <= 0) e.amount = 'Enter an amount';
        if (description.trim().length < 2) e.description = 'Say what this was for';
        if (!walletId) e.walletId = 'Choose the account';
        if (!date) e.date = 'Enter a valid date';
        setErrors(e);
        if (Object.keys(e).length) { setBanner('Please fix the highlighted fields.'); return; }
        setBanner(null);
        save.mutate();
    };

    const isIn = direction === 'IN';
    const bad = (key: string) => (errors[key] ? 'border-[#D93025] focus:border-[#D93025] focus:ring-[#D93025]' : '');

    if (result) {
        return (
            <PagePanel title="Entry recorded" back="/cashbook" maxWidth="max-w-xl">
                <ResultView
                    result={result}
                    onDone={() => navigate('/cashbook')}
                    onAnother={() => { setResult(null); setAmount(''); setDescription(''); setErrors({}); }}
                    onCategoryChanged={(category) => setResult((r) => (r ? { ...r, category } : r))}
                />
            </PagePanel>
        );
    }

    return (
        <PagePanel title="New manual entry" subtitle="Record money that moved outside MoneyWise" back="/cashbook" maxWidth="max-w-xl">
            <div className="mb-6 flex rounded-full p-[3px] shadow-[inset_0_0_0_1px_#C4C7C5]" role="tablist">
                {([['IN', 'Money in'], ['OUT', 'Money out']] as const).map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={direction === value}
                        onClick={() => setDirection(value)}
                        className={`flex-1 rounded-full py-2.5 text-sm transition ${direction === value ? 'bg-[#D3E3FD] font-bold text-[#041E49]' : 'font-medium text-[#5F6368] hover:bg-[#F1F3F4]'}`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {banner && (
                <div role="alert" className="mb-5 flex items-center gap-2 rounded-xl bg-[#FCE8E6] px-4 py-3 text-sm text-[#B31412]"><AlertCircle size={16} /> {banner}</div>
            )}

            <div className="mb-5">
                <label className={labelClass} htmlFor="me-amount">Amount</label>
                <div className="relative">
                    <span className={`pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-bold ${isIn ? 'text-[#137333]' : 'text-[#1F1F1F]'}`}>K</span>
                    <input
                        id="me-amount"
                        className={`h-20 w-full rounded-2xl border border-[#C4C7C5] bg-white pl-12 pr-5 text-3xl font-bold tabular-nums text-[#1F1F1F] placeholder:text-[#DADCE0] focus:border-[#0B57D0] focus:outline-none focus:ring-1 focus:ring-[#0B57D0] ${bad('amount')}`}
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')); setErrors((x) => ({ ...x, amount: '' })); }}
                        placeholder="0.00"
                        autoFocus
                    />
                </div>
                {errors.amount && <p className="mt-1 text-xs text-[#B31412]">{errors.amount}</p>}
            </div>

            <div className="mb-5">
                <label className={labelClass} htmlFor="me-desc">Details</label>
                <input
                    id="me-desc"
                    className={`${fieldClass} ${bad('description')}`}
                    value={description}
                    onChange={(e) => { setDescription(e.target.value); setErrors((x) => ({ ...x, description: '' })); }}
                    placeholder={isIn ? 'e.g. Rent from tenant' : 'e.g. Electricity bill'}
                />
                {errors.description && <p className="mt-1 text-xs text-[#B31412]">{errors.description}</p>}
            </div>

            <div className="mb-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                    <label className={labelClass} htmlFor="me-date">Date</label>
                    <input id="me-date" type="date" max={today()} className={`${fieldClass} ${bad('date')}`} value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                    <label className={labelClass} htmlFor="me-wallet">{isIn ? 'Into account' : 'From account'}</label>
                    <select id="me-wallet" className={`${fieldClass} appearance-none ${bad('walletId')}`} value={walletId} onChange={(e) => { setWalletId(e.target.value); setErrors((x) => ({ ...x, walletId: '' })); }} disabled={walletsLoading || wallets.length === 0}>
                        <option value="">{walletsLoading ? 'Loading…' : wallets.length ? 'Choose account' : 'No accounts yet'}</option>
                        {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                    {errors.walletId && <p className="mt-1 text-xs text-[#B31412]">{errors.walletId}</p>}
                </div>
            </div>

            {!walletsLoading && wallets.length === 0 && (
                <div className="mb-5 rounded-2xl border border-dashed border-[#C4C7C5] p-5 text-center">
                    <p className="text-sm font-semibold text-[#1F1F1F]">Add an external account first</p>
                    <p className="mt-1 text-xs text-[#5F6368]">Manual entries are recorded against a bank or mobile-money account that you track here.</p>
                    <TonalButton onClick={() => navigate('/cashbook')} className="mt-3"><Plus size={14} /> Add account</TonalButton>
                </div>
            )}

            <p className="mb-6 flex items-start gap-2 rounded-xl bg-[#E8F0FE] px-4 py-3 text-xs text-[#1967D2]">
                <Sparkles size={14} className="mt-0.5 flex-shrink-0" />
                We’ll work out the income or expense category from your details, and you can change it afterwards.
            </p>

            <PrimaryButton onClick={onSave} busy={save.isPending} className="w-full">Save entry</PrimaryButton>
        </PagePanel>
    );
};

const ResultView: React.FC<{
    result: ManualEntryResult;
    onDone: () => void;
    onAnother: () => void;
    onCategoryChanged: (c: NonNullable<ManualEntryResult['category']>) => void;
}> = ({ result, onDone, onAnother, onCategoryChanged }) => {
    const qc = useQueryClient();
    const isIn = result.direction === 'IN';
    const cat = result.category;
    const [pickerOpen, setPickerOpen] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [query, setQuery] = useState('');

    const { data: allAccounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => accountService.getAll() });
    const options = useMemo(() => allAccounts
        .filter((a) => a.is_active && a.type === (isIn ? 'INCOME' : 'EXPENSE'))
        .filter((a) => a.name.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)), [allAccounts, isIn, query]);

    const choose = async (id: string) => {
        const a = allAccounts.find((x) => x.id === id);
        if (!a) return;
        setErr(null);
        try {
            await cashbookService.setEntryAccount(result.entryId, id);
            onCategoryChanged({ id: a.id, code: a.code, name: a.name, emoji: null, source: 'USER', reasoning: null, confidence: null });
            qc.invalidateQueries();
            setPickerOpen(false);
        } catch (e: any) {
            setErr(e?.message || 'Could not change the category.');
        }
    };

    return (
        <div className="flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-[#34A853] text-[#34A853]"><Check size={32} strokeWidth={3} /></span>
            <p className={`mt-4 text-4xl font-bold tabular-nums ${isIn ? 'text-[#137333]' : 'text-[#1F1F1F]'}`}>{isIn ? '+' : '−'}{formatKwacha(result.amount)}</p>
            <p className="mt-1 text-sm text-[#5F6368]">{isIn ? 'into' : 'from'} {result.externalWallet.name}</p>
            {result.referenceNumber && <p className="mt-1 text-xs text-[#80868B]">{result.referenceNumber}</p>}

            <div className="mt-8 w-full rounded-2xl border border-[rgba(116,119,117,0.22)] p-5 text-left">
                <p className={labelClass}>{isIn ? 'Income category' : 'Expense category'}</p>
                {cat ? (
                    <>
                        <p className="flex items-center gap-2 text-base font-bold text-[#1F1F1F]">
                            {cat.emoji ? `${cat.emoji} ` : ''}{cat.name}
                            {cat.source === 'AI' && <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F0FE] px-2 py-0.5 text-[10px] font-bold text-[#1967D2]"><Sparkles size={10} /> AI</span>}
                        </p>
                        {cat.reasoning && <p className="mt-1 text-xs text-[#5F6368]">{cat.reasoning}</p>}
                    </>
                ) : (
                    <p className="text-sm text-[#5F6368]">We weren’t sure where this belongs. Pick a category so it appears in your reports.</p>
                )}
                <button type="button" onClick={() => setPickerOpen(true)} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B57D0] hover:underline">
                    <Pencil size={13} /> {cat ? 'Change category' : 'Choose category'}
                </button>
            </div>

            <PrimaryButton onClick={onDone} className="mt-6 w-full">Done</PrimaryButton>
            <button type="button" onClick={onAnother} className="mt-3 text-sm font-semibold text-[#0B57D0] hover:underline">Add another entry</button>

            <Dialog open={pickerOpen} title={isIn ? 'Income category' : 'Expense category'} onClose={() => setPickerOpen(false)}>
                {err && <p role="alert" className="mb-3 rounded-xl bg-[#FCE8E6] px-4 py-3 text-sm text-[#B31412]">{err}</p>}
                <input className={`${fieldClass} mb-3`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search categories" autoFocus />
                <ul className="max-h-72 overflow-y-auto">
                    {options.length === 0 && <li className="py-3 text-sm text-[#80868B]">No categories found.</li>}
                    {options.map((a) => (
                        <li key={a.id}>
                            <button type="button" onClick={() => choose(a.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm hover:bg-[#E9EEF6] ${a.id === cat?.id ? 'font-bold text-[#0B57D0]' : 'text-[#1F1F1F]'}`}>
                                {a.name}
                                {a.id === cat?.id && <Check size={14} />}
                            </button>
                        </li>
                    ))}
                </ul>
            </Dialog>
        </div>
    );
};

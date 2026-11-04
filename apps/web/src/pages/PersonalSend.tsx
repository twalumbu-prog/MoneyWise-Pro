import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    AlertCircle, ArrowDownToLine, ArrowLeft, ArrowRight, Building2, Check, CheckCircle, ChevronDown, Loader2, Mail, Minus, Plus, Search,
    ShieldCheck, Smartphone, Star, Trash2, X,
} from 'lucide-react';
import {
    cashbookService, departmentService, formatKwacha, lencoService, requisitionService, userService,
} from 'core';
import type { MoneyWiseRecipient, SendSummary } from 'core';
import { Layout } from '../components/Layout';
import BankSelect from '../components/BankSelect';
import WalletSelect from '../components/WalletSelect';
import { useAuth } from '../context/AuthContext';
import { useFavoriteRecipients } from '../hooks/useFavoriteRecipients';
import type { FavoriteRecipient } from '../hooks/useFavoriteRecipients';

interface LineItem {
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    estimated_amount: number;
}

const blankItem = (): LineItem => ({ id: Math.random().toString(36).slice(2), description: '', quantity: 1, unit_price: 0, estimated_amount: 0 });

type Tab = 'basic' | 'buy' | 'order';
const TABS: { value: Tab; label: string }[] = [
    { value: 'basic', label: 'Send' },
    { value: 'buy', label: 'Buy' },
    { value: 'order', label: 'Order' },
];

// 1 = purpose, 2 = item list, 5 = amount (instead of 2 when there is no item list), 3 = who to pay, 4 = review.
type Stage = 1 | 2 | 3 | 4 | 5;
type Method = 'moneywise' | 'mobile' | 'bank';

const PREF_MAKE_LIST = 'mw_personal_send_make_list';
const readPref = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const writePref = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } };

const initialsOf = (name: string) => (name || 'M').split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

const RecipientAvatar: React.FC<{ name: string; logoUrl?: string | null; size?: number }> = ({ name, logoUrl, size = 40 }) => {
    const [broken, setBroken] = useState(false);
    if (logoUrl && !broken) {
        return <img src={logoUrl} alt="" onError={() => setBroken(true)} style={{ width: size, height: size }} className="rounded-full bg-[#F8FAFD] object-cover" />;
    }
    return (
        <span
            style={{ width: size, height: size, fontSize: size * 0.38 }}
            className="flex flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#0B57D0]/25 bg-[#E8F0FE] font-bold text-[#0B57D0]"
        >
            {initialsOf(name)}
        </span>
    );
};

const lookupFailureText = (e: any): string => {
    const msg = String(e?.message || '');
    if (/unauthorized|session|token/i.test(msg)) return 'Session expired — please sign in again';
    if (/network|timeout|failed to fetch|reach/i.test(msg)) return 'Can’t verify right now — check your connection';
    return 'Name not confirmed';
};

const normalisePhone = (val: string) => {
    const clean = val.replace(/[^0-9]/g, '');
    return clean.startsWith('260') ? '0' + clean.substring(3) : clean;
};
const operatorOf = (normalised: string) => {
    if (normalised.startsWith('097') || normalised.startsWith('077')) return 'AIRTEL';
    if (normalised.startsWith('096') || normalised.startsWith('076')) return 'MTN';
    if (normalised.startsWith('095') || normalised.startsWith('075')) return 'ZAMTEL';
    return '';
};

const fieldClass = 'h-12 w-full rounded-xl border border-[rgba(116,119,117,0.22)] bg-white px-4 text-sm text-[#1F1F1F] placeholder:text-[#80868B] focus:border-[#0B57D0] focus:outline-none focus:ring-1 focus:ring-[#0B57D0]';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#5F6368]';

/** The "money sent" popup: confirms the payment, then shows which account it was filed under and what is left of that budget. */
const SentPopup: React.FC<{ requisitionId: string; amount: number; recipient: string | null; onClose: () => void }> = ({ requisitionId, amount, recipient, onClose }) => {
    const [summary, setSummary] = useState<SendSummary | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            // Filing the payment under an account happens just after it is sent, so look a few times before giving up.
            for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
                try {
                    const s = await requisitionService.getSendSummary(requisitionId);
                    if (cancelled) return;
                    setSummary(s);
                    if (s.status === 'ready') return;
                } catch {
                    if (!cancelled && attempt >= 2) { setFailed(true); return; }
                }
                await new Promise((r) => setTimeout(r, 1500));
            }
            if (!cancelled) setFailed(true);
        })();
        return () => { cancelled = true; };
    }, [requisitionId]);

    const ready = summary?.status === 'ready' && !!summary.account;
    const budget = ready ? summary!.budget : null;
    const accountName = ready ? summary!.account!.name.replace(/^[^\p{L}\p{N}]+/u, '').trim() : '';
    const used = budget ? Math.min(100, Math.max(0, budget.percentUsed)) : 0;
    const barTone = !budget ? 'bg-[#0B57D0]' : budget.over ? 'bg-[#EA4335]' : budget.percentUsed >= 80 ? 'bg-[#FBBC04]' : 'bg-[#0B57D0]';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="relative w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[#80868B] hover:bg-[#E9EEF6]">
                    <X size={16} />
                </button>
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-[#34A853] text-[#34A853]">
                    <Check size={32} strokeWidth={3} />
                </span>
                <h2 className="mt-4 text-lg font-bold text-[#1F1F1F]">Money sent</h2>
                <p className="mt-1 text-3xl font-bold text-[#1F1F1F]">{formatKwacha(amount)}</p>
                {recipient && <p className="mt-1 truncate text-sm text-[#5F6368]">to {recipient}</p>}

                <div className="mt-6 min-h-[64px] rounded-2xl bg-[#F8FAFD] p-4 text-left">
                    {!summary && !failed && (
                        <p className="flex items-center gap-2 text-sm text-[#80868B]"><Loader2 size={14} className="animate-spin" /> Filing this under your accounts…</p>
                    )}
                    {failed && !ready && <p className="text-sm text-[#80868B]">Sent. It will be filed under your accounts shortly.</p>}
                    {ready && (
                        <>
                            <p className="text-xs text-[#5F6368]">Filed under</p>
                            <p className="text-sm font-semibold text-[#1F1F1F]">{accountName}</p>
                            {summary!.spentAfter !== null && (
                                <p className="mt-2 text-xs text-[#5F6368]">
                                    {formatKwacha(summary!.spentAfter)} spent this month{budget ? ` of ${formatKwacha(budget.amount)}` : ''}
                                </p>
                            )}
                            {budget && (
                                <>
                                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E9EEF6]">
                                        <div className={`h-full rounded-full transition-all duration-700 ${barTone}`} style={{ width: `${used}%` }} />
                                    </div>
                                    <p className={`mt-2 text-xs font-medium ${budget.over ? 'text-[#D93025]' : budget.percentUsed >= 80 ? 'text-[#B06000]' : 'text-[#0B57D0]'}`}>
                                        {budget.over ? `Over budget by ${formatKwacha(-budget.remaining)}` : `${formatKwacha(budget.remaining)} left in this budget`}
                                    </p>
                                </>
                            )}
                        </>
                    )}
                </div>

                <button type="button" onClick={onClose} className="mt-6 h-12 w-full rounded-full bg-[#0B57D0] text-sm font-semibold text-white hover:bg-[#0842A0]">
                    Done
                </button>
            </div>
        </div>
    );
};

/**
 * New Transaction: the web take on the Expo app's send flow for a personal account. Purpose, then the amount (or an item list), then who
 * to pay (a MoneyWise account, a mobile-money number or a bank account), then a review; the payment goes out from the chosen wallet and
 * a "money sent" popup shows where it was filed and what is left of that budget.
 */
export const PersonalSend: React.FC = () => {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { userName, userRole, organizationId } = useAuth();

    const [tab, setTab] = useState<Tab>('basic');
    const [stage, setStage] = useState<Stage>(1);

    const [description, setDescription] = useState('');
    const [department, setDepartment] = useState('');
    const [makeList, setMakeList] = useState(() => readPref(PREF_MAKE_LIST) === 'true');
    const [lineItems, setLineItems] = useState<LineItem[]>([blankItem()]);
    const [manualAmount, setManualAmount] = useState('');

    const [method, setMethod] = useState<Method>('moneywise');
    const [mwQuery, setMwQuery] = useState('');
    const [mwSuggestions, setMwSuggestions] = useState<MoneyWiseRecipient[]>([]);
    const [searchingMw, setSearchingMw] = useState(false);
    const [recipient, setRecipient] = useState<MoneyWiseRecipient | null>(null);
    const [phoneText, setPhoneText] = useState('');
    const [momoOperator, setMomoOperator] = useState('');
    const [bankId, setBankId] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [resolvedName, setResolvedName] = useState('');
    const [confirmingName, setConfirmingName] = useState(false);

    const [walletId, setWalletId] = useState<string | null>(null);
    const [walletBalance, setWalletBalance] = useState<number | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [failedRequisitionId, setFailedRequisitionId] = useState<string | null>(null);
    const [sent, setSent] = useState<{ requisitionId: string; amount: number; recipient: string | null } | null>(null);

    const { data: accountability } = useQuery({
        queryKey: ['requisitions', 'accountability', organizationId],
        queryFn: () => requisitionService.getAccountability(),
        enabled: !!organizationId,
    });
    const outstanding = accountability?.outstanding?.[0];

    const { data: deptConfig } = useQuery({ queryKey: ['departments'], queryFn: () => departmentService.list() });
    const useDepartments = deptConfig?.use_departments ?? false;
    const departments = deptConfig?.departments ?? [];

    const { data: banksRaw } = useQuery({ queryKey: ['lenco-banks'], queryFn: () => lencoService.getBanks() });
    const banks: any[] = Array.isArray(banksRaw) ? banksRaw : (banksRaw?.data || []);

    const { data: walletsRaw } = useQuery({ queryKey: ['wallets'], queryFn: () => cashbookService.getWallets() });
    const wallets: any[] = Array.isArray(walletsRaw) ? walletsRaw : (walletsRaw?.data || []);

    useEffect(() => {
        if (wallets.length > 0 && !walletId) setWalletId((wallets.find((w: any) => w.is_main) || wallets[0]).id);
    }, [wallets, walletId]);

    useEffect(() => {
        if (!walletId) { setWalletBalance(null); return; }
        let cancelled = false;
        cashbookService.getBalance('MONEYWISE_WALLET', undefined, walletId)
            .then((b: any) => { if (!cancelled) setWalletBalance(Number(b) || 0); })
            .catch(() => { if (!cancelled) setWalletBalance(null); });
        return () => { cancelled = true; };
    }, [walletId]);

    const total = useMemo(
        () => (makeList ? lineItems.reduce((s, i) => s + Number(i.estimated_amount), 0) : Number(manualAmount) || 0),
        [makeList, lineItems, manualAmount],
    );
    const insufficient = !!walletId && walletBalance !== null && total > walletBalance;

    // MoneyWise recipient search, as you type.
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (method !== 'moneywise' || recipient) return;
        const q = mwQuery.trim();
        if (q.length < 2) { setMwSuggestions([]); setSearchingMw(false); return; }
        setSearchingMw(true);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(async () => {
            try { setMwSuggestions((await userService.searchRecipients(q)) || []); }
            catch { setMwSuggestions([]); }
            finally { setSearchingMw(false); }
        }, 300);
        return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    }, [mwQuery, method, recipient]);

    const phone = normalisePhone(phoneText);
    useEffect(() => { setMomoOperator(operatorOf(phone)); }, [phone]);

    // Look up who owns a mobile-money number or bank account, so the person can see the name before paying.
    useEffect(() => {
        if (method === 'moneywise') return;
        const ready = method === 'mobile' ? phone.length >= 10 && !!momoOperator : accountNumber.length >= 5 && !!bankId;
        if (!ready) { setResolvedName(''); return; }
        let cancelled = false;
        setConfirmingName(true);
        const lookup = method === 'mobile'
            ? lencoService.resolveMobileMoney(phone, momoOperator, organizationId ?? undefined)
            : lencoService.resolveBankAccount(accountNumber, bankId, organizationId ?? undefined);
        lookup
            .then((res: any) => { if (!cancelled) setResolvedName(res.accountName || res.account_name || res.name || ''); })
            .catch((e: any) => { if (!cancelled) setResolvedName(lookupFailureText(e)); })
            .finally(() => { if (!cancelled) setConfirmingName(false); });
        return () => { cancelled = true; };
    }, [method, phone, momoOperator, accountNumber, bankId, organizationId]);

    const { favorites, isFavorite, toggleFavorite, removeFavorite } = useFavoriteRecipients(organizationId);

    /** What would be saved for whoever is currently filled in, or null while the details are not yet confirmed. */
    const currentFavorite = (): Omit<FavoriteRecipient, 'savedAt'> | null => {
        if (method === 'moneywise' && recipient) {
            return {
                id: `mw:${recipient.id}`, method, name: recipient.name, logoUrl: recipient.logo_url,
                subtitle: recipient.username ? `@${recipient.username}` : (recipient.email || recipient.moneywise_id), recipient,
            };
        }
        const confirmed = !!resolvedName && resolvedName !== 'Name not confirmed' && !/^Session|^Can’t/.test(resolvedName) && !confirmingName;
        if (method === 'mobile' && confirmed && phone) {
            return { id: `momo:${phone}`, method, name: resolvedName, subtitle: `${momoOperator || 'Mobile money'} · ${phone}`, phone, operator: momoOperator };
        }
        if (method === 'bank' && confirmed && accountNumber && bankId) {
            const bankName = banks.find((b: any) => (b.id || b.code) === bankId)?.name ?? '';
            return { id: `bank:${bankId}:${accountNumber}`, method, name: resolvedName, subtitle: `${bankName || 'Bank'} · ${accountNumber}`, bankId, bankName, accountNumber };
        }
        return null;
    };
    const currentFav = currentFavorite();

    /** One tap on a favourite fills in the method and the details, so nothing has to be typed again. */
    const applyFavorite = (f: FavoriteRecipient) => {
        setError(null);
        setMethod(f.method);
        if (f.method === 'moneywise' && f.recipient) {
            setRecipient(f.recipient);
            setResolvedName(f.recipient.name);
            setMwSuggestions([]);
        } else if (f.method === 'mobile') {
            setRecipient(null);
            setPhoneText(f.phone ?? '');
            setResolvedName('');
        } else if (f.method === 'bank') {
            setRecipient(null);
            setBankId(f.bankId ?? '');
            setAccountNumber(f.accountNumber ?? '');
            setResolvedName('');
        }
    };

    const switchMethod = (m: Method) => {
        setMethod(m);
        setResolvedName(m === 'moneywise' && recipient ? recipient.name : '');
        setError(null);
    };

    const sequence = (): Stage[] => [1, makeList ? 2 : 5, 3, 4];

    const updateItem = (id: string, patch: Partial<LineItem>) => {
        setLineItems((prev) => prev.map((item) => {
            if (item.id !== id) return item;
            const next = { ...item, ...patch };
            if ('quantity' in patch || 'unit_price' in patch) next.estimated_amount = Number(next.quantity) * Number(next.unit_price);
            return next;
        }));
    };

    const proceed = () => {
        setError(null);
        if (stage === 1) {
            if (!description.trim()) { setError('Please say what this payment is for.'); return; }
            if (useDepartments && !department) { setError('Please select a department.'); return; }
        } else if (stage === 5 || stage === 2) {
            if (total <= 0) { setError('Please enter an amount greater than zero.'); return; }
        } else if (stage === 3) {
            if (method === 'moneywise') {
                if (!recipient) { setError('Search for and select a MoneyWise account to pay.'); return; }
            } else if (!resolvedName || resolvedName === 'Name not confirmed' || confirmingName) {
                setError('Please verify the recipient details first.'); return;
            }
        }
        const seq = sequence();
        const i = seq.indexOf(stage);
        if (i !== -1 && i < seq.length - 1) setStage(seq[i + 1]);
    };

    const back = () => {
        setError(null);
        const seq = sequence();
        const i = seq.indexOf(stage);
        if (i > 0) setStage(seq[i - 1]); else navigate(-1);
    };

    const recipientName = method === 'moneywise' ? (recipient?.name ?? '') : resolvedName;

    const submit = useCallback(async () => {
        if (insufficient) {
            setError(`This wallet only has ${formatKwacha(walletBalance || 0)} available, but ${formatKwacha(total)} is needed. Choose another wallet or add money first.`);
            return;
        }
        setSubmitting(true);
        setError(null);
        setFailedRequisitionId(null);
        try {
            const data: any = {
                description,
                department,
                estimated_total: total,
                items: makeList ? lineItems.map(({ description: d, quantity, unit_price, estimated_amount }) => ({
                    description: d, quantity: Number(quantity), unit_price: Number(unit_price), estimated_amount: Number(estimated_amount),
                })) : undefined,
                payment_method: method === 'moneywise' ? 'MONEYWISE_PAY' : method === 'mobile' ? momoOperator : 'BANK',
                recipient_account: method === 'moneywise' ? (recipient?.id || mwQuery) : method === 'mobile' ? phone : accountNumber,
                recipient_bank_code: method === 'moneywise' ? 'MONEYWISE' : method === 'bank' ? bankId : momoOperator,
                recipient_name: recipientName,
                recipient_organization_id: method === 'moneywise' ? (recipient?.organization_id || undefined) : undefined,
            };
            const created = await requisitionService.create(data);

            if (userRole === 'ADMIN') {
                try {
                    const result = await requisitionService.autoDisburse(created.id, {
                        payment_method: method === 'moneywise' ? 'MONEYWISE_PAY' : 'MONEYWISE_WALLET',
                        total_prepared: total,
                        recipient_account: method === 'moneywise' ? (recipient?.id || mwQuery) : method === 'mobile' ? phone : accountNumber,
                        recipient_bank_code: method === 'moneywise' ? 'moneywise' : (method === 'mobile' ? momoOperator : bankId).toLowerCase(),
                        recipient_account_name: recipientName || undefined,
                        recipient_organization_id: method === 'moneywise' ? (recipient?.organization_id || undefined) : undefined,
                        wallet_id: walletId || undefined,
                    });
                    if (result.lencoStatus === 'pending') {
                        for (let attempt = 0; attempt < 8; attempt++) {
                            await new Promise((r) => setTimeout(r, 4000));
                            const poll = await requisitionService.verifyDisbursement(created.id);
                            if (poll.status === 'successful') break;
                            if (poll.status === 'failed') throw new Error(poll.error || poll.details?.reasonForFailure || 'The transfer was rejected.');
                        }
                    }
                } catch (disbErr: any) {
                    setFailedRequisitionId(created.id);
                    setError(`${disbErr.message || 'The payment could not be sent.'} The transaction was created, so you can finish it from your inbox.`);
                    return;
                }
            }

            qc.invalidateQueries({ queryKey: ['requisitions'] });
            qc.invalidateQueries({ queryKey: ['wallets'] });
            qc.invalidateQueries({ queryKey: ['cashbook-entries'] });
            setSent({ requisitionId: created.id, amount: total, recipient: recipientName || null });
        } catch (e: any) {
            setError(e?.message ?? 'Submission failed. Please try again.');
            if (e?.activeRequisitionId) setFailedRequisitionId(e.activeRequisitionId);
        } finally {
            setSubmitting(false);
        }
    }, [insufficient, walletBalance, total, description, department, makeList, lineItems, method, momoOperator, recipient, mwQuery, phone, accountNumber, bankId,
        recipientName, userRole, walletId, qc]);

    const steps = sequence();
    const stepIndex = Math.max(0, steps.indexOf(stage));
    const methodLabel = method === 'moneywise' ? 'MoneyWise Pay' : method === 'mobile' ? 'Mobile Money' : 'Bank Transfer';

    return (
        <Layout noPadding={true} backgroundColor="bg-white">
            <div className="flex-1 overflow-y-auto bg-white md:mx-4 md:mb-4 md:h-[calc(100%-1rem)] md:flex-none md:rounded-[20px] md:border md:border-[rgba(116,119,117,0.22)]">
                <div className="mx-auto w-full max-w-xl px-5 py-6 md:py-10">
                    <div className="mb-5 flex items-center justify-between">
                        <h1 className="font-advercase text-3xl font-bold text-[#1F1F1F]">New Transaction</h1>
                        <button type="button" onClick={() => navigate(-1)} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E9EEF6] text-[#041E49] hover:bg-[#E9EEF6]">
                            <X size={16} strokeWidth={3} />
                        </button>
                    </div>

                    <div className="mb-6 flex rounded-full p-[3px] shadow-[inset_0_0_0_1px_#C4C7C5]">
                        {TABS.map((t) => (
                            <button
                                key={t.value}
                                type="button"
                                onClick={() => setTab(t.value)}
                                className={`flex-1 rounded-full py-2.5 text-sm transition ${tab === t.value ? 'bg-[#D3E3FD] font-bold text-[#041E49]' : 'font-medium text-[#5F6368] hover:bg-[#F8FAFD]'}`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {tab !== 'basic' ? (
                        <div className="flex flex-col items-center rounded-2xl border border-dashed border-[rgba(116,119,117,0.22)] py-16 text-center">
                            <AlertCircle size={28} className="text-[#9AA0A6]" />
                            <p className="mt-3 text-sm font-semibold text-[#3C4043]">{tab === 'buy' ? 'Buy' : 'Order'} is coming soon</p>
                            <p className="mt-1 text-xs text-[#80868B]">Stay tuned.</p>
                        </div>
                    ) : (
                        <>
                            <div className="mb-6 flex gap-1.5" aria-label={`Step ${stepIndex + 1} of ${steps.length}`}>
                                {steps.map((s, i) => (
                                    <span key={s} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? 'bg-[#0B57D0]' : 'bg-[#E9EEF6]'}`} />
                                ))}
                            </div>

                            {outstanding && (
                                <div className="mb-4 rounded-2xl border border-[#FEEFC3] bg-[#FEF7E0] p-4">
                                    <p className="flex items-center gap-2 text-sm font-semibold text-[#B06000]"><AlertCircle size={16} /> Accountability safeguard active</p>
                                    <p className="mt-1 text-xs text-[#B06000]/80">
                                        You have an earlier transaction that still needs reconciling. You can create this one, but no money can be sent for it until that is done.
                                    </p>
                                    <button type="button" onClick={() => navigate('/requisitions')} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#E37400] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B06000]">
                                        Reconcile {outstanding.reference_number || `#${outstanding.id.slice(0, 8)}`} <ArrowRight size={12} />
                                    </button>
                                </div>
                            )}

                            {error && (
                                <div className="mb-4 flex items-start gap-2 rounded-2xl border border-[#FAD2CF] bg-[#FCE8E6] p-4 text-sm text-[#B31412]" role="alert">
                                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                                    <div className="flex-1">
                                        <p>{error}</p>
                                        {failedRequisitionId && (
                                            <button type="button" onClick={() => navigate('/requisitions')} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#D93025] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#B31412]">
                                                Finish transaction <ArrowRight size={12} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {stage === 1 && (
                                <div className="flex flex-col gap-5">
                                    <h2 className="text-lg font-bold text-[#1F1F1F]">Details</h2>
                                    <div>
                                        <label className={labelClass} htmlFor="ps-purpose">Purpose of funds</label>
                                        <input id="ps-purpose" className={fieldClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this payment for?" autoFocus />
                                    </div>
                                    {useDepartments && (
                                        <div>
                                            <label className={labelClass} htmlFor="ps-dept">Department</label>
                                            <div className="relative">
                                                <select id="ps-dept" className={`${fieldClass} appearance-none`} value={department} onChange={(e) => setDepartment(e.target.value)}>
                                                    <option value="">Select department</option>
                                                    {departments.map((d: any) => <option key={d.id ?? d.name} value={d.name}>{d.name}</option>)}
                                                </select>
                                                <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#80868B]" />
                                            </div>
                                        </div>
                                    )}
                                    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-[rgba(116,119,117,0.22)] p-4">
                                        <span>
                                            <span className="block text-sm font-semibold text-[#1F1F1F]">Create item list</span>
                                            <span className="block text-xs text-[#80868B]">Add specific items and prices</span>
                                        </span>
                                        <input
                                            type="checkbox"
                                            checked={makeList}
                                            onChange={(e) => { setMakeList(e.target.checked); writePref(PREF_MAKE_LIST, String(e.target.checked)); }}
                                            className="h-5 w-5 rounded border-[#C4C7C5] text-[#0B57D0] focus:ring-[#0B57D0]"
                                        />
                                    </label>
                                </div>
                            )}

                            {stage === 5 && (
                                <div className="flex flex-col gap-5">
                                    <div>
                                        <h2 className="text-lg font-bold text-[#1F1F1F]">Amount</h2>
                                        <p className="text-sm text-[#5F6368]">How much do you want to send?</p>
                                    </div>
                                    <div className="relative">
                                        <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-bold text-[#80868B]">K</span>
                                        <input
                                            className="h-20 w-full rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white pl-12 pr-5 text-3xl font-bold text-[#1F1F1F] placeholder:text-[#9AA0A6] focus:border-[#0B57D0] focus:outline-none focus:ring-1 focus:ring-[#0B57D0]"
                                            inputMode="decimal"
                                            value={manualAmount}
                                            onChange={(e) => setManualAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                                            placeholder="0.00"
                                            aria-label="Amount in kwacha"
                                            autoFocus
                                        />
                                    </div>
                                </div>
                            )}

                            {stage === 2 && (
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-baseline justify-between">
                                        <h2 className="text-lg font-bold text-[#1F1F1F]">Item list</h2>
                                        <span className="text-lg font-bold text-[#1F1F1F]">{formatKwacha(total)}</span>
                                    </div>
                                    {lineItems.map((item, idx) => (
                                        <div key={item.id} className="rounded-2xl border border-[rgba(116,119,117,0.22)] p-4">
                                            <div className="flex items-center gap-3">
                                                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#E9EEF6] text-xs font-bold text-[#5F6368]">{idx + 1}</span>
                                                <input
                                                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-[#1F1F1F] placeholder:text-[#80868B] focus:outline-none focus:ring-0"
                                                    value={item.description}
                                                    onChange={(e) => updateItem(item.id, { description: e.target.value })}
                                                    placeholder="Item description"
                                                />
                                                <span className="text-sm font-semibold text-[#1F1F1F]">{item.estimated_amount > 0 ? formatKwacha(item.estimated_amount) : '-'}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setLineItems((prev) => (prev.length === 1 ? [blankItem()] : prev.filter((i) => i.id !== item.id)))}
                                                    aria-label="Remove item"
                                                    className="text-[#9AA0A6] hover:text-[#EA4335]"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between gap-3">
                                                <div className="flex h-10 flex-1 items-center rounded-xl border border-[rgba(116,119,117,0.22)] px-3">
                                                    <span className="mr-1 text-sm text-[#80868B]">K</span>
                                                    <input
                                                        className="w-full border-0 bg-transparent p-0 text-sm focus:outline-none focus:ring-0"
                                                        inputMode="decimal"
                                                        value={item.unit_price ? String(item.unit_price) : ''}
                                                        onChange={(e) => updateItem(item.id, { unit_price: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })}
                                                        placeholder="0.00"
                                                        aria-label="Price"
                                                    />
                                                </div>
                                                <div className="flex h-10 items-center rounded-xl border border-[rgba(116,119,117,0.22)]">
                                                    <button type="button" aria-label="Fewer" onClick={() => updateItem(item.id, { quantity: Math.max(1, item.quantity - 1) })} className="flex h-10 w-9 items-center justify-center text-[#5F6368] hover:text-[#1F1F1F]"><Minus size={14} /></button>
                                                    <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                                                    <button type="button" aria-label="More" onClick={() => updateItem(item.id, { quantity: item.quantity + 1 })} className="flex h-10 w-9 items-center justify-center text-[#5F6368] hover:text-[#1F1F1F]"><Plus size={14} /></button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <button type="button" onClick={() => setLineItems((prev) => [...prev, blankItem()])} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-dashed border-[#C4C7C5] text-sm text-[#5F6368] hover:border-[#0B57D0]/50 hover:text-[#0B57D0]">
                                        <Plus size={16} /> Add another item
                                    </button>
                                </div>
                            )}

                            {stage === 3 && (
                                <div className="flex flex-col gap-5">
                                    <h2 className="text-lg font-bold text-[#1F1F1F]">Who are you paying?</h2>
                                    {favorites.length > 0 && (
                                        <div>
                                            <div className="mb-2 flex items-center justify-between">
                                                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#5F6368]">
                                                    <Star size={12} className="fill-[#FBBC04] text-[#FBBC04]" /> Favourites
                                                </p>
                                                <p className="text-[11px] text-[#80868B]">Tap to fill in the details</p>
                                            </div>
                                            <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 pt-1">
                                                {favorites.map((f) => {
                                                    const active = (f.method === 'moneywise' && recipient?.id === f.recipient?.id)
                                                        || (f.method === 'mobile' && method === 'mobile' && phone === f.phone)
                                                        || (f.method === 'bank' && method === 'bank' && accountNumber === f.accountNumber && bankId === f.bankId);
                                                    const MethodIcon = f.method === 'mobile' ? Smartphone : f.method === 'bank' ? Building2 : ShieldCheck;
                                                    const methodTone = f.method === 'mobile' ? 'bg-[#FBBC04]' : f.method === 'bank' ? 'bg-slate-600' : 'bg-[#34A853]';
                                                    return (
                                                        <div key={f.id} className="group relative flex-shrink-0">
                                                            <button
                                                                type="button"
                                                                onClick={() => applyFavorite(f)}
                                                                title={`${f.name} · ${f.subtitle}`}
                                                                aria-pressed={active}
                                                                className={`flex w-[208px] items-center gap-3 rounded-2xl border p-3 pr-4 text-left transition ${active
                                                                    ? 'border-[#0B57D0] bg-[#E8F0FE] shadow-[0_0_0_3px_rgba(11,87,208,0.12)]'
                                                                    : 'border-[rgba(116,119,117,0.22)] bg-white hover:border-[#0B57D0]/40 hover:shadow-sm'}`}
                                                            >
                                                                <span className="relative flex-shrink-0">
                                                                    <RecipientAvatar name={f.name} logoUrl={f.logoUrl} size={44} />
                                                                    <span className={`absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-white text-white ${methodTone}`}>
                                                                        <MethodIcon size={9} strokeWidth={2.5} />
                                                                    </span>
                                                                </span>
                                                                <span className="min-w-0 flex-1">
                                                                    <span className="block truncate text-sm font-semibold text-[#1F1F1F]">{f.name}</span>
                                                                    <span className="mt-0.5 block truncate text-xs text-[#5F6368]">{f.subtitle}</span>
                                                                </span>
                                                                {active && (
                                                                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#0B57D0] text-white">
                                                                        <Check size={12} strokeWidth={3} />
                                                                    </span>
                                                                )}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => removeFavorite(f.id)}
                                                                aria-label={`Remove ${f.name} from favourites`}
                                                                title="Remove from favourites"
                                                                className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-white shadow group-hover:flex"
                                                            >
                                                                <X size={11} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex rounded-full p-[3px] shadow-[inset_0_0_0_1px_#C4C7C5]">
                                        {([['moneywise', 'MoneyWise'], ['mobile', 'Mobile Money'], ['bank', 'Bank Account']] as [Method, string][]).map(([value, label]) => (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => switchMethod(value)}
                                                className={`flex-1 rounded-full py-2.5 text-[13px] transition ${method === value ? 'bg-[#D3E3FD] font-bold text-[#041E49]' : 'font-medium text-[#5F6368] hover:bg-[#F8FAFD]'}`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>

                                    {method === 'moneywise' && (recipient ? (
                                        <div className="rounded-2xl border border-[#CEEAD6] bg-[#E6F4EA]/40 p-4">
                                            <div className="flex items-center justify-between">
                                                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#CEEAD6] px-2.5 py-1 text-[11px] font-bold text-[#137333]"><ShieldCheck size={13} /> Verified MoneyWise account</span>
                                                <div className="flex items-center gap-3">
                                                    {currentFav && (
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleFavorite(currentFav)}
                                                            aria-pressed={isFavorite(currentFav.id)}
                                                            className="inline-flex items-center gap-1 text-sm font-semibold text-[#5F6368] hover:text-[#E37400]"
                                                        >
                                                            <Star size={15} className={isFavorite(currentFav.id) ? 'fill-[#FBBC04] text-[#FBBC04]' : ''} />
                                                            {isFavorite(currentFav.id) ? 'Favourite' : 'Add to favourites'}
                                                        </button>
                                                    )}
                                                    <button type="button" onClick={() => { setRecipient(null); setResolvedName(''); setMwQuery(''); }} className="text-sm font-semibold text-[#0B57D0] hover:underline">Change</button>
                                                </div>
                                            </div>
                                            <div className="mt-3 flex items-center gap-3">
                                                <RecipientAvatar name={recipient.name} logoUrl={recipient.logo_url} size={48} />
                                                <div className="min-w-0">
                                                    <p className="truncate text-base font-bold text-[#1F1F1F]">{recipient.name}</p>
                                                    <p className="truncate text-sm text-[#5F6368]">{recipient.username ? `@${recipient.username}` : (recipient.email || recipient.moneywise_id)}</p>
                                                </div>
                                            </div>
                                            <p className="mt-3 border-t border-[#CEEAD6] pt-3 text-xs text-[#137333]">Instant wallet-to-wallet transfer · Zero platform fee</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-3">
                                            <div>
                                                <label className={labelClass} htmlFor="ps-search">Search recipient</label>
                                                <div className="relative">
                                                    <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#80868B]" />
                                                    <input
                                                        id="ps-search"
                                                        className={`${fieldClass} pl-11 pr-11`}
                                                        value={mwQuery}
                                                        onChange={(e) => setMwQuery(e.target.value)}
                                                        placeholder="Email, @username, phone, or MW-ID"
                                                        autoComplete="off"
                                                        autoFocus
                                                    />
                                                    {searchingMw ? (
                                                        <Loader2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-[#0B57D0]" />
                                                    ) : mwQuery ? (
                                                        <button type="button" onClick={() => setMwQuery('')} aria-label="Clear" className="absolute right-4 top-1/2 -translate-y-1/2 text-[#80868B] hover:text-[#1F1F1F]"><X size={16} /></button>
                                                    ) : null}
                                                </div>
                                            </div>
                                            {mwSuggestions.length > 0 ? (
                                                <div className="overflow-hidden rounded-2xl border border-[rgba(116,119,117,0.22)]">
                                                    <p className="bg-[#F8FAFD] px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-[#80868B]">Matches on MoneyWise</p>
                                                    {mwSuggestions.map((r) => (
                                                        <button
                                                            key={r.id}
                                                            type="button"
                                                            onClick={() => { setRecipient(r); setResolvedName(r.name); setMwSuggestions([]); }}
                                                            className="flex w-full items-center gap-3 border-t border-[rgba(116,119,117,0.14)] px-4 py-3 text-left hover:bg-[#F8FAFD]"
                                                        >
                                                            <RecipientAvatar name={r.name} logoUrl={r.logo_url} size={38} />
                                                            <span className="min-w-0 flex-1">
                                                                <span className="flex items-center justify-between gap-2">
                                                                    <span className="truncate text-sm font-semibold text-[#1F1F1F]">{r.name}</span>
                                                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.account_type === 'PERSONAL' ? 'bg-[#E8F0FE] text-[#0B57D0]' : 'bg-[#E6F4EA] text-[#137333]'}`}>
                                                                        {r.account_type === 'PERSONAL' ? 'Personal' : 'Business'}
                                                                    </span>
                                                                </span>
                                                                <span className="block truncate text-xs text-[#5F6368]">{r.username ? `@${r.username}` : (r.email || r.phone)} · {r.organization_name}</span>
                                                            </span>
                                                            <ArrowRight size={16} className="text-[#9AA0A6]" />
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : mwQuery.trim().length >= 2 && !searchingMw ? (
                                                <p className="flex items-center gap-2 rounded-2xl bg-[#F8FAFD] p-4 text-sm text-[#5F6368]"><AlertCircle size={16} /> No MoneyWise account found matching “{mwQuery}”</p>
                                            ) : null}
                                        </div>
                                    ))}

                                    {method === 'mobile' && (
                                        <div>
                                            <label className={labelClass} htmlFor="ps-phone">Mobile money number</label>
                                            <div className="relative">
                                                <Smartphone size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#80868B]" />
                                                <input id="ps-phone" className={`${fieldClass} pl-11 ${momoOperator ? 'pr-24' : ''}`} inputMode="tel" value={phoneText} onChange={(e) => setPhoneText(e.target.value)} placeholder="e.g. 0971 234 567" autoFocus />
                                                {momoOperator && (
                                                    <span className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-[#E9EEF6] px-2.5 py-1 text-[11px] font-bold ${momoOperator === 'AIRTEL' ? 'text-[#EA4335]' : momoOperator === 'MTN' ? 'text-[#E37400]' : 'text-[#1E8E3E]'}`}>
                                                        {momoOperator}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-1.5 text-xs text-[#80868B]">We check the number first so you can see the account holder’s name.</p>
                                        </div>
                                    )}

                                    {method === 'bank' && (
                                        <div className="flex flex-col gap-4">
                                            <div>
                                                <label className={labelClass}>Bank</label>
                                                <BankSelect banks={banks} value={bankId} onChange={setBankId} className={`${fieldClass} flex items-center justify-between`} placeholder="Select bank" />
                                            </div>
                                            <div>
                                                <label className={labelClass} htmlFor="ps-acct">Account number</label>
                                                <div className="relative">
                                                    <Building2 size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#80868B]" />
                                                    <input id="ps-acct" className={`${fieldClass} pl-11`} inputMode="numeric" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Account number" />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {method !== 'moneywise' && (confirmingName || resolvedName) && (
                                        <div className={`flex items-center gap-2 rounded-2xl p-4 text-sm ${resolvedName && resolvedName !== 'Name not confirmed' && !confirmingName ? 'bg-[#E6F4EA] text-[#137333]' : 'bg-[#F8FAFD] text-[#5F6368]'}`}>
                                            {confirmingName ? <><Loader2 size={14} className="animate-spin" /> Checking the account…</>
                                                : resolvedName === 'Name not confirmed' || /^Session|^Can’t/.test(resolvedName)
                                                    ? <><AlertCircle size={14} /> {resolvedName}</>
                                                    : <><CheckCircle size={14} /> <span className="font-semibold">{resolvedName}</span></>}
                                            {currentFav && (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleFavorite(currentFav)}
                                                    aria-pressed={isFavorite(currentFav.id)}
                                                    className="ml-auto inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#3C4043] shadow-sm hover:text-[#E37400]"
                                                >
                                                    <Star size={13} className={isFavorite(currentFav.id) ? 'fill-[#FBBC04] text-[#FBBC04]' : ''} />
                                                    {isFavorite(currentFav.id) ? 'Favourite' : 'Add to favourites'}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {stage === 4 && (
                                <div className="flex flex-col gap-5">
                                    <h2 className="text-lg font-bold text-[#1F1F1F]">Transaction summary</h2>
                                    <div className="rounded-2xl bg-[#F8FAFD] p-5 text-center">
                                        <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#5F6368]"><Mail size={14} /> Total amount</p>
                                        <p className="mt-1 text-4xl font-bold text-[#1F1F1F]">{formatKwacha(total)}</p>
                                        <p className="mt-1 text-sm text-[#5F6368]">{description}</p>
                                    </div>
                                    <dl className="divide-y divide-[rgba(116,119,117,0.14)] rounded-2xl border border-[rgba(116,119,117,0.22)] px-4">
                                        <div className="flex justify-between py-3 text-sm"><dt className="text-[#5F6368]">Payment method</dt><dd className="font-semibold text-[#1F1F1F]">{methodLabel}</dd></div>
                                        {method === 'moneywise' && recipient ? (
                                            <>
                                                <div className="flex justify-between py-3 text-sm"><dt className="text-[#5F6368]">Recipient</dt><dd className="font-semibold text-[#1F1F1F]">{recipient.name}</dd></div>
                                                <div className="flex justify-between py-3 text-sm"><dt className="text-[#5F6368]">Account</dt><dd className="font-semibold text-[#1F1F1F]">{recipient.username ? `@${recipient.username}` : (recipient.email || recipient.moneywise_id)}</dd></div>
                                                <div className="flex justify-between py-3 text-sm"><dt className="text-[#5F6368]">Destination workspace</dt><dd className="font-semibold text-[#1F1F1F]">{recipient.organization_name}</dd></div>
                                                <div className="flex justify-between py-3 text-sm"><dt className="text-[#5F6368]">Transfer fee</dt><dd className="font-semibold text-[#1E8E3E]">K0.00 (instant free transfer)</dd></div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="flex justify-between py-3 text-sm"><dt className="text-[#5F6368]">Account number</dt><dd className="font-semibold text-[#1F1F1F]">{method === 'mobile' ? phone : accountNumber}</dd></div>
                                                <div className="flex justify-between py-3 text-sm"><dt className="text-[#5F6368]">Account name</dt><dd className="font-semibold text-[#1F1F1F]">{resolvedName}</dd></div>
                                            </>
                                        )}
                                    </dl>
                                    {makeList && (
                                        <dl className="divide-y divide-[rgba(116,119,117,0.14)] rounded-2xl border border-[rgba(116,119,117,0.22)] px-4">
                                            {lineItems.filter((i) => i.description).map((i) => (
                                                <div key={i.id} className="flex justify-between py-3 text-sm"><dt className="text-[#3C4043]">{i.description}</dt><dd className="font-semibold text-[#1F1F1F]">{formatKwacha(i.estimated_amount)}</dd></div>
                                            ))}
                                            <div className="flex justify-between py-3 text-sm font-bold"><dt>Total</dt><dd>{formatKwacha(total)}</dd></div>
                                        </dl>
                                    )}
                                    {wallets.length > 1 && (
                                        <div>
                                            <label className={labelClass}>Send from wallet</label>
                                            <WalletSelect
                                                wallets={wallets}
                                                value={walletId}
                                                onChange={setWalletId}
                                                placeholder="Select wallet"
                                                triggerClassName="w-full h-12 rounded-xl border border-[rgba(116,119,117,0.22)] bg-white px-4 text-sm flex items-center justify-between"
                                            />
                                            {walletBalance !== null && <p className="mt-1.5 text-xs text-[#80868B]">{formatKwacha(walletBalance)} available</p>}
                                        </div>
                                    )}
                                    {insufficient && (
                                        <div className="flex items-start gap-3 rounded-2xl border border-[#FAD2CF] bg-[#FCE8E6] p-4" role="alert">
                                            <AlertCircle size={20} className="mt-0.5 flex-shrink-0 text-[#EA4335]" />
                                            <div className="flex-1">
                                                <p className="text-sm font-bold text-[#B31412]">Insufficient funds</p>
                                                <p className="mt-0.5 text-xs text-[#B31412]/80">
                                                    {walletBalance && walletBalance > 0
                                                        ? `Your wallet has ${formatKwacha(walletBalance)} but this needs ${formatKwacha(total)}. Add ${formatKwacha(total - walletBalance)} to continue`
                                                        : `Your wallet is empty and this needs ${formatKwacha(total)}. Add money to continue`}
                                                    {wallets.length > 1 ? ', or send from another wallet.' : '.'}
                                                </p>
                                                <button type="button" onClick={() => navigate('/cashbook')} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#D93025] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B31412]">
                                                    <ArrowDownToLine size={14} /> Add money
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="mt-8 flex items-center justify-between">
                                <button type="button" onClick={back} disabled={submitting} aria-label="Back" className="flex h-12 w-12 items-center justify-center rounded-full border border-[rgba(116,119,117,0.22)] text-[#0B57D0] hover:bg-[#F8FAFD] disabled:opacity-40">
                                    <ArrowLeft size={20} />
                                </button>
                                {stage !== 4 ? (
                                    <button type="button" onClick={proceed} aria-label="Next" className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0B57D0] text-white hover:bg-[#0842A0]">
                                        <ArrowRight size={20} />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={submit}
                                        disabled={submitting || insufficient}
                                        className="flex h-12 items-center gap-2 rounded-full bg-[#0B57D0] px-7 text-sm font-semibold text-white hover:bg-[#0842A0] disabled:opacity-50"
                                    >
                                        {submitting ? <><Loader2 size={16} className="animate-spin" /> Sending…</> : <>Send {formatKwacha(total)}</>}
                                    </button>
                                )}
                            </div>
                            <p className="mt-6 text-center text-xs text-[#80868B]">Signed in as {userName ?? 'you'}</p>
                        </>
                    )}
                </div>
            </div>

            {sent && (
                <SentPopup
                    requisitionId={sent.requisitionId}
                    amount={sent.amount}
                    recipient={sent.recipient}
                    onClose={() => { setSent(null); navigate('/'); }}
                />
            )}
        </Layout>
    );
};

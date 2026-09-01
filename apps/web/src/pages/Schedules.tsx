import React, { useState, useMemo, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import {
    Plus, MoreVertical, Calendar, RotateCcw, FileText,
    ChevronLeft, ChevronRight, Receipt, CreditCard, TrendingUp,
    Landmark, Wallet, X, Check, Loader2, AlertCircle, Play, ArrowRight,
    Mail, Send,
} from 'lucide-react';
import {
    scheduleService,
    ScheduledItem,
    ScheduledItemRun,
    ScheduleCategory,
    ScheduleCadence,
    CreateScheduledItemPayload,
} from '../services/schedule.service';
import { SegmentedControl, AnimatedTabContent } from '../components/AnimatedTabs';
import { lencoService } from '../services/lenco.service';
import { useAuth } from '../context/AuthContext';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday } from 'date-fns';
import { formatKwacha } from 'core';
import { SCHEDULE_CATEGORIES, SCHEDULE_CADENCES } from 'core';

// ── Constants ─────────────────────────────────────────────────────────────────

// Labels live in `core` (reference/schedules.ts) so the phone's category picker
// can't drift from this one in wording or order. Icons are a web-only concern,
// mapped onto the shared value list here.
const CATEGORY_ICONS: Record<ScheduleCategory, React.ElementType> = {
    BILLS: Receipt,
    SUBSCRIPTIONS: CreditCard,
    INVESTMENTS: TrendingUp,
    LOAN_REPAYMENTS: Landmark,
    GENERAL_EXPENSES: Wallet,
};
const CATEGORIES = SCHEDULE_CATEGORIES.map(c => ({ ...c, icon: CATEGORY_ICONS[c.value] }));
const CADENCES = SCHEDULE_CADENCES;

const CATEGORY_COLORS: Record<string, string> = {
    BILLS:            'bg-orange-100 text-orange-700',
    SUBSCRIPTIONS:    'bg-purple-100 text-purple-700',
    INVESTMENTS:      'bg-emerald-100 text-emerald-700',
    LOAN_REPAYMENTS:  'bg-rose-100 text-rose-700',
    GENERAL_EXPENSES: 'bg-blue-100 text-blue-700',
};

// ── Zambian phone prefix → operator detection ─────────────────────────────────

function detectOperator(phone: string): 'MTN' | 'Airtel' | 'Zamtel' | '' {
    const digits = phone.replace(/\D/g, '');
    // Normalise: strip leading country code +260 / 260 / 26
    const local = digits.startsWith('260') ? digits.slice(3)
        : digits.startsWith('26') ? digits.slice(2)
        : digits;
    const prefix3 = local.slice(0, 3);
    if (['096', '076'].includes(prefix3)) return 'MTN';
    if (['097', '077'].includes(prefix3)) return 'Airtel';
    if (['095', '075'].includes(prefix3)) return 'Zamtel';
    return '';
}

function operatorBadge(op: string) {
    if (op === 'MTN')    return <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">MTN</span>;
    if (op === 'Airtel') return <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Airtel</span>;
    if (op === 'Zamtel') return <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Zamtel</span>;
    return null;
}

function isPhoneComplete(phone: string): boolean {
    const digits = phone.replace(/\D/g, '');
    const local = digits.startsWith('260') ? digits.slice(3)
        : digits.startsWith('26') ? digits.slice(2)
        : digits;
    return local.length >= 9;
}

function categoryLabel(cat: string) { return CATEGORIES.find(c => c.value === cat)?.label ?? cat; }
function cadenceLabel(cad: string)  { return CADENCES.find(c => c.value === cad)?.label ?? cad; }
const formatCurrency = formatKwacha;
function formatDueDate(dateStr: string) {
    try {
        const d = parseISO(dateStr);
        const day = d.getDate();
        const suffix = [11,12,13].includes(day) ? 'th'
            : day % 10 === 1 ? 'st' : day % 10 === 2 ? 'nd' : day % 10 === 3 ? 'rd' : 'th';
        return `${day}${suffix} ${format(d, 'MMMM')}`;
    } catch { return dateStr; }
}

// ── Payment verify state ──────────────────────────────────────────────────────

interface PaymentVerifyState {
    status: 'idle' | 'pending' | 'verified' | 'failed';
    resolvedName?: string;
    error?: string;
}

// ── Payment Section (auto-detect + auto-verify) ───────────────────────────────

interface PaymentSectionProps {
    paymentMethod: string;
    setPaymentMethod: (v: string) => void;
    recipientAccount: string;
    setRecipientAccount: (v: string) => void;
    recipientBankCode: string;
    setRecipientBankCode: (v: string) => void;
    recipientName: string;
    setRecipientName: (v: string) => void;
    banks: any[];
    verify: PaymentVerifyState;
    setVerify: (v: PaymentVerifyState) => void;
    orgId: string;
}

const PaymentSection: React.FC<PaymentSectionProps> = ({
    paymentMethod, setPaymentMethod,
    recipientAccount, setRecipientAccount,
    recipientBankCode, setRecipientBankCode,
    recipientName, setRecipientName,
    banks, verify, setVerify, orgId,
}) => {
    const verifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Detect operator from phone prefix (mobile money only)
    const detectedOp = paymentMethod === 'MOBILE_MONEY' ? detectOperator(recipientAccount) : '';

    // Auto-sync detected operator into recipientBankCode
    useEffect(() => {
        if (paymentMethod !== 'MOBILE_MONEY') return;
        if (detectedOp && detectedOp !== recipientBankCode) {
            setRecipientBankCode(detectedOp);
        }
    }, [detectedOp, paymentMethod]); // eslint-disable-line

    // Auto-verify mobile money when phone complete + operator known
    useEffect(() => {
        if (paymentMethod !== 'MOBILE_MONEY') return;
        if (verifyTimer.current) clearTimeout(verifyTimer.current);

        // Reset on new input
        if (verify.status === 'verified' || verify.status === 'failed') {
            setVerify({ status: 'idle' });
        }

        if (!isPhoneComplete(recipientAccount) || !detectedOp) return;

        verifyTimer.current = setTimeout(async () => {
            setVerify({ status: 'pending' });
            try {
                const res = await lencoService.resolveMobileMoney(recipientAccount, detectedOp.toUpperCase(), orgId);
                const name = res.accountName || res.account_name || res.name || '';
                setRecipientName(name);
                setVerify({ status: 'verified', resolvedName: name });
            } catch (err: any) {
                setVerify({ status: 'failed', error: err.message || 'Could not verify number' });
            }
        }, 600);

        return () => { if (verifyTimer.current) clearTimeout(verifyTimer.current); };
    }, [recipientAccount, paymentMethod]); // eslint-disable-line

    // Auto-verify bank when account number + bank both set
    useEffect(() => {
        if (paymentMethod !== 'BANK_TRANSFER') return;
        if (verifyTimer.current) clearTimeout(verifyTimer.current);

        if (verify.status === 'verified' || verify.status === 'failed') {
            setVerify({ status: 'idle' });
        }

        if (!recipientAccount.trim() || !recipientBankCode) return;

        verifyTimer.current = setTimeout(async () => {
            setVerify({ status: 'pending' });
            try {
                const res = await lencoService.resolveBankAccount(recipientAccount, recipientBankCode, orgId);
                const name = res.accountName || res.account_name || res.name || '';
                setRecipientName(name);
                setVerify({ status: 'verified', resolvedName: name });
            } catch (err: any) {
                setVerify({ status: 'failed', error: err.message || 'Could not verify account' });
            }
        }, 600);

        return () => { if (verifyTimer.current) clearTimeout(verifyTimer.current); };
    }, [recipientAccount, recipientBankCode, paymentMethod]); // eslint-disable-line

    const switchMethod = (m: string) => {
        setPaymentMethod(m);
        setRecipientAccount('');
        setRecipientBankCode('');
        setRecipientName('');
        setVerify({ status: 'idle' });
        if (verifyTimer.current) clearTimeout(verifyTimer.current);
    };

    return (
        <div className="space-y-3 pt-1 border-t border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pt-1">Payment Recipient</p>

            {/* Method toggle */}
            <div className="flex gap-2">
                {['MOBILE_MONEY', 'BANK_TRANSFER'].map(m => (
                    <button key={m} type="button" onClick={() => switchMethod(m)}
                        className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg border transition-all ${
                            paymentMethod === m
                                ? 'bg-[#0058DB] text-white border-[#0058DB]'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                        }`}>
                        {m === 'MOBILE_MONEY' ? 'Mobile Money' : 'Bank Transfer'}
                    </button>
                ))}
            </div>

            {paymentMethod === 'MOBILE_MONEY' ? (
                <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Phone Number</label>
                    <div className="relative">
                        <input
                            type="tel"
                            value={recipientAccount}
                            onChange={e => setRecipientAccount(e.target.value)}
                            placeholder="0971234567"
                            className={`w-full px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 transition pr-28 ${
                                verify.status === 'verified' ? 'border-emerald-300 bg-emerald-50/30 focus:ring-emerald-400/20 focus:border-emerald-400'
                                : verify.status === 'failed'   ? 'border-red-300 focus:ring-red-400/20 focus:border-red-400'
                                : 'border-gray-200 focus:ring-blue-500/20 focus:border-blue-400'
                            }`}
                        />
                        {/* Badge + spinner inside the input */}
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                            {detectedOp && operatorBadge(detectedOp)}
                            {verify.status === 'pending'  && <Loader2 size={13} className="animate-spin text-blue-500" />}
                            {verify.status === 'verified' && <Check size={13} className="text-emerald-600" />}
                        </div>
                    </div>
                    {!detectedOp && recipientAccount.length > 2 && (
                        <p className="text-[10px] text-gray-400 mt-1">Enter a Zambian number starting with 096 / 097 / 095 / 076 / 077 / 075</p>
                    )}
                </div>
            ) : (
                <div className="space-y-2">
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Bank</label>
                        <select
                            value={recipientBankCode}
                            onChange={e => setRecipientBankCode(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition bg-white"
                        >
                            <option value="">Select bank…</option>
                            {banks.map((b: any) => (
                                <option key={b.id || b.code} value={b.id || b.code}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Account Number</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={recipientAccount}
                                onChange={e => setRecipientAccount(e.target.value)}
                                placeholder="1234567890"
                                className={`w-full px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 transition pr-10 ${
                                    verify.status === 'verified' ? 'border-emerald-300 bg-emerald-50/30 focus:ring-emerald-400/20 focus:border-emerald-400'
                                    : verify.status === 'failed' ? 'border-red-300 focus:ring-red-400/20 focus:border-red-400'
                                    : 'border-gray-200 focus:ring-blue-500/20 focus:border-blue-400'
                                }`}
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                                {verify.status === 'pending'  && <Loader2 size={13} className="animate-spin text-blue-500" />}
                                {verify.status === 'verified' && <Check size={13} className="text-emerald-600" />}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Result banners */}
            {verify.status === 'pending' && (
                <p className="text-[11px] text-blue-600 flex items-center gap-1.5">
                    <Loader2 size={11} className="animate-spin" /> Verifying account…
                </p>
            )}
            {verify.status === 'verified' && (
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-xl border border-emerald-200">
                    <Check size={13} className="text-emerald-600 flex-shrink-0" />
                    <input
                        type="text"
                        value={recipientName}
                        onChange={e => setRecipientName(e.target.value)}
                        className="flex-1 text-xs font-semibold text-emerald-800 bg-transparent focus:outline-none"
                        placeholder="Account holder name"
                    />
                </div>
            )}
            {verify.status === 'failed' && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-xl border border-red-200">
                    <AlertCircle size={13} className="text-red-500 flex-shrink-0" />
                    <p className="text-xs text-red-600">{verify.error || 'Verification failed — check the details and try again'}</p>
                </div>
            )}
        </div>
    );
};

// ── Add / Edit Modal ──────────────────────────────────────────────────────────

interface ScheduleModalProps {
    initial?: ScheduledItem | null;
    onClose: () => void;
    onSave: (payload: CreateScheduledItemPayload) => Promise<void>;
    saving: boolean;
}

const ScheduleModal: React.FC<ScheduleModalProps> = ({ initial, onClose, onSave, saving }) => {
    const { user } = useAuth();
    const orgId = (user as any)?.organization_id ?? '';
    const today = format(new Date(), 'yyyy-MM-dd');

    const [title, setTitle]           = useState(initial?.title ?? '');
    const [amount, setAmount]         = useState<number>(initial?.amount ?? 0);
    const [category, setCategory]     = useState<ScheduleCategory>(initial?.category ?? 'BILLS');
    const [cadence, setCadence]       = useState<ScheduleCadence>(initial?.cadence ?? 'MONTHLY');
    const [nextDueDate, setNextDueDate] = useState(initial?.next_due_date ?? today);
    const [description, setDescription] = useState(initial?.description ?? '');

    const [paymentMethod, setPaymentMethod]       = useState((initial as any)?.payment_method ?? 'MOBILE_MONEY');
    const [recipientAccount, setRecipientAccount] = useState((initial as any)?.recipient_account ?? '');
    const [recipientBankCode, setRecipientBankCode] = useState((initial as any)?.recipient_bank_code ?? '');
    const [recipientName, setRecipientName]       = useState((initial as any)?.recipient_name ?? '');
    const [banks, setBanks]   = useState<any[]>([]);
    const [verify, setVerify] = useState<PaymentVerifyState>({ status: 'idle' });

    // Proof-of-Payment auto-send
    const [popEnabled, setPopEnabled] = useState<boolean>((initial as any)?.pop_enabled ?? false);
    const [popEmail, setPopEmail]     = useState<string>((initial as any)?.pop_email ?? '');

    const [error, setError]   = useState('');

    useEffect(() => {
        lencoService.getBanks()
            .then((data: any) => setBanks(Array.isArray(data) ? data : data?.data ?? []))
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (initial && (initial as any).recipient_name) {
            setVerify({ status: 'verified', resolvedName: (initial as any).recipient_name });
        }
    }, [initial]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!title.trim()) return setError('Title is required.');
        if (!amount || amount <= 0) return setError('Amount must be greater than 0.');
        if (popEnabled && !popEmail.trim()) return setError('Enter an email address for the Proof of Payment.');
        if (popEnabled && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(popEmail.trim())) return setError('Enter a valid email address for the Proof of Payment.');
        try {
            await onSave({
                title, amount, category, cadence,
                next_due_date: nextDueDate,
                description: description || undefined,
                ...(recipientName ? {
                    payment_method: paymentMethod,
                    recipient_account: recipientAccount,
                    recipient_bank_code: recipientBankCode,
                    recipient_name: recipientName,
                } as any : {}),
                pop_enabled: popEnabled,
                pop_method: popEnabled ? 'EMAIL' : null,
                pop_email: popEnabled ? popEmail.trim() : null,
            });
        } catch (err: any) {
            setError(err.message ?? 'Something went wrong.');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
                    <h2 className="text-sm font-bold text-gray-900">
                        {initial ? 'Edit Schedule' : 'Add to Schedule'}
                    </h2>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
                    <div className="px-6 py-5 space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Title</label>
                            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                                placeholder="e.g. Director's Monthly Rental"
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Amount (K)</label>
                            <input type="number" min="0" step="0.01" value={amount || ''} onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                                placeholder="0.00"
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Category</label>
                            <select value={category} onChange={e => setCategory(e.target.value as ScheduleCategory)}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition bg-white">
                                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Frequency</label>
                                <select value={cadence} onChange={e => setCadence(e.target.value as ScheduleCadence)}
                                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition bg-white">
                                    {CADENCES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Next Due Date</label>
                                <input type="date" value={nextDueDate} onChange={e => setNextDueDate(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes (optional)</label>
                            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                                placeholder="Any additional details…"
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition resize-none" />
                        </div>

                        <PaymentSection
                            paymentMethod={paymentMethod}       setPaymentMethod={setPaymentMethod}
                            recipientAccount={recipientAccount} setRecipientAccount={setRecipientAccount}
                            recipientBankCode={recipientBankCode} setRecipientBankCode={setRecipientBankCode}
                            recipientName={recipientName}       setRecipientName={setRecipientName}
                            banks={banks} verify={verify} setVerify={setVerify} orgId={orgId}
                        />

                        {/* ── Proof of Payment auto-send ───────────────────── */}
                        <div className="pt-1 border-t border-gray-100 space-y-3">
                            <div className="flex items-center justify-between pt-1">
                                <div className="flex-1 min-w-0 pr-3">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Proof of Payment</p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Automatically email a proof of transfer each time this schedule runs.
                                    </p>
                                </div>
                                {/* iOS-style toggle */}
                                <button
                                    type="button"
                                    onClick={() => setPopEnabled(v => !v)}
                                    className={`relative flex-shrink-0 w-10 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 ${
                                        popEnabled ? 'bg-[#0058DB]' : 'bg-gray-300'
                                    }`}
                                    aria-pressed={popEnabled}
                                    aria-label="Send proof of payment"
                                >
                                    <span
                                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                                            popEnabled ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>

                            {popEnabled && (
                                <div className="space-y-2">
                                    {/* Method — email only for now */}
                                    <div>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Delivery Method</p>
                                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0058DB]/10 border border-[#0058DB]/20">
                                            <Mail size={12} className="text-[#0058DB]" />
                                            <span className="text-xs font-semibold text-[#0058DB]">Email</span>
                                        </div>
                                    </div>

                                    {/* Email address */}
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-600 mb-1">
                                            Recipient Email
                                        </label>
                                        <div className="relative">
                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                                <Send size={12} className="text-gray-400" />
                                            </div>
                                            <input
                                                type="email"
                                                value={popEmail}
                                                onChange={e => setPopEmail(e.target.value)}
                                                placeholder="e.g. supplier@example.com"
                                                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
                                            />
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-1">
                                            The proof of transfer PDF will be emailed here every time a payment executes.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">
                                <AlertCircle size={13} /> {error}
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-2 px-6 pb-5">
                        <button type="button" onClick={onClose}
                            className="px-4 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 rounded-xl transition">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving}
                            className="h-8 pl-4 pr-3 bg-[#0058DB] rounded-lg flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60">
                            {saving && <Loader2 size={12} className="animate-spin text-white" />}
                            <span className="text-white text-xs font-bold">
                                {initial ? 'Save Changes' : 'Add to Schedule'}
                            </span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ── Detail Panel ──────────────────────────────────────────────────────────────

interface DetailPanelProps {
    item: ScheduledItem;
    onClose: () => void;
    onEdit: () => void;
    onRunNow: () => void;
    running: boolean;
}

const DetailPanel: React.FC<DetailPanelProps> = ({ item, onClose, onEdit, onRunNow, running }) => {
    const navigate = useNavigate();
    const { data: runs = [], isLoading } = useQuery<ScheduledItemRun[]>({
        queryKey: ['schedule-runs', item.id],
        queryFn: () => scheduleService.getRuns(item.id),
    });
    const upcoming = runs.find(r => r.status === 'UPCOMING');
    const history  = runs.filter(r => r.status !== 'UPCOMING');

    const runCfg: Record<string, { label: string; cls: string }> = {
        UPCOMING:   { label: 'Upcoming',   cls: 'bg-blue-100 text-blue-700' },
        PROCESSING: { label: 'Processing', cls: 'bg-yellow-100 text-yellow-700' },
        COMPLETED:  { label: 'Completed',  cls: 'bg-emerald-100 text-emerald-700' },
        FAILED:     { label: 'Failed',     cls: 'bg-red-100 text-red-700' },
    };

    const payMethod = (item as any).payment_method;
    const rName     = (item as any).recipient_name;
    const rAccount  = (item as any).recipient_account;

    return (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
            <div className="w-full max-w-sm h-full bg-white shadow-2xl flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}>
                <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between flex-shrink-0">
                    <div className="flex-1 min-w-0 pr-3">
                        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mb-2 ${CATEGORY_COLORS[item.category]}`}>
                            {categoryLabel(item.category)}
                        </span>
                        <h2 className="text-sm font-bold text-gray-900 leading-tight">{item.title}</h2>
                        <p className="text-xl font-black text-gray-900 mt-1">{formatCurrency(item.amount)}</p>
                        <div className="flex items-center gap-3 mt-2">
                            <span className="flex items-center gap-1 text-[10px] text-gray-500"><RotateCcw size={10} /> {cadenceLabel(item.cadence)}</span>
                            <span className="flex items-center gap-1 text-[10px] text-gray-500"><Calendar size={10} /> Due {formatDueDate(item.next_due_date)}</span>
                        </div>
                        {rName && (
                            <div className="mt-2 px-2.5 py-1.5 bg-gray-50 rounded-xl text-[10px] text-gray-600">
                                <span className="font-semibold">Recipient:</span> {rName}
                                {rAccount  && <span className="ml-1 text-gray-400">· {rAccount}</span>}
                                {payMethod && <span className="ml-1 text-gray-400">· {payMethod === 'MOBILE_MONEY' ? 'Mobile Money' : 'Bank Transfer'}</span>}
                            </div>
                        )}
                        {(item as any).pop_enabled && (item as any).pop_email && (
                            <div className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 rounded-xl text-[10px] text-[#0058DB]">
                                <Mail size={10} className="flex-shrink-0" />
                                <span className="font-semibold">Proof of Payment →</span>
                                <span className="truncate">{(item as any).pop_email}</span>
                            </div>
                        )}
                        {item.description && <p className="text-xs text-gray-400 mt-2">{item.description}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                        <button type="button" onClick={onEdit}
                            className="px-2 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100 text-xs font-semibold transition">
                            Edit
                        </button>
                        <button type="button" onClick={onClose}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition">
                            <X size={15} />
                        </button>
                    </div>
                </div>

                {upcoming && (
                    <div className="mx-4 mt-4 p-4 bg-white rounded-2xl border border-gray-100 flex-shrink-0">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Next Run</span>
                            <span className="text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">Upcoming</span>
                        </div>
                        <p className="text-sm font-semibold text-gray-900 mb-3">
                            {format(parseISO(upcoming.due_date), 'EEEE, d MMMM yyyy')}
                        </p>
                        <button type="button" onClick={onRunNow} disabled={running}
                            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-[#0058DB] hover:opacity-90 text-white text-xs font-bold rounded-lg transition disabled:opacity-60">
                            {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} fill="white" />}
                            Run Now
                        </button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto px-4 py-4">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Run History</p>
                    {isLoading ? (
                        <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-8 text-xs text-gray-400">No runs yet.</div>
                    ) : (
                        <div className="space-y-2">
                            {history.map(run => {
                                const cfg = runCfg[run.status] ?? { label: run.status, cls: 'bg-gray-100 text-gray-600' };
                                return (
                                    <div key={run.id}
                                        className={`flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-white ${run.requisition_id ? 'cursor-pointer hover:bg-gray-50 transition' : ''}`}
                                        onClick={() => run.requisition_id && navigate(`/requisitions?id=${run.requisition_id}`)}>
                                        <div>
                                            <p className="text-xs font-semibold text-gray-800">
                                                {format(parseISO(run.due_date), 'd MMM yyyy')}
                                            </p>
                                            {run.triggered_at && (
                                                <p className="text-[10px] text-gray-400 mt-0.5">
                                                    Triggered {format(parseISO(run.triggered_at), 'd MMM, h:mm a')}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
                                            {run.requisition_id && <ArrowRight size={12} className="text-gray-400" />}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Calendar View ─────────────────────────────────────────────────────────────

const CalendarView: React.FC<{ items: ScheduledItem[] }> = ({ items }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const days = useMemo(() => eachDayOfInterval({
        start: startOfMonth(currentMonth),
        end:   endOfMonth(currentMonth),
    }), [currentMonth]);
    const itemsByDate = useMemo(() => {
        const map: Record<string, ScheduledItem[]> = {};
        items.forEach(item => {
            if (!map[item.next_due_date]) map[item.next_due_date] = [];
            map[item.next_due_date].push(item);
        });
        return map;
    }, [items]);
    const startDow = getDay(days[0]);

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <button type="button"
                    onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition"><ChevronLeft size={16} /></button>
                <p className="text-sm font-bold text-gray-900">{format(currentMonth, 'MMMM yyyy')}</p>
                <button type="button"
                    onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition"><ChevronRight size={16} /></button>
            </div>
            <div className="grid grid-cols-7 mb-1">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                    <div key={d} className="text-center text-[10px] font-bold text-gray-400 pb-2">{d}</div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-xl overflow-hidden flex-1">
                {Array.from({ length: startDow }).map((_, i) => <div key={`e${i}`} className="bg-gray-50 min-h-[72px]" />)}
                {days.map(day => {
                    const key = format(day, 'yyyy-MM-dd');
                    const dayItems = itemsByDate[key] ?? [];
                    const todayBool = isToday(day);
                    return (
                        <div key={key} className={`bg-white min-h-[72px] p-1.5 ${todayBool ? 'ring-1 ring-inset ring-blue-300' : ''}`}>
                            <p className={`text-[11px] font-semibold mb-1 w-5 h-5 flex items-center justify-center rounded-full ${todayBool ? 'bg-[#0058DB] text-white' : 'text-gray-600'}`}>
                                {day.getDate()}
                            </p>
                            <div className="space-y-0.5">
                                {dayItems.slice(0,2).map(item => (
                                    <div key={item.id} className={`text-[9px] font-semibold px-1 py-0.5 rounded truncate ${CATEGORY_COLORS[item.category]}`} title={item.title}>
                                        {item.title}
                                    </div>
                                ))}
                                {dayItems.length > 2 && <div className="text-[9px] text-gray-400 font-semibold px-1">+{dayItems.length - 2} more</div>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ── Three-dot menu ────────────────────────────────────────────────────────────

const ItemMenu: React.FC<{ onEdit: () => void; onArchive: () => void; onDelete: () => void }> = ({ onEdit, onArchive, onDelete }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative">
            <button type="button"
                onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition">
                <MoreVertical size={15} />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-8 z-[110] w-40 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden text-xs">
                        <button type="button" onClick={() => { setOpen(false); onEdit(); }}
                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-gray-700 font-medium transition">Edit</button>
                        <button type="button" onClick={() => { setOpen(false); onArchive(); }}
                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-gray-700 font-medium transition">Archive</button>
                        <button type="button" onClick={() => { setOpen(false); onDelete(); }}
                            className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-red-600 font-medium transition">Delete</button>
                    </div>
                </>
            )}
        </div>
    );
};

// ── Mobile Schedules (self-contained so it can own its own refs/state) ────────

interface MobileSchedulesProps {
    view: 'list' | 'calendar';
    setView: (v: 'list' | 'calendar') => void;
    activeCategory: 'ALL' | ScheduleCategory;
    setActiveCategory: (v: 'ALL' | ScheduleCategory) => void;
    filterTabs: { key: string; label: string }[];
    counts: Record<string, number>;
    allItems: ScheduledItem[];
    items: ScheduledItem[];
    isLoading: boolean;
    setDetailItem: (item: ScheduledItem) => void;
    setEditItem: (item: ScheduledItem | null) => void;
    setShowAddModal: (v: boolean) => void;
    handleArchive: (item: ScheduledItem) => void;
    handleDelete: (item: ScheduledItem) => void;
}

const MobileSchedules: React.FC<MobileSchedulesProps> = ({
    view, setView,
    activeCategory, setActiveCategory,
    filterTabs, counts,
    allItems, items, isLoading,
    setDetailItem, setEditItem, setShowAddModal,
    handleArchive, handleDelete,
}) => {
    const tabsRef = useRef<HTMLDivElement>(null);
    const [fadeState, setFadeState] = useState({ left: false, right: false });

    const updateFades = useCallback(() => {
        const el = tabsRef.current;
        if (!el) return;
        const canScrollLeft  = el.scrollLeft > 2;
        const canScrollRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 2;
        setFadeState({ left: canScrollLeft, right: canScrollRight });
    }, []);

    // Recalculate whenever tabs or counts change (different tabs may widen/narrow the strip)
    useLayoutEffect(() => { updateFades(); }, [filterTabs, counts, updateFades]);

    // ── Sliding highlight for the category tabs (mirrors SegmentedControl's
    //    behaviour, but adapted to a horizontally-scrollable strip) ──────────
    const catBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const [catRect, setCatRect] = useState({ left: 0, top: 0, width: 0, height: 0 });
    const [catReady, setCatReady] = useState(false);

    const measureCatHighlight = useCallback(() => {
        const btn = catBtnRefs.current[activeCategory];
        if (btn) {
            setCatRect({ left: btn.offsetLeft, top: btn.offsetTop, width: btn.offsetWidth, height: btn.offsetHeight });
        }
    }, [activeCategory]);

    useLayoutEffect(() => {
        measureCatHighlight();
        const raf = requestAnimationFrame(measureCatHighlight);
        return () => cancelAnimationFrame(raf);
    }, [measureCatHighlight, filterTabs, counts]);

    useEffect(() => {
        const raf = requestAnimationFrame(() => setCatReady(true));
        return () => cancelAnimationFrame(raf);
    }, []);

    // Keep the active tab (and its highlight) scrolled into view when it changes.
    useEffect(() => {
        const btn = catBtnRefs.current[activeCategory];
        btn?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }, [activeCategory]);

    return (
        <div className="md:hidden flex-1 min-h-0 flex flex-col px-4 pb-4">
            {/* View toggle pill — animated sliding highlight */}
            <SegmentedControl
                variant="capsule"
                className="flex-shrink-0 mb-3"
                options={[
                    {
                        value: 'list',
                        label: (
                            <span className="inline-flex items-center justify-center gap-1.5">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#6B7280]">
                                    <path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/>
                                    <path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>
                                </svg>
                                <span>List View</span>
                            </span>
                        ),
                    },
                    {
                        value: 'calendar',
                        label: (
                            <span className="inline-flex items-center justify-center gap-1.5">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#6B7280]">
                                    <path d="M8 2v3"/><path d="M16 2v3"/>
                                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                                    <path d="M3 9h18"/>
                                    <path d="M8 13h.01"/><path d="M12 13h.01"/><path d="M16 13h.01"/>
                                    <path d="M8 17h.01"/><path d="M12 17h.01"/><path d="M16 17h.01"/>
                                </svg>
                                <span>Calendar View</span>
                            </span>
                        ),
                    },
                ]}
                value={view}
                onChange={(v) => setView(v as 'list' | 'calendar')}
            />

            {/* Card — fills remaining space */}
            <div className="flex-1 min-h-0 bg-white rounded-[20px] shadow-[0px_2px_6px_0px_rgba(0,0,0,0.15)] p-3.5 flex flex-col gap-3 overflow-hidden">

                {/* Category tabs — sliding highlight + scroll-aware edge fades */}
                <div className="flex-shrink-0 relative">
                    <div
                        ref={tabsRef}
                        onScroll={updateFades}
                        className="relative flex items-center gap-1 bg-slate-100 rounded-[10px] p-1 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                    >
                        {/* Sliding highlight pill */}
                        <div
                            aria-hidden
                            className="absolute z-0 pointer-events-none bg-white shadow rounded-lg"
                            style={{
                                left: catRect.left,
                                top: catRect.top,
                                width: catRect.width,
                                height: catRect.height,
                                transition: catReady
                                    ? 'left 300ms cubic-bezier(0.22, 1, 0.36, 1), width 300ms cubic-bezier(0.22, 1, 0.36, 1), top 300ms cubic-bezier(0.22, 1, 0.36, 1)'
                                    : 'none',
                            }}
                        />
                        {filterTabs.map(tab => {
                            const isActive = activeCategory === tab.key;
                            const count = (counts as any)[tab.key];
                            return (
                                <button key={tab.key} type="button"
                                    ref={(node) => { catBtnRefs.current[tab.key] = node; }}
                                    onClick={() => setActiveCategory(tab.key as any)}
                                    className={`relative z-10 flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors duration-200 flex-shrink-0 ${
                                        isActive ? 'text-gray-900 font-bold' : 'text-gray-500'
                                    }`}>
                                    {tab.label}
                                    {count !== undefined && count > 0 && (
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full transition-colors duration-200 ${isActive ? 'bg-[#0058DB] text-white' : 'bg-gray-200 text-gray-500'}`}>
                                            {count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    {/* Edge fades — only shown when there's content to scroll toward */}
                    <div className={`pointer-events-none absolute inset-y-0 left-0 w-6 rounded-l-[10px] bg-gradient-to-r from-slate-100 to-transparent transition-opacity duration-150 ${fadeState.left ? 'opacity-100' : 'opacity-0'}`} />
                    <div className={`pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-[10px] bg-gradient-to-l from-slate-100 to-transparent transition-opacity duration-150 ${fadeState.right ? 'opacity-100' : 'opacity-0'}`} />
                </div>

                {/* Scrollable content — slides in from the direction of the selected view/category tab */}
                <AnimatedTabContent
                    tabKey={`${view}-${activeCategory}`}
                    index={view === 'calendar' ? 999 : filterTabs.findIndex(t => t.key === activeCategory)}
                    className="flex-1 min-h-0 overflow-y-auto"
                >
                    {view === 'calendar' ? (
                        <CalendarView items={allItems} />
                    ) : isLoading ? (
                        <div className="flex justify-center items-center py-16">
                            <Loader2 size={22} className="animate-spin text-gray-300" />
                        </div>
                    ) : items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-14 text-center">
                            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-3">
                                <Calendar size={20} className="text-blue-400" />
                            </div>
                            <p className="text-sm font-bold text-gray-800 mb-1">No scheduled items</p>
                            <p className="text-xs text-gray-400">Tap + to add a recurring bill or subscription.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {items.map((item, idx) => (
                                <div key={item.id}
                                    className={`flex items-center gap-3 py-3 cursor-pointer ${idx < items.length - 1 ? 'border-b border-gray-100' : ''}`}
                                    onClick={() => setDetailItem(item)}>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            <span className="flex items-center gap-1 text-[10px] text-gray-500"><RotateCcw size={10} /> {cadenceLabel(item.cadence)}</span>
                                            <span className="flex items-center gap-1 text-[10px] text-gray-500"><Calendar size={10} /> Due {formatDueDate(item.next_due_date)}</span>
                                        </div>
                                        <span className={`inline-flex mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[item.category]}`}>{categoryLabel(item.category)}</span>
                                    </div>
                                    <p className="text-sm font-bold text-black flex-shrink-0">{formatCurrency(item.amount)}</p>
                                    <div onClick={e => e.stopPropagation()}>
                                        <ItemMenu
                                            onEdit={() => { setEditItem(item); setShowAddModal(true); }}
                                            onArchive={() => handleArchive(item)}
                                            onDelete={() => handleDelete(item)}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </AnimatedTabContent>
            </div>

            {/* FAB */}
            <button type="button"
                onClick={() => { setEditItem(null); setShowAddModal(true); }}
                className="fixed bottom-8 right-5 z-30 w-14 h-14 bg-blue-700 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all"
                aria-label="Add to Schedule">
                <Plus size={26} className="text-white" />
            </button>
        </div>
    );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export const Schedules: React.FC = () => {
    const qc = useQueryClient();
    const [view, setView]                     = useState<'list' | 'calendar'>('list');
    const [activeCategory, setActiveCategory] = useState<'ALL' | ScheduleCategory>('ALL');
    const [showAddModal, setShowAddModal]     = useState(false);
    const [editItem, setEditItem]             = useState<ScheduledItem | null>(null);
    const [detailItem, setDetailItem]         = useState<ScheduledItem | null>(null);
    const [runningId, setRunningId]           = useState<string | null>(null);
    const [saving, setSaving]                 = useState(false);
    const [toast, setToast]                   = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    const { data: allItems = [], isLoading } = useQuery<ScheduledItem[]>({
        queryKey: ['schedules'],
        queryFn: () => scheduleService.getAll(undefined, 'ACTIVE'),
    });
    const { data: counts = {} } = useQuery({
        queryKey: ['schedule-counts'],
        queryFn: () => scheduleService.getCounts(),
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['schedules'] });
        qc.invalidateQueries({ queryKey: ['schedule-counts'] });
    };

    const items = useMemo(() => {
        if (activeCategory === 'ALL') return allItems;
        return allItems.filter(i => i.category === activeCategory);
    }, [allItems, activeCategory]);

    const handleSave = useCallback(async (payload: CreateScheduledItemPayload) => {
        setSaving(true);
        try {
            if (editItem) {
                await scheduleService.update(editItem.id, payload);
                showToast('Schedule updated.');
            } else {
                await scheduleService.create(payload);
                showToast('Added to schedule.');
            }
            setShowAddModal(false);
            setEditItem(null);
            invalidate();
        } finally { setSaving(false); }
    }, [editItem]);

    const handleArchive = useCallback(async (item: ScheduledItem) => {
        try {
            await scheduleService.update(item.id, { status: 'ARCHIVED' });
            showToast('Item archived.');
            invalidate();
            if (detailItem?.id === item.id) setDetailItem(null);
        } catch (err: any) { showToast(err.message, 'error'); }
    }, [detailItem]);

    const handleDelete = useCallback(async (item: ScheduledItem) => {
        if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
        try {
            await scheduleService.delete(item.id);
            showToast('Deleted.');
            invalidate();
            if (detailItem?.id === item.id) setDetailItem(null);
        } catch (err: any) { showToast(err.message, 'error'); }
    }, [detailItem]);

    const handleRunNow = useCallback(async (item: ScheduledItem) => {
        setRunningId(item.id);
        try {
            const result = await scheduleService.runNow(item.id);
            showToast('Requisition created — check your Inbox.');
            invalidate();
            qc.invalidateQueries({ queryKey: ['schedule-runs', item.id] });
            if (detailItem?.id === item.id) {
                setDetailItem(prev => prev ? { ...prev, next_due_date: result.next_due_date } : prev);
            }
        } catch (err: any) { showToast(err.message, 'error'); }
        finally { setRunningId(null); }
    }, [detailItem]);

    const filterTabs = [
        { key: 'ALL', label: 'All' },
        ...CATEGORIES.map(c => ({ key: c.value, label: c.label })),
    ];

    return (
        <Layout noPadding title="Schedules" backgroundColor="bg-gray-50">
            {/* ── Desktop ── */}
            <div className="hidden md:flex flex-col h-full md:px-4 md:pb-4">
                {/* View-toggle tabs — no border */}
                <div className="flex items-end gap-1">
                    {(['list', 'calendar'] as const).map(v => (
                        <button key={v} type="button" onClick={() => setView(v)}
                            className={`px-5 py-2 text-xs rounded-t-xl capitalize transition-all ${
                                view === v ? 'bg-white font-bold text-gray-900' : 'font-normal text-gray-500 hover:text-gray-700'
                            }`}>
                            {v === 'list' ? 'List View' : 'Calendar View'}
                        </button>
                    ))}
                </div>

                {/* Main card — no border, no shadow */}
                <div className="flex-1 bg-white rounded-tr-[20px] rounded-bl-[20px] rounded-br-[20px] flex flex-col overflow-hidden">
                    <div className="px-4 pt-4 pb-3 flex items-center gap-4 flex-shrink-0">
                        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto flex-shrink-0">
                            {filterTabs.map(tab => {
                                const isActive = activeCategory === tab.key;
                                const count = (counts as any)[tab.key];
                                return (
                                    <button key={tab.key} type="button"
                                        onClick={() => setActiveCategory(tab.key as any)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg whitespace-nowrap transition-all ${
                                            isActive ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                                        }`}>
                                        {tab.label}
                                        {count !== undefined && count > 0 && (
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-[#0058DB] text-white' : 'bg-gray-200 text-gray-500'}`}>
                                                {count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex-1" />
                        <button type="button"
                            onClick={() => { setEditItem(null); setShowAddModal(true); }}
                            className="h-8 pl-4 pr-3 bg-[#0058DB] rounded-lg flex items-center gap-2 hover:opacity-90 transition-opacity">
                            <Plus size={13} className="text-white" />
                            <span className="text-white text-xs font-bold">Add to Schedule</span>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 pb-4">
                        {view === 'calendar' ? (
                            <CalendarView items={allItems} />
                        ) : isLoading ? (
                            <div className="flex justify-center items-center py-20">
                                <Loader2 size={24} className="animate-spin text-gray-300" />
                            </div>
                        ) : items.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-24 text-center">
                                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                                    <Calendar size={22} className="text-blue-400" />
                                </div>
                                <p className="text-sm font-bold text-gray-800 mb-1">No scheduled items</p>
                                <p className="text-xs text-gray-400 mb-5">Add recurring bills, subscriptions, or payments to keep track automatically.</p>
                                <button type="button"
                                    onClick={() => { setEditItem(null); setShowAddModal(true); }}
                                    className="h-8 pl-4 pr-3 bg-[#0058DB] rounded-lg flex items-center gap-2 hover:opacity-90 transition-opacity">
                                    <Plus size={13} className="text-white" />
                                    <span className="text-white text-xs font-bold">Add to Schedule</span>
                                </button>
                            </div>
                        ) : (
                            <div className="rounded-2xl">
                                {items.map((item, idx) => {
                                    const CatIcon = CATEGORIES.find(c => c.value === item.category)?.icon ?? FileText;
                                    return (
                                        <div key={item.id}
                                            className={`flex items-center gap-5 px-4 py-4 cursor-pointer hover:bg-gray-50 transition ${idx < items.length - 1 ? 'border-b border-gray-100' : ''}`}
                                            onClick={() => setDetailItem(item)}>
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${CATEGORY_COLORS[item.category]}`}>
                                                <CatIcon size={15} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-gray-900 truncate">{item.title}</p>
                                                <div className="flex items-center gap-3 mt-0.5">
                                                    <span className="flex items-center gap-1 text-[11px] text-gray-500"><RotateCcw size={10} /> {cadenceLabel(item.cadence)}</span>
                                                    <span className="flex items-center gap-1 text-[11px] text-gray-500"><Calendar size={10} /> Due {formatDueDate(item.next_due_date)}</span>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[item.category]}`}>{categoryLabel(item.category)}</span>
                                                </div>
                                            </div>
                                            <p className="text-sm font-bold text-gray-900 flex-shrink-0">{formatCurrency(item.amount)}</p>
                                            <div onClick={e => e.stopPropagation()}>
                                                <ItemMenu
                                                    onEdit={() => { setEditItem(item); setShowAddModal(true); }}
                                                    onArchive={() => handleArchive(item)}
                                                    onDelete={() => handleDelete(item)}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Mobile ── */}
            <MobileSchedules
                view={view} setView={setView}
                activeCategory={activeCategory} setActiveCategory={setActiveCategory}
                filterTabs={filterTabs} counts={counts}
                allItems={allItems} items={items} isLoading={isLoading}
                setDetailItem={setDetailItem}
                setEditItem={setEditItem} setShowAddModal={setShowAddModal}
                handleArchive={handleArchive} handleDelete={handleDelete}
            />


            {showAddModal && (
                <ScheduleModal
                    initial={editItem}
                    onClose={() => { setShowAddModal(false); setEditItem(null); }}
                    onSave={handleSave}
                    saving={saving}
                />
            )}
            {detailItem && (
                <DetailPanel
                    item={detailItem}
                    onClose={() => setDetailItem(null)}
                    onEdit={() => { setEditItem(detailItem); setShowAddModal(true); }}
                    onRunNow={() => handleRunNow(detailItem)}
                    running={runningId === detailItem.id}
                />
            )}

            {toast && (
                <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 ${toast.type === 'success' ? 'bg-gray-900 text-white' : 'bg-red-600 text-white'}`}>
                    {toast.type === 'success' ? <Check size={13} /> : <AlertCircle size={13} />}
                    {toast.msg}
                </div>
            )}
        </Layout>
    );
};

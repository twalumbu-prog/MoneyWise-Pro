import React, { useState, useEffect, useRef } from 'react';
import { X, CreditCard, Smartphone, Wallet, ChevronRight, CheckCircle2, AlertCircle, Loader2, Check, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

async function apiFetch(path: string, options: RequestInit = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token || ''}`,
            ...(options.headers || {}),
        },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Request failed');
    return json;
}

// Mirror of LencoService.resolveMobileOperator — detects network from Zambian prefix.
function detectOperator(phone: string): 'airtel' | 'mtn' | 'zamtel' | null {
    const clean = (phone || '').replace(/[^0-9]/g, '');
    const normalized = clean.startsWith('260') ? '0' + clean.slice(3) : clean;
    if (normalized.startsWith('097') || normalized.startsWith('077')) return 'airtel';
    if (normalized.startsWith('096') || normalized.startsWith('076')) return 'mtn';
    if (normalized.startsWith('095') || normalized.startsWith('075')) return 'zamtel';
    return null;
}

const OPERATOR_COLORS: Record<string, string> = {
    airtel: 'text-red-500',
    mtn: 'text-amber-500',
    zamtel: 'text-emerald-500',
};

interface OrgWallet {
    id: string;
    name: string;
    is_main: boolean;
    balance?: number;
}

interface Props {
    invoiceId: string;
    invoiceNumber: string;
    amountDue: number;
    onClose: () => void;
    onPaid: () => void;
}

type PayMethod = 'moneywise' | 'card' | 'mobile_money';

export const InvoicePaymentModal: React.FC<Props> = ({
    invoiceId, invoiceNumber, amountDue, onClose, onPaid
}) => {
    const [method, setMethod] = useState<PayMethod>('moneywise');
    const [wallets, setWallets] = useState<OrgWallet[]>([]);
    const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
    const [loadingWallets, setLoadingWallets] = useState(false);
    const [paying, setPaying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Mobile Money state
    const [momoPhone, setMomoPhone] = useState('');
    const [momoPhase, setMomoPhase] = useState<'form' | 'waiting' | 'success' | 'failed'>('form');
    const [resolvedAccountName, setResolvedAccountName] = useState('');
    const [resolvingAccountName, setResolvingAccountName] = useState(false);
    const [resolveFailed, setResolveFailed] = useState(false);
    const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load wallets when MoneyWise tab is active
    useEffect(() => {
        if (method !== 'moneywise') return;
        setLoadingWallets(true);
        apiFetch('/cashbook/wallets')
            .then(data => {
                const list: OrgWallet[] = Array.isArray(data) ? data : (data.wallets || []);
                setWallets(list);
                const main = list.find(w => w.is_main) || list[0];
                if (main) setSelectedWalletId(main.id);
            })
            .catch(() => {})
            .finally(() => setLoadingWallets(false));
    }, [method]);

    // Auto-resolve account name as phone is typed — same UX as QuickPay checkout
    useEffect(() => {
        if (method !== 'mobile_money' || momoPhase !== 'form') return;
        const operator = detectOperator(momoPhone);
        if (!operator) {
            setResolvedAccountName('');
            setResolveFailed(false);
            return;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            setResolvingAccountName(true);
            setResolveFailed(false);
            try {
                const res = await apiFetch('/lenco/resolve-momo', {
                    method: 'POST',
                    body: JSON.stringify({ phone: momoPhone, operator }),
                });
                if (cancelled) return;
                setResolvedAccountName(res?.accountName || '');
                if (!res?.accountName) setResolveFailed(true);
            } catch {
                if (cancelled) return;
                setResolvedAccountName('');
                setResolveFailed(true);
            } finally {
                if (!cancelled) setResolvingAccountName(false);
            }
        }, 500);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [momoPhone, method, momoPhase]);

    // Stop polling on unmount
    useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

    const pollMomoStatus = (attempts = 0) => {
        if (attempts > 40) { setMomoPhase('failed'); return; } // ~2 min max
        pollRef.current = setTimeout(async () => {
            try {
                const data = await apiFetch(`/billing/pay/${invoiceId}/mobile-money/status`);
                if (data.status === 'paid') { setMomoPhase('success'); setTimeout(onPaid, 1500); }
                else if (data.status === 'failed') { setMomoPhase('failed'); }
                else { pollMomoStatus(attempts + 1); }
            } catch { pollMomoStatus(attempts + 1); }
        }, 3000);
    };

    const handleConfirm = async () => {
        setError(null);

        if (method === 'moneywise') {
            if (!selectedWalletId) return;
            setPaying(true);
            try {
                await apiFetch(`/billing/pay/${invoiceId}`, {
                    method: 'POST',
                    body: JSON.stringify({ walletId: selectedWalletId }),
                });
                onPaid();
            } catch (e: any) {
                if (e.message.includes('Insufficient')) {
                    setError('Insufficient balance in the selected wallet. Please choose a different wallet or deposit funds first.');
                } else {
                    setError(e.message);
                }
            } finally {
                setPaying(false);
            }
        }

        if (method === 'mobile_money') {
            const operator = detectOperator(momoPhone);
            if (!momoPhone || !operator) return;
            setPaying(true);
            try {
                await apiFetch(`/billing/pay/${invoiceId}/mobile-money`, {
                    method: 'POST',
                    body: JSON.stringify({ phone: momoPhone, operator }),
                });
                setMomoPhase('waiting');
                pollMomoStatus();
            } catch (e: any) {
                setError(e.message);
            } finally {
                setPaying(false);
            }
        }
    };

    const tabs: { id: PayMethod; label: string; icon: React.ReactNode }[] = [
        { id: 'moneywise',    label: 'MoneyWise',    icon: <Wallet size={14} /> },
        { id: 'card',         label: 'Card',         icon: <CreditCard size={14} /> },
        { id: 'mobile_money', label: 'Mobile Money', icon: <Smartphone size={14} /> },
    ];

    const selectedWallet = wallets.find(w => w.id === selectedWalletId);
    const hasEnough = selectedWallet && (selectedWallet.balance ?? 0) >= amountDue;
    const momoOperator = detectOperator(momoPhone);
    const canPayMomo = !!momoPhone && !!momoOperator && !resolvingAccountName && !paying;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
                    <div>
                        <p className="text-base font-bold text-[#111827]">Pay Invoice</p>
                        <p className="text-xs text-gray-400 mt-0.5">{invoiceNumber} · ZMW {amountDue.toFixed(2)}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Method toggle */}
                <div className="px-6 pt-5">
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-3">Payment Method</p>
                    <div className="flex items-center gap-1 p-1 bg-[#F3F5FC] rounded-[10px]">
                        {tabs.map(t => (
                            <button
                                key={t.id}
                                onClick={() => { setMethod(t.id); setError(null); setMomoPhase('form'); }}
                                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] whitespace-nowrap transition-all ${
                                    method === t.id
                                        ? 'font-bold bg-white text-[#111827] shadow-sm'
                                        : 'font-normal text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                {t.icon}
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="px-6 py-5 flex-1">

                    {/* ── MoneyWise wallet ─────────────────────────────────────── */}
                    {method === 'moneywise' && (
                        <div className="flex flex-col gap-3">
                            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Select Wallet</p>

                            {loadingWallets ? (
                                <div className="flex items-center gap-2 py-6 justify-center text-gray-400">
                                    <Loader2 size={16} className="animate-spin" />
                                    <span className="text-xs">Loading wallets…</span>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {wallets.map(wallet => {
                                        const balance = wallet.balance ?? 0;
                                        const sufficient = balance >= amountDue;
                                        const isSelected = wallet.id === selectedWalletId;
                                        return (
                                            <button
                                                key={wallet.id}
                                                onClick={() => setSelectedWalletId(wallet.id)}
                                                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-left ${
                                                    isSelected
                                                        ? 'border-[#0058DB] bg-blue-50/50'
                                                        : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50/50'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                                        isSelected ? 'bg-[#0058DB]' : 'bg-gray-100'
                                                    }`}>
                                                        <Wallet size={14} className={isSelected ? 'text-white' : 'text-gray-400'} />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-[#111827]">
                                                            {wallet.name}
                                                            {wallet.is_main && (
                                                                <span className="ml-2 text-[9px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">Main</span>
                                                            )}
                                                        </p>
                                                        <p className={`text-xs mt-0.5 font-medium ${sufficient ? 'text-emerald-600' : 'text-red-400'}`}>
                                                            ZMW {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            {!sufficient && ' · Insufficient'}
                                                        </p>
                                                    </div>
                                                </div>
                                                {isSelected && <CheckCircle2 size={16} className="text-[#0058DB] flex-shrink-0" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {selectedWallet && (
                                <div className="mt-1 px-4 py-3 bg-gray-50 rounded-xl flex items-center justify-between">
                                    <span className="text-xs text-gray-500">Amount to deduct</span>
                                    <span className="text-sm font-bold text-[#111827]">ZMW {amountDue.toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Card (coming soon) ───────────────────────────────────── */}
                    {method === 'card' && (
                        <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                            <div className="h-12 w-12 rounded-2xl bg-gray-50 flex items-center justify-center">
                                <CreditCard size={22} className="text-gray-300" />
                            </div>
                            <p className="text-sm font-medium text-gray-500">Card payments coming soon</p>
                            <p className="text-xs text-gray-400 max-w-[220px]">Card payment integration is on our roadmap. Use MoneyWise wallet for now.</p>
                        </div>
                    )}

                    {/* ── Mobile Money ─────────────────────────────────────────── */}
                    {method === 'mobile_money' && (
                        <>
                            {/* Waiting for phone approval */}
                            {momoPhase === 'waiting' && (
                                <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
                                    <div className="h-14 w-14 rounded-2xl bg-blue-50 flex items-center justify-center">
                                        <Loader2 size={26} className="text-[#0058DB] animate-spin" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-[#111827]">Waiting for payment</p>
                                        <p className="text-xs text-gray-400 mt-1 max-w-[220px]">
                                            A prompt has been sent to <span className="font-semibold">{momoPhone}</span>. Please approve it on your phone.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => { setMomoPhase('form'); if (pollRef.current) clearTimeout(pollRef.current); }}
                                        className="text-xs text-red-400 hover:text-red-600"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}

                            {/* Success */}
                            {momoPhase === 'success' && (
                                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                                    <div className="h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
                                        <CheckCircle2 size={26} className="text-emerald-500" />
                                    </div>
                                    <p className="text-sm font-bold text-emerald-700">Payment confirmed!</p>
                                </div>
                            )}

                            {/* Failed */}
                            {momoPhase === 'failed' && (
                                <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                                    <div className="h-14 w-14 rounded-2xl bg-red-50 flex items-center justify-center">
                                        <AlertCircle size={26} className="text-red-400" />
                                    </div>
                                    <p className="text-sm font-bold text-red-600">Payment failed or timed out</p>
                                    <button onClick={() => setMomoPhase('form')} className="text-xs text-blue-600 underline">Try again</button>
                                </div>
                            )}

                            {/* Form — QuickPay-style phone input + auto name verification */}
                            {momoPhase === 'form' && (
                                <div className="flex flex-col gap-4">
                                    <label className="block text-sm font-semibold text-gray-800">
                                        Enter your mobile money number
                                    </label>

                                    {/* Phone input pill — flag + country code + number + auto-detected network */}
                                    <div className="min-h-12 bg-white rounded-full border border-slate-300 flex items-center overflow-hidden">
                                        <div className="self-stretch px-3 bg-neutral-100 border-r border-slate-300 flex items-center gap-1.5 flex-shrink-0">
                                            <span className="text-base leading-none" role="img" aria-label="Zambia">🇿🇲</span>
                                            <ChevronDown size={14} className="text-slate-400" />
                                        </div>
                                        <div className="flex-1 px-4 py-3 flex items-center gap-1.5 min-w-0">
                                            <span className="text-sm font-semibold text-gray-500 flex-shrink-0">+260</span>
                                            <input
                                                type="tel"
                                                value={momoPhone}
                                                onChange={e => setMomoPhone(e.target.value.replace(/\D/g, ''))}
                                                placeholder="(97) 123 4567"
                                                autoFocus
                                                className="flex-1 min-w-0 text-sm text-gray-800 outline-none bg-transparent placeholder:text-gray-400"
                                            />
                                            {momoOperator && (
                                                <span className={`text-[11px] font-bold uppercase tracking-tight flex-shrink-0 ${OPERATOR_COLORS[momoOperator]}`}>
                                                    {momoOperator}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Account holder verification card — shows once phone is long enough */}
                                    {momoPhone.length >= 9 && (
                                        <div className="px-4 py-3 rounded-2xl bg-white border border-slate-200 flex items-center gap-3">
                                            {resolvingAccountName ? (
                                                <Loader2 size={16} className="text-blue-600 animate-spin flex-shrink-0" />
                                            ) : resolvedAccountName ? (
                                                <Check size={16} className="text-emerald-500 flex-shrink-0" />
                                            ) : (
                                                <AlertCircle size={16} className="text-amber-500 flex-shrink-0" />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Account Holder</p>
                                                <p className="text-sm font-semibold text-gray-800 truncate">
                                                    {resolvingAccountName
                                                        ? 'Verifying number…'
                                                        : resolvedAccountName || (resolveFailed ? 'Could not verify — check the number' : 'Waiting for a valid number…')}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Amount */}
                                    <div className="px-4 py-3 bg-gray-50 rounded-xl flex items-center justify-between">
                                        <span className="text-xs text-gray-500">Amount</span>
                                        <span className="text-sm font-bold text-[#111827]">ZMW {amountDue.toFixed(2)}</span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="mt-3 flex items-start gap-2 px-3 py-2.5 bg-red-50 rounded-xl border border-red-100">
                            <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-red-600">{error}</p>
                        </div>
                    )}
                </div>

                {/* Footer — hidden while MoMo is in-flight or completed */}
                {!(method === 'mobile_money' && momoPhase !== 'form') && (
                    <div className="px-6 pb-5 flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={
                                paying ||
                                (method === 'card') ||
                                (method === 'moneywise' && (!selectedWalletId || !hasEnough)) ||
                                (method === 'mobile_money' && !canPayMomo)
                            }
                            className="flex-1 px-4 py-2.5 rounded-xl bg-[#00347C] text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#002460] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {paying ? (
                                <><Loader2 size={14} className="animate-spin" /> Processing…</>
                            ) : (
                                <>Confirm Payment <ChevronRight size={14} /></>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

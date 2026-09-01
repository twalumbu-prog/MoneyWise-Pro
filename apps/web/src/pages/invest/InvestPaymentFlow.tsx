import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, X, Repeat, Smartphone, CreditCard, ChevronDown, Loader2, Download, CheckCircle2, Delete } from 'lucide-react';
import type { InvestProduct, InvestProvider } from './InvestHome';
import { TYPE_CONFIG } from './InvestHome';
import { SegmentedControl } from '../../components/AnimatedTabs';
import { PaymentWaitingScreen, type PaymentPhase } from '../../components/PaymentWaitingScreen';
import { downloadInvestmentCertificate } from './investCertificate';
import { cashbookService } from '../../services/cashbook.service';
import { lencoService } from '../../services/lenco.service';
import { useAuth } from '../../context/AuthContext';

type Step = 'METHOD' | 'AMOUNT' | 'PAY' | 'WAITING' | 'ACTIVATING' | 'SUCCESS';
type Method = 'AUTO_INVEST' | 'DEPOSIT';
type PayMethod = 'WALLET' | 'MOBILE_MONEY' | 'CARD';

interface WalletOption {
    id: string;
    name: string;
    balance: number;
}

function formatKwacha(n: number): string {
    return `K${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface InvestPaymentFlowProps {
    open: boolean;
    onClose: () => void;
    product: InvestProduct;
    provider: InvestProvider;
}

function detectOperator(phone: string): 'airtel' | 'mtn' | 'zamtel' | null {
    const clean = (phone || '').replace(/[^0-9]/g, '');
    let normalized = clean.startsWith('260') ? '0' + clean.slice(3) : clean;
    if (normalized.length === 9 && /^[975]/.test(normalized)) {
        normalized = '0' + normalized;
    }
    if (normalized.startsWith('097') || normalized.startsWith('077')) return 'airtel';
    if (normalized.startsWith('096') || normalized.startsWith('076')) return 'mtn';
    if (normalized.startsWith('095') || normalized.startsWith('075')) return 'zamtel';
    return null;
}

function parsePrice(priceStr: string): number {
    return parseFloat(priceStr.replace(/[K,]/g, '')) || 0;
}

function formatAmountDisplay(amountStr: string): string {
    if (!amountStr) return '0';
    const [intPart, decPart] = amountStr.split('.');
    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
}

function genReference(): string {
    return `INV${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

const QUICK_AMOUNTS = [500, 1000, 2500];
const KEYPAD_ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['.', '0', 'back']];

export const InvestPaymentFlow: React.FC<InvestPaymentFlowProps> = ({ open, onClose, product, provider }) => {
    const [step, setStep] = useState<Step>('METHOD');
    const [method, setMethod] = useState<Method>('DEPOSIT');
    const [amountStr, setAmountStr] = useState('');
    const [payMethod, setPayMethod] = useState<PayMethod>('WALLET');
    const [wallets, setWallets] = useState<WalletOption[]>([]);
    const [selectedWalletId, setSelectedWalletId] = useState<string>('');
    const [walletDropdownOpen, setWalletDropdownOpen] = useState(false);
    const [phone, setPhone] = useState('');
    const [resolvedAccountName, setResolvedAccountName] = useState('');
    const [resolvingAccountName, setResolvingAccountName] = useState(false);
    const [resolveFailed, setResolveFailed] = useState(false);
    const [phase, setPhase] = useState<PaymentPhase>('initiating');
    const [elapsed, setElapsed] = useState(0);
    const [reference, setReference] = useState('');
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const elapsedInterval = useRef<ReturnType<typeof setInterval> | null>(null);
    const { organizationId } = useAuth();

    const unitPrice = parsePrice(product.price);
    const isUnitTrust = product.type === 'UNIT_TRUST';
    const amount = parseFloat(amountStr) || 0;
    const units = isUnitTrust && unitPrice > 0 ? amount / unitPrice : 0;
    const operator = detectOperator(phone);
    const selectedWallet = wallets.find(w => w.id === selectedWalletId) || null;

    // Reset on open
    useEffect(() => {
        if (open) {
            setStep('METHOD');
            setMethod('DEPOSIT');
            setAmountStr('');
            setPayMethod('WALLET');
            setWalletDropdownOpen(false);
            setPhone('');
            setResolvedAccountName('');
            setResolvingAccountName(false);
            setResolveFailed(false);
            setPhase('initiating');
            setElapsed(0);
            setReference('');

            cashbookService.getWallets()
                .then((data: any[]) => {
                    const opts: WalletOption[] = (data || []).map(w => ({ id: w.id, name: w.name, balance: Number(w.balance) || 0 }));
                    setWallets(opts);
                    setSelectedWalletId(prev => prev || opts[0]?.id || '');
                })
                .catch(() => setWallets([]));
        }
        return () => {
            timers.current.forEach(clearTimeout);
            timers.current = [];
            if (elapsedInterval.current) clearInterval(elapsedInterval.current);
        };
    }, [open]);

    // Resolve the mobile money account holder's name as the customer types —
    // same pattern as the quick-pay checkout (debounced, cancel-safe).
    useEffect(() => {
        if (step !== 'PAY' || payMethod !== 'MOBILE_MONEY') return;
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
                const res = await lencoService.resolveMobileMoney(phone, operator, organizationId || undefined);
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
    }, [phone, operator, payMethod, step, organizationId]);

    if (!open) return null;

    const appendDigit = (d: string) => {
        if (d === '.' && amountStr.includes('.')) return;
        if (amountStr.replace('.', '').length >= 9) return;
        setAmountStr(prev => prev + d);
    };
    const backspace = () => setAmountStr(prev => prev.slice(0, -1));

    const clearTimers = () => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        if (elapsedInterval.current) clearInterval(elapsedInterval.current);
    };

    const startDepositSimulation = () => {
        const ref = genReference();
        setReference(ref);
        setStep('WAITING');
        setPhase('initiating');
        setElapsed(0);

        elapsedInterval.current = setInterval(() => setElapsed(e => e + 1), 1000);

        // NOTE: simulated locally — the mocked invest products here have no
        // backing wallet/org in the ledger to receive real funds. Swapping in
        // the real POST /lenco/public-collection/mobile-money + long-poll
        // (same pattern as QuickPay.tsx) is a drop-in once a product maps to
        // a real wallet.
        timers.current.push(setTimeout(() => setPhase('confirm'), 1400));
        timers.current.push(setTimeout(() => setPhase('polling'), 3200));
        timers.current.push(setTimeout(() => {
            clearTimers();
            setPhase('success');
        }, 5800));
    };

    const startAutoInvestActivation = () => {
        const ref = genReference();
        setReference(ref);
        setStep('ACTIVATING');
        timers.current.push(setTimeout(() => setStep('SUCCESS'), 1400));
    };

    const startWalletPayment = () => {
        const ref = genReference();
        setReference(ref);
        setStep('ACTIVATING');
        timers.current.push(setTimeout(() => setStep('SUCCESS'), 1200));
    };

    const handleAmountCta = () => {
        if (amount <= 0) return;
        if (method === 'DEPOSIT') setStep('PAY');
        else startAutoInvestActivation();
    };

    const handlePayCta = () => {
        if (payMethod === 'WALLET') startWalletPayment();
        else if (payMethod === 'MOBILE_MONEY') startDepositSimulation();
    };

    const handleClose = () => {
        clearTimers();
        onClose();
    };

    const ctaLabel = method === 'DEPOSIT' ? 'Proceed to Payment' : 'Activate Auto-Invest';
    const charge = Math.max(1, Math.round(amount * 0.01 * 100) / 100);

    return (
        <div className="fixed inset-0 z-[200] md:bg-black/50 md:flex md:items-center md:justify-center">
            <div className="w-full h-full md:max-w-md md:h-[720px] md:rounded-2xl md:overflow-hidden md:bg-white flex flex-col relative">

                {/* ── METHOD: bottom sheet ─────────────────────────────────── */}
                {step === 'METHOD' && (
                    <>
                        <div className="flex-1 bg-black/30" onClick={handleClose} />
                        <div className="shrink-0 bg-white rounded-t-3xl px-6 pt-3 pb-8 animate-in slide-in-from-bottom duration-300">
                            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
                            <div className="flex items-center justify-between mb-1">
                                <h2 className="text-black text-lg font-bold font-['DM_Sans']">Invest in {product.name}</h2>
                                <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center text-gray-400 active:opacity-60">
                                    <X size={18} />
                                </button>
                            </div>
                            <p className="text-gray-500 text-xs font-['DM_Sans'] mb-5">Choose how you'd like to fund this investment.</p>

                            <button
                                onClick={() => { setMethod('AUTO_INVEST'); setStep('AMOUNT'); }}
                                className="w-full flex items-center gap-3 p-4 rounded-2xl border border-gray-200 mb-3 active:bg-gray-50 transition-colors text-left"
                            >
                                <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                                    <Repeat size={20} className="text-[#0058DB]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-black text-sm font-bold font-['DM_Sans']">Auto-Invest</div>
                                    <div className="text-gray-500 text-xs font-['DM_Sans'] mt-0.5">Recurring scheduled contributions</div>
                                </div>
                            </button>

                            <button
                                onClick={() => { setMethod('DEPOSIT'); setStep('AMOUNT'); }}
                                className="w-full flex items-center gap-3 p-4 rounded-2xl border border-gray-200 active:bg-gray-50 transition-colors text-left"
                            >
                                <div className="w-11 h-11 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                                    <img src="/logo-mark.svg" alt="" className="w-6 h-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-black text-sm font-bold font-['DM_Sans']">Deposit</div>
                                    <div className="text-gray-500 text-xs font-['DM_Sans'] mt-0.5">Fund instantly via Lenco mobile money</div>
                                </div>
                            </button>
                        </div>
                    </>
                )}

                {/* ── AMOUNT ────────────────────────────────────────────────── */}
                {step === 'AMOUNT' && (
                    <div className="flex flex-col h-full bg-gray-50">
                        <div className="shrink-0 px-4 py-3 flex items-center gap-3 bg-gray-50">
                            <button onClick={() => setStep('METHOD')} className="w-8 h-8 flex items-center justify-center text-black active:opacity-60">
                                <ChevronLeft size={22} />
                            </button>
                            <div className="flex-1 text-center text-black text-base font-semibold font-['Figtree'] truncate">{product.name}</div>
                            <div className="w-8 h-8" />
                        </div>

                        <div className="flex flex-col items-center gap-2.5 px-6 pt-2">
                            <div className="text-black text-xl font-bold font-['Figtree'] text-center">
                                {isUnitTrust ? `Buy ${product.id.toUpperCase()} Units` : `Deposit into ${product.name}`}
                            </div>
                            <div className="text-black text-5xl font-bold font-['Figtree']">K{formatAmountDisplay(amountStr || '0')}</div>
                            {isUnitTrust && unitPrice > 0 && (
                                <div className="flex flex-col items-center gap-1 pt-1">
                                    <div className="flex items-center gap-2.5 text-xs font-medium font-['Space_Grotesk'] text-black">
                                        <span>1 Unit trust</span>
                                        <span className="text-neutral-400">⇄</span>
                                        <span>K{unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="text-xs font-medium font-['Space_Grotesk']">
                                        <span className="text-neutral-500">Gets you </span>
                                        <span className="text-neutral-500 font-bold">{units.toLocaleString(undefined, { maximumFractionDigits: 2 })} Units</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-4 px-6 mt-6">
                            {QUICK_AMOUNTS.map(q => (
                                <button
                                    key={q}
                                    onClick={() => setAmountStr(String(q))}
                                    className="flex-1 h-12 bg-neutral-100 rounded-xl flex items-center justify-center active:bg-neutral-200 transition-colors"
                                >
                                    <span className="text-black text-xs font-bold font-['DM_Sans']">
                                        K{q.toLocaleString()}
                                    </span>
                                </button>
                            ))}
                        </div>

                        <div className="flex-1 flex flex-col justify-center gap-3 px-8 mt-4">
                            {KEYPAD_ROWS.map((row, ri) => (
                                <div key={ri} className="flex items-center gap-10">
                                    {row.map(key => (
                                        <button
                                            key={key}
                                            onClick={() => key === 'back' ? backspace() : appendDigit(key)}
                                            className="flex-1 p-2.5 flex flex-col justify-center items-center active:opacity-50 transition-opacity"
                                        >
                                            {key === 'back' ? (
                                                <Delete size={24} className="text-black" />
                                            ) : (
                                                <span className="text-black text-3xl font-bold font-['Space_Grotesk']">{key}</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>

                        <div className="shrink-0 bg-white border-t border-zinc-100 px-4 pt-3 pb-6">
                            <div className="px-6 flex items-center justify-between mb-3">
                                <span className="text-black text-sm font-normal font-['DM_Sans']">Total</span>
                                <span className="text-black text-base font-medium font-['DM_Sans']">K{formatAmountDisplay(amountStr || '0')}</span>
                            </div>
                            <button
                                onClick={handleAmountCta}
                                disabled={amount <= 0}
                                className="w-full h-14 bg-black disabled:bg-gray-300 rounded-xl flex items-center justify-center transition-colors"
                            >
                                <span className="text-white text-base font-bold font-['Inter']">{ctaLabel}</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* ── PAY: method tabs (Wallet / Mobile Money / Card) ─────────── */}
                {step === 'PAY' && (
                    <div className="flex flex-col h-full bg-neutral-50">
                        <div className="shrink-0 px-4 py-3 flex items-center gap-4 bg-neutral-50">
                            <button onClick={() => setStep('AMOUNT')} className="w-6 h-6 flex items-center justify-center text-black active:opacity-60">
                                <ChevronLeft size={22} />
                            </button>
                            <div className="text-black text-xl font-semibold font-['DM_Sans']">Payment</div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 pt-2">
                            {/* Method tabs */}
                            <SegmentedControl
                                options={[
                                    { value: 'WALLET', label: (
                                        <span className="flex items-center justify-center gap-1.5">
                                            <img src="/logo-mark.svg" alt="" className="w-3.5 h-3.5" />
                                            <span className="text-xs font-bold font-['Instrument_Sans']">Moneywise</span>
                                        </span>
                                    ) },
                                    { value: 'MOBILE_MONEY', label: (
                                        <span className="flex items-center justify-center gap-1.5">
                                            <Smartphone size={14} className="text-zinc-800" />
                                            <span className="text-xs font-['Instrument_Sans']">Mobile Money</span>
                                        </span>
                                    ) },
                                    { value: 'CARD', label: (
                                        <span className="flex items-center justify-center gap-1.5">
                                            <CreditCard size={14} className="text-zinc-800" />
                                            <span className="text-xs font-['Instrument_Sans']">Debit Card</span>
                                        </span>
                                    ) },
                                ]}
                                value={payMethod}
                                onChange={v => setPayMethod(v as PayMethod)}
                                variant="capsule"
                                trackBgClassName="bg-neutral-100"
                                className="h-10"
                            />

                            {/* Wallet selector — shows each wallet's live balance */}
                            {payMethod === 'WALLET' && (
                                <div className="mt-6 relative">
                                    <div className="text-gray-800 text-sm font-semibold font-['Figtree'] mb-2">Pay from</div>
                                    <button
                                        onClick={() => setWalletDropdownOpen(o => !o)}
                                        className="w-full h-14 px-5 bg-white rounded-2xl outline outline-1 outline-offset-[-1px] outline-slate-300 flex items-center justify-between"
                                    >
                                        <div className="flex flex-col items-start">
                                            <span className="text-gray-700 text-base font-medium font-['Figtree']">
                                                {selectedWallet?.name || (wallets.length === 0 ? 'Loading wallets…' : 'Select a wallet')}
                                            </span>
                                            {selectedWallet && (
                                                <span className="text-gray-400 text-xs font-medium font-['Figtree']">
                                                    Balance: {formatKwacha(selectedWallet.balance)}
                                                </span>
                                            )}
                                        </div>
                                        <ChevronDown size={18} className={`text-gray-400 transition-transform flex-shrink-0 ${walletDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    {walletDropdownOpen && (
                                        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 bg-white rounded-2xl shadow-[0px_8px_24px_0px_rgba(17,24,39,0.12)] outline outline-1 outline-offset-[-1px] outline-[#E8EEF8] overflow-hidden">
                                            {wallets.map(w => (
                                                <button
                                                    key={w.id}
                                                    onClick={() => { setSelectedWalletId(w.id); setWalletDropdownOpen(false); }}
                                                    className={`w-full flex items-center justify-between text-left px-5 py-3 transition-colors ${w.id === selectedWalletId ? 'text-[#0058DB] bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                                                >
                                                    <span className="text-sm font-medium font-['Figtree']">{w.name}</span>
                                                    <span className="text-xs font-semibold font-['Figtree']">{formatKwacha(w.balance)}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {selectedWallet && amount > 0 && selectedWallet.balance < amount && (
                                        <div className="mt-2 text-xs font-semibold font-['Figtree'] text-red-500">
                                            Insufficient balance in {selectedWallet.name}.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Mobile money number entry */}
                            {payMethod === 'MOBILE_MONEY' && (
                                <div className="mt-6 flex flex-col items-end gap-2">
                                    <div className="self-stretch text-gray-800 text-sm font-semibold font-['Figtree'] leading-5">Enter your mobile money number</div>
                                    <div className="self-stretch min-h-12 bg-white rounded-full outline outline-1 outline-offset-[-1px] outline-slate-300 flex items-center overflow-hidden">
                                        <div className="p-3 bg-neutral-100 border-r border-slate-300 flex items-center">
                                            <span className="text-gray-600 text-sm font-semibold font-['Figtree']">+260</span>
                                        </div>
                                        <div className="flex-1 px-5 py-3 flex items-center gap-1.5">
                                            <input
                                                type="tel"
                                                value={phone}
                                                onChange={e => setPhone(e.target.value)}
                                                placeholder="(971) - 234 - 567"
                                                className="flex-1 min-w-0 bg-transparent border-none outline-none text-gray-700 text-base font-normal font-['Figtree']"
                                            />
                                            {operator && (
                                                <span className="text-gray-600 text-xs font-semibold font-['Figtree'] uppercase flex-shrink-0">{operator}</span>
                                            )}
                                        </div>
                                    </div>
                                    {operator && (
                                        <div className="self-stretch flex items-center gap-1.5 text-xs font-['Figtree']">
                                            {resolvingAccountName ? (
                                                <>
                                                    <Loader2 size={12} className="animate-spin text-gray-400" />
                                                    <span className="text-gray-400">Verifying account holder…</span>
                                                </>
                                            ) : resolvedAccountName ? (
                                                <>
                                                    <CheckCircle2 size={12} className="text-[#05C702]" />
                                                    <span className="text-gray-700 font-semibold">{resolvedAccountName}</span>
                                                </>
                                            ) : resolveFailed ? (
                                                <span className="text-red-500 font-medium">Could not verify — check the number</span>
                                            ) : null}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Card — not yet implemented */}
                            {payMethod === 'CARD' && (
                                <div className="mt-6 p-5 bg-white rounded-2xl outline outline-1 outline-offset-[-1px] outline-slate-200 text-center">
                                    <div className="text-gray-800 text-sm font-semibold font-['Figtree'] mb-1">Card payments coming soon</div>
                                    <div className="text-gray-400 text-xs font-['Figtree']">Use Moneywise or Mobile Money for now.</div>
                                </div>
                            )}

                            <div className="h-6" />
                        </div>

                        {/* Bottom summary + CTA */}
                        <div className="shrink-0 bg-white border-t border-gray-100 px-7 py-6 flex flex-col gap-3">
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-zinc-600 text-xs font-bold font-['Inter']">Transfer Amount</span>
                                    <span className="text-zinc-600 text-xs font-bold font-['Inter']">K{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                {payMethod !== 'WALLET' && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-zinc-600 text-[10px] font-normal font-['Inter']">Withdraw Charge</span>
                                        <span className="text-zinc-600 text-[10px] font-normal font-['Inter']">K{charge.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={handlePayCta}
                                disabled={
                                    payMethod === 'CARD' ||
                                    (payMethod === 'MOBILE_MONEY' && (!operator || !resolvedAccountName || resolvingAccountName)) ||
                                    (payMethod === 'WALLET' && (!selectedWallet || selectedWallet.balance < amount))
                                }
                                className="w-full h-14 bg-black disabled:bg-gray-300 rounded-xl flex items-center justify-center transition-colors"
                            >
                                <span className="text-white text-base font-bold font-['DM_Sans']">
                                    Invest K{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                            </button>
                        </div>
                    </div>
                )}

                {/* ── WAITING (deposit) ────────────────────────────────────── */}
                {step === 'WAITING' && (
                    <div className="flex flex-col h-full bg-white">
                        <PaymentWaitingScreen
                            phase={phase}
                            amount={amount}
                            businessName={provider.name}
                            payerPhone={phone}
                            operator={operator}
                            isSlowNetwork={false}
                            elapsedSeconds={elapsed}
                            reference={reference}
                            cancelling={false}
                            onCancel={() => { clearTimers(); setStep('PAY'); }}
                            onDone={() => setStep('SUCCESS')}
                        />
                    </div>
                )}

                {/* ── ACTIVATING (auto-invest activation, or instant wallet debit) ── */}
                {step === 'ACTIVATING' && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-white">
                        <Loader2 size={36} className="animate-spin text-[#0058DB]" />
                        <div className="text-black text-sm font-bold font-['DM_Sans']">
                            {method === 'AUTO_INVEST' ? 'Activating Auto-Invest…' : `Paying from ${selectedWallet?.name || 'wallet'}…`}
                        </div>
                    </div>
                )}

                {/* ── SUCCESS ───────────────────────────────────────────────── */}
                {step === 'SUCCESS' && (
                    <SuccessScreen
                        method={method}
                        payMethod={payMethod}
                        selectedWallet={selectedWallet}
                        product={product}
                        provider={provider}
                        amount={amount}
                        units={isUnitTrust ? units : undefined}
                        unitPrice={isUnitTrust ? unitPrice : undefined}
                        reference={reference}
                        onClose={handleClose}
                    />
                )}
            </div>
        </div>
    );
};

const SuccessScreen: React.FC<{
    method: Method;
    payMethod: PayMethod;
    selectedWallet: WalletOption | null;
    product: InvestProduct;
    provider: InvestProvider;
    amount: number;
    units?: number;
    unitPrice?: number;
    reference: string;
    onClose: () => void;
}> = ({ method, payMethod, selectedWallet, product, provider, amount, units, unitPrice, reference, onClose }) => {
    const methodLabel = method === 'AUTO_INVEST'
        ? 'Auto-Invest'
        : payMethod === 'WALLET' ? `Moneywise${selectedWallet ? ` (${selectedWallet.name})` : ''}`
        : payMethod === 'MOBILE_MONEY' ? 'Mobile Money'
        : 'Debit Card';

    const [downloading, setDownloading] = useState(false);
    const date = useMemo(() => new Date(), []);

    const handleDownload = async () => {
        setDownloading(true);
        try {
            await downloadInvestmentCertificate({
                companyName: provider.name,
                companyLogo: provider.logo,
                productName: product.name,
                productTypeLabel: TYPE_CONFIG[product.type].label,
                amount,
                units,
                unitPrice,
                reference,
                date,
                method: methodLabel,
            });
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white px-6">
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center">
                    <CheckCircle2 size={44} className="text-[#05C702]" />
                </div>
                <div className="text-center">
                    <div className="text-black text-xl font-bold font-['DM_Sans']">
                        {method === 'AUTO_INVEST' ? 'Auto-Invest Activated' : 'Investment Successful'}
                    </div>
                    <div className="text-gray-500 text-sm font-['DM_Sans'] mt-1">
                        {method === 'AUTO_INVEST'
                            ? `K${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} will be deducted from your payroll each cycle.`
                            : `Your deposit into ${product.name} was successful.`}
                    </div>
                </div>

                <div className="w-full bg-gray-50 rounded-2xl p-4 mt-2">
                    <SummaryRow label="Product" value={product.name} />
                    <SummaryRow label="Company" value={provider.name} />
                    <SummaryRow label="Amount" value={`K${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
                    {units != null && <SummaryRow label="Units Acquired" value={units.toLocaleString(undefined, { maximumFractionDigits: 2 })} />}
                    <SummaryRow label="Method" value={methodLabel} />
                    <SummaryRow label="Reference" value={reference} mono last />
                </div>
            </div>

            <div className="shrink-0 pb-6 flex flex-col gap-2.5">
                <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="w-full h-12 border border-gray-200 rounded-xl flex items-center justify-center gap-2 active:bg-gray-50 transition-colors disabled:opacity-60"
                >
                    {downloading ? <Loader2 size={16} className="animate-spin text-gray-500" /> : <Download size={16} className="text-gray-700" />}
                    <span className="text-gray-800 text-sm font-bold font-['DM_Sans']">Download Certificate of Deposit</span>
                </button>
                <button
                    onClick={onClose}
                    className="w-full h-12 bg-black rounded-xl flex items-center justify-center active:opacity-80 transition-opacity"
                >
                    <span className="text-white text-sm font-bold font-['DM_Sans']">Done</span>
                </button>
            </div>
        </div>
    );
};

const SummaryRow: React.FC<{ label: string; value: string; mono?: boolean; last?: boolean }> = ({ label, value, mono, last }) => (
    <div className={`flex items-center justify-between py-2 ${last ? '' : 'border-b border-gray-100'}`}>
        <span className="text-gray-500 text-xs font-['DM_Sans']">{label}</span>
        <span className={`text-black text-xs font-bold font-['DM_Sans'] text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
);

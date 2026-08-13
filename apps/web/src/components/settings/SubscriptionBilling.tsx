import React, { useState, useEffect, useCallback } from 'react';
import {
    CreditCard, ArrowUpCircle,
    ChevronRight, CheckCircle2, Clock, AlertCircle, RefreshCw, Zap, MoreVertical, FileText,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { InvoicePaymentModal } from './InvoicePaymentModal';

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

// ── Types ──────────────────────────────────────────────────────────────────────

interface Plan {
    id: string;
    name: string;
    price_zmw: number;
    max_members: number | null;
}

interface Subscription {
    id: string;
    plan_id: string;
    plan: Plan;
    status: string;
    current_period_start: string;
    current_period_end: string;
    fee_credits_zmw: number;
    auto_pay_enabled: boolean;
    amountDue: number;
    daysLeft: number;
    totalDays: number;
    periodPercent: number;
}

interface Invoice {
    id: string;
    invoice_number: string;
    period_start: string;
    period_end: string;
    gross_zmw: number;
    credits_zmw: number;
    net_zmw: number;
    status: 'pending' | 'paid' | 'voided' | 'free';
    due_date: string;
    paid_at: string | null;
    paid_via: string | null;
    created_at: string;
}

interface FeeCredit {
    amount_zmw: number;
    created_at: string;
    source_type: string;
    reference: string;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: Invoice['status'] }> = ({ status }) => {
    const cfg: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
        paid:    { label: 'Paid',    cls: 'bg-lime-50 text-green-800',   icon: <CheckCircle2 size={9} className="text-green-700" /> },
        free:    { label: 'Free',    cls: 'bg-blue-50 text-blue-700',    icon: <Zap size={9} className="text-blue-600" /> },
        pending: { label: 'Pending', cls: 'bg-red-50 text-red-700',      icon: <Clock size={9} className="text-red-500" /> },
        voided:  { label: 'Voided', cls: 'bg-gray-100 text-gray-500',   icon: <AlertCircle size={9} className="text-gray-400" /> },
    };
    const c = cfg[status] || cfg.pending;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold ${c.cls}`}>
            {c.icon}{c.label}
        </span>
    );
};

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
function formatShort(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function sourceLabel(s: string) {
    return ({ PAYMENT_LINK: 'Payment Link', QUICK_LINK: 'Quick Link', DIRECT_DEPOSIT: 'Direct Deposit', OTHER: 'Other' })[s] || s;
}

// ── Receipt download (client-side PDF via canvas/print) ───────────────────────

async function downloadInvoice(invoice: Invoice) {
    const w = window.open('', '_blank', 'width=640,height=860');
    if (!w) return;
    const statusText = invoice.status === 'free' ? 'PAID (via Fee Credits)'
        : invoice.status === 'paid' ? 'PAID'
        : invoice.status === 'pending' ? 'PENDING'
        : invoice.status.toUpperCase();
    const isPaid = invoice.status === 'paid' || invoice.status === 'free';
    const generatedOn = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    w.document.write(`
        <!DOCTYPE html><html><head>
        <title>Invoice ${invoice.invoice_number}</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: system-ui, -apple-system, sans-serif; background: #fff; color: #111; padding: 56px 48px; max-width: 640px; margin: 0 auto; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
            .brand { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; color: #00347C; }
            .brand-sub { font-size: 11px; color: #888; margin-top: 2px; }
            .invoice-label { text-align: right; }
            .invoice-label .tag { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #888; }
            .invoice-label .num { font-size: 18px; font-weight: 800; color: #111; margin-top: 2px; }
            .status-pill { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700;
                background: ${isPaid ? '#eff6ff' : '#fef9c3'};
                color: ${isPaid ? '#1d4ed8' : '#854d0e'}; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 0; margin-bottom: 36px; padding: 20px; background: #f8faff; border-radius: 12px; }
            .meta-item { display: flex; flex-direction: column; gap: 2px; }
            .meta-item .key { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
            .meta-item .val { font-size: 13px; font-weight: 600; color: #111; }
            .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #888; margin-bottom: 12px; }
            .line { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
            .line .desc { color: #444; }
            .line .amt { font-weight: 600; color: #111; }
            .line.credit .desc { color: #444; }
            .line.credit .amt { color: #111; }
            .divider { border: none; border-top: 1.5px solid #111; margin: 16px 0; }
            .total-line { display: flex; justify-content: space-between; align-items: center; padding: 14px 0 0; font-size: 18px; font-weight: 800; }
            .total-line .label { color: #111; }
            .total-line .amt { color: #00347C; }
            .footer { margin-top: 56px; padding-top: 20px; border-top: 1px solid #eee; font-size: 11px; color: #aaa; text-align: center; line-height: 1.6; }
            .print-btn { margin-top: 32px; display: block; width: 100%; padding: 12px; background: #00347C; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; }
            @media print { .print-btn { display: none; } body { padding: 32px; } }
        </style>
        </head><body>
        <div class="header">
            <div>
                <div class="brand">MoneyWise</div>
                <div class="brand-sub">Subscription Invoice</div>
            </div>
            <div class="invoice-label">
                <div class="tag">Invoice</div>
                <div class="num">${invoice.invoice_number}</div>
                <span class="status-pill">${statusText}</span>
            </div>
        </div>

        <div class="meta">
            <div class="meta-item">
                <span class="key">Billing Period</span>
                <span class="val">${formatShort(invoice.period_start)} – ${formatShort(invoice.period_end)}</span>
            </div>
            <div class="meta-item">
                <span class="key">Due Date</span>
                <span class="val">${formatDate(invoice.due_date)}</span>
            </div>
            <div class="meta-item" style="margin-top:12px">
                <span class="key">Plan</span>
                <span class="val">MoneyWise Premium</span>
            </div>
            <div class="meta-item" style="margin-top:12px">
                <span class="key">Generated On</span>
                <span class="val">${generatedOn}</span>
            </div>
            ${invoice.paid_at ? `
            <div class="meta-item" style="margin-top:12px">
                <span class="key">Paid On</span>
                <span class="val">${formatDate(invoice.paid_at)}</span>
            </div>` : ''}
        </div>

        <div class="section-title">Billing Summary</div>

        <div class="line">
            <span class="desc">Monthly Subscription (Premium)</span>
            <span class="amt">ZMW ${invoice.gross_zmw.toFixed(2)}</span>
        </div>
        ${invoice.credits_zmw > 0 ? `
        <div class="line credit">
            <span class="desc">Fee Credits Applied<br/><small style="font-size:10px;color:#888">Platform fees earned this period offset your subscription</small></span>
            <span class="amt">– ZMW ${invoice.credits_zmw.toFixed(2)}</span>
        </div>` : ''}

        <hr class="divider" />
        <div class="total-line">
            <span class="label">Balance Due</span>
            <span class="amt">ZMW ${invoice.net_zmw.toFixed(2)}</span>
        </div>

        <div class="footer">
            MoneyWise Pro &nbsp;·&nbsp; Powered by Blue Opus Software Technology<br/>
            This is an official subscription invoice. Keep for your records.
        </div>
        <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
        </body></html>
    `);
    w.document.close();
}

// ── Main Component ─────────────────────────────────────────────────────────────

export const SubscriptionBilling: React.FC = () => {
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [credits, setCredits] = useState<FeeCredit[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [showCredits, setShowCredits] = useState(false);
    const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await apiFetch('/billing/subscription');
            setSubscription(data.subscription);
            setInvoices(data.invoices || []);
            setCredits(data.credits || []);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleUpgrade = async () => {
        setActionLoading('upgrade');
        try {
            await apiFetch('/billing/upgrade', { method: 'POST' });
            await load();
        } catch (e: any) { alert(e.message); }
        finally { setActionLoading(null); }
    };

    const handleDowngrade = async () => {
        if (!confirm('Downgrade to Free? You will lose team member access at end of current period.')) return;
        setActionLoading('downgrade');
        try {
            await apiFetch('/billing/downgrade', { method: 'POST' });
            await load();
        } catch (e: any) { alert(e.message); }
        finally { setActionLoading(null); }
    };


    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="flex flex-col items-center gap-3 text-gray-400">
                    <RefreshCw size={28} className="animate-spin" />
                    <span className="text-sm">Loading billing info…</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center py-24 gap-4 text-center">
                <AlertCircle size={32} className="text-red-400" />
                <p className="text-sm text-red-500">{error}</p>
                <button onClick={load} className="text-xs text-blue-600 underline">Retry</button>
            </div>
        );
    }

    if (!subscription) return null;

    const isPremium = subscription.plan_id === 'premium';
    const creditsPct = Math.min(100, (subscription.fee_credits_zmw / 250) * 100);
    const periodPct = subscription.periodPercent;
    const nextPaymentDate = formatDate(subscription.current_period_end);

    return (
        <>
        <div className="self-stretch flex-1 p-5 rounded-2xl outline outline-[1.5px] outline-offset-[-1.5px] outline-zinc-100 flex flex-col gap-6 min-h-0">

            {/* ── Section: Usage & Billing ───────────────────────────────────── */}
            <div className="flex flex-col gap-3">
                <h2 className="text-black text-lg font-bold font-['Hanken_Grotesk'] leading-6">Usage &amp; Billing</h2>

                <div className="flex flex-col lg:flex-row gap-4">

                    {/* Current Plan card */}
                    <div className="flex-1 p-6 bg-white rounded-xl shadow-[0px_3px_4px_0px_rgba(0,0,0,0.15)] outline outline-1 outline-offset-[-1px] outline-zinc-100 flex flex-col gap-4 min-h-[192px]">
                        <div className="flex flex-col gap-3">
                            {/* Plan name + price */}
                            <div className="flex items-end gap-0.5">
                                <div className="flex flex-col gap-1 flex-1">
                                    <p className="text-neutral-700 text-xs font-light leading-4">You are currently subscribed to the</p>
                                    <p className="text-black text-3xl font-bold leading-7">
                                        {isPremium ? 'Premium' : 'Free'}
                                    </p>
                                </div>
                                {isPremium && (
                                    <div className="flex items-end gap-2">
                                        <span className="text-black text-3xl font-bold leading-7">ZMW250</span>
                                        <span className="text-black text-base font-light leading-6">/month</span>
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-3 h-7">
                                {!isPremium ? (
                                    <button
                                        onClick={handleUpgrade}
                                        disabled={actionLoading === 'upgrade'}
                                        className="px-3 py-1.5 bg-[#00347C] text-white rounded-md text-[10px] font-semibold flex items-center gap-1.5 shadow-sm hover:bg-[#002460] transition-colors disabled:opacity-60"
                                    >
                                        <ArrowUpCircle size={11} />
                                        {actionLoading === 'upgrade' ? 'Upgrading…' : 'Upgrade to Premium'}
                                    </button>
                                ) : (
                                    <>
                                        <button className="px-2.5 py-1.5 bg-white rounded-md shadow-[0px_1px_2px_0px_rgba(0,0,0,0.10)] outline outline-[0.5px] outline-zinc-100 text-[10px] font-normal hover:shadow-md transition-all">
                                            Adjust Plan
                                        </button>
                                        <button
                                            onClick={handleDowngrade}
                                            disabled={actionLoading === 'downgrade'}
                                            className="px-2.5 py-1.5 bg-white rounded-md shadow-[0px_1px_2px_0px_rgba(0,0,0,0.10)] outline outline-[0.5px] outline-zinc-100 text-[10px] font-normal hover:shadow-md transition-all disabled:opacity-60"
                                        >
                                            {actionLoading === 'downgrade' ? 'Processing…' : 'Downgrade'}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {isPremium && (
                            <div className="flex flex-col gap-1.5">
                                {/* Period progress */}
                                <div className="flex justify-between items-center">
                                    <span className="text-neutral-700 text-xs font-light leading-4">
                                        {subscription.daysLeft} Day{subscription.daysLeft !== 1 ? 's' : ''} Left
                                    </span>
                                    <span className="text-neutral-700 text-xs font-bold leading-4">{periodPct}%</span>
                                </div>
                                <div className="h-1.5 bg-[#E8EEF8] rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-[#0058DB] rounded-full transition-all duration-500"
                                        style={{ width: `${periodPct}%` }}
                                    />
                                </div>

                                {/* Fee credit progress */}
                                {subscription.fee_credits_zmw > 0 && (
                                    <div className="mt-1 flex flex-col gap-1">
                                        <div className="flex justify-between items-center">
                                            <span className="text-neutral-400 text-[10px] font-normal">
                                                Fee credits earned: ZMW {subscription.fee_credits_zmw.toFixed(2)} of ZMW 250
                                            </span>
                                            <span className="text-[10px] font-semibold text-[#0058DB]">
                                                –{creditsPct.toFixed(0)}%
                                            </span>
                                        </div>
                                        <div className="h-1.5 bg-[#E8EEF8] rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-[#0058DB]/40 rounded-full transition-all duration-500"
                                                style={{ width: `${creditsPct}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* See usage details */}
                                <button
                                    onClick={() => setShowCredits(v => !v)}
                                    className="flex items-center gap-1 mt-0.5 group"
                                >
                                    <span className="text-neutral-400 text-[10px] font-normal group-hover:text-neutral-600 transition-colors">
                                        {showCredits ? 'Hide usage details' : 'See usage details'}
                                    </span>
                                    <ChevronRight size={12} className={`text-neutral-500 transition-transform ${showCredits ? 'rotate-90' : ''}`} />
                                </button>
                            </div>
                        )}

                        {/* Free plan hint */}
                        {!isPremium && (
                            <p className="text-xs text-gray-400">
                                Free plan is limited to <strong>1 team member</strong>. Upgrade to add your team and unlock all features.
                            </p>
                        )}
                    </div>

                    {/* Next Payment card */}
                    {isPremium && (
                        <div className="flex-1 p-6 bg-white rounded-xl shadow-[0px_3px_4px_0px_rgba(0,0,0,0.15)] outline outline-1 outline-offset-[-1px] outline-zinc-100 flex flex-col gap-3 min-h-[192px]">
                            <div className="flex flex-col gap-2">
                                <p className="px-2.5 text-neutral-700 text-xs font-light leading-4">Next Payment</p>
                                <p className="px-2.5 text-black text-3xl font-bold leading-7">{nextPaymentDate}</p>
                            </div>

                            <div className="h-px bg-gray-200" />

                            <div className="pl-2.5 pr-1 py-1 flex flex-col gap-1.5">
                                <div className="flex justify-between items-center">
                                    <span className="text-neutral-700 text-xs font-normal">Amount Due</span>
                                    <span className="text-blue-600 text-sm font-bold">
                                        ZMW {subscription.amountDue.toFixed(2)}
                                    </span>
                                </div>
                                {subscription.fee_credits_zmw > 0 && (
                                    <p className="text-[10px] text-gray-500">
                                        ZMW {subscription.fee_credits_zmw.toFixed(2)} already covered by platform fees your customers paid this period.
                                    </p>
                                )}
                                {subscription.amountDue <= 0 && (
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <CheckCircle2 size={14} className="text-gray-400" />
                                        <span className="text-xs text-gray-600 font-medium">
                                            Subscription fully covered this month 🎉
                                        </span>
                                    </div>
                                )}
                                <div className="flex items-center gap-1.5 mt-1">
                                    <CreditCard size={12} className="text-gray-400" />
                                    <span className="text-xs text-neutral-500">Auto-deducted from MoneyWise wallet</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Fee credits detail panel */}
                {showCredits && credits.length > 0 && (
                    <div className="bg-white rounded-xl outline outline-1 outline-zinc-100 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-800">Fee Credits This Period</span>
                            <span className="text-xs text-[#111827] font-bold">
                                ZMW {credits.reduce((s, c) => s + c.amount_zmw, 0).toFixed(2)} total
                            </span>
                        </div>
                        <div className="divide-y divide-gray-50">
                            {credits.map((cr, i) => (
                                <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-medium text-gray-700">{sourceLabel(cr.source_type)}</p>
                                        <p className="text-[10px] text-gray-400 font-mono">{cr.reference}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-semibold text-[#111827]">+ZMW {cr.amount_zmw.toFixed(2)}</p>
                                        <p className="text-[10px] text-gray-400">{formatShort(cr.created_at)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {showCredits && credits.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">No fee credits recorded yet this period.</p>
                )}
            </div>

            {/* ── Section: Invoices & Payments ───────────────────────────────── */}
            <div className="flex-1 flex flex-col gap-3 min-h-0">
                <h2 className="text-black text-lg font-bold font-['Hanken_Grotesk'] leading-6 flex-shrink-0">Invoices &amp; Payments</h2>

                <div className="flex-1 bg-white rounded-xl outline outline-1 outline-zinc-100 overflow-hidden flex flex-col min-h-0">
                    {invoices.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <CreditCard size={28} className="text-gray-200 mb-3" />
                            <p className="text-sm font-medium text-gray-400">No invoices yet</p>
                            <p className="text-xs text-gray-300 mt-1">Your first invoice will appear here at the end of your billing period.</p>
                        </div>
                    ) : (
                        <>
                            {/* Header row */}
                            <div className="px-4 py-2.5 flex items-center border-b border-gray-100 bg-gray-50/60">
                                <span className="w-44 text-xs font-light text-black">Date of Invoice</span>
                                <span className="flex-1 text-xs font-light text-black">Invoice No.</span>
                                <span className="w-48 text-xs font-light text-black">Period</span>
                                <span className="w-28 text-xs font-light text-black">Amount</span>
                                <span className="w-24 text-xs font-light text-black">Status</span>
                                <span className="w-28" />
                            </div>
                            {/* Invoice rows */}
                            <div className="divide-y divide-gray-50 overflow-y-auto flex-1">
                                {invoices.map(inv => (
                                    <div key={inv.id} className="px-4 py-3 flex items-center hover:bg-gray-50/50 transition-colors">
                                        <span className="w-44 text-xs text-black font-light">{formatShort(inv.created_at)}</span>
                                        <span className="flex-1 text-xs text-black font-mono">{inv.invoice_number}</span>
                                        <span className="w-48 text-[10px] text-gray-500">
                                            {formatShort(inv.period_start)} – {formatShort(inv.period_end)}
                                        </span>
                                        <div className="w-28">
                                            <p className="text-xs font-bold text-black">ZMW {inv.net_zmw.toFixed(2)}</p>
                                            {inv.credits_zmw > 0 && (
                                                <p className="text-[9px] text-gray-500">–{inv.credits_zmw.toFixed(2)} credits</p>
                                            )}
                                        </div>
                                        <div className="w-24">
                                            <StatusBadge status={inv.status} />
                                        </div>
                                        <div className="w-28 flex items-center justify-end gap-2">
                                            {inv.status === 'pending' && (
                                                <button
                                                    onClick={() => setPayingInvoice(inv)}
                                                    className="px-2.5 py-1 bg-[#00347C] text-white rounded-md text-[9px] font-semibold hover:bg-[#002460] transition-colors"
                                                >
                                                    Pay Now
                                                </button>
                                            )}
                                            {/* Three-dot menu */}
                                            <div className="relative">
                                                <button
                                                    onClick={() => setOpenMenuId(openMenuId === inv.id ? null : inv.id)}
                                                    className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
                                                >
                                                    <MoreVertical size={14} />
                                                </button>
                                                {openMenuId === inv.id && (
                                                    <>
                                                        {/* Dismiss overlay */}
                                                        <div
                                                            className="fixed inset-0 z-10"
                                                            onClick={() => setOpenMenuId(null)}
                                                        />
                                                        <div className="absolute right-0 top-8 z-20 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 overflow-hidden">
                                                            <button
                                                                onClick={() => { downloadInvoice(inv); setOpenMenuId(null); }}
                                                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                                                            >
                                                                <FileText size={13} className="text-gray-400" />
                                                                Download Invoice
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>

        {/* Payment method modal */}
        {payingInvoice && (
            <InvoicePaymentModal
                invoiceId={payingInvoice.id}
                invoiceNumber={payingInvoice.invoice_number}
                amountDue={payingInvoice.net_zmw}
                onClose={() => setPayingInvoice(null)}
                onPaid={() => { setPayingInvoice(null); load(); }}
            />
        )}
        </>
    );
};

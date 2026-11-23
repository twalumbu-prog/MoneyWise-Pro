import React, { useState } from 'react';
import { Receipt } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import posthog from '../lib/posthog';

/**
 * Shown on the "payment successful" screen of a public pay page (pay link, store, quick pay). The person who just paid is looking at their
 * receipt, which is the best moment to offer a free MoneyWise account: it keeps their receipts and tracks their spending. It opens sign-up in
 * a new tab, so the receipt on this page stays where it is. Not shown to someone already signed in, and "Not now" hides it for the visit.
 * Every show, click and dismissal is counted (posthog) so the conversion can be measured.
 */
const HIDE_KEY = 'mw_receipt_card_hidden';
const readHidden = () => { try { return sessionStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } };

export const SaveReceiptCard: React.FC<{ businessName: string; source: 'payment_link' | 'store' | 'quick_pay'; className?: string; compact?: boolean }> = ({ businessName, source, className = '', compact = false }) => {
    const { user } = useAuth();
    const [hidden, setHidden] = useState(readHidden);
    const shown = React.useRef(false);
    if (user || hidden) return null;
    if (!shown.current) { shown.current = true; try { posthog.capture('receipt_signup_shown', { source, business: businessName }); } catch { /* analytics never blocks the page */ } }

    const href = '/login?signup=1&type=individual';
    if (compact) {
        // One short row for a fixed-height screen.
        return (
            <div className={`flex items-center justify-between gap-3 rounded-xl border border-[#DBE6FB] bg-[#F4F8FF] px-3.5 py-2.5 ${className}`}>
                <p className="min-w-0 text-[12px] font-semibold leading-snug text-slate-700">Keep your receipts and track your spending</p>
                <div className="flex flex-shrink-0 items-center gap-2.5">
                    <a href={href} target="_blank" rel="noopener noreferrer"
                        onClick={() => { try { posthog.capture('receipt_signup_click', { source, business: businessName }); } catch { /* ignore */ } }}
                        className="rounded-lg bg-[#0B57D0] px-3 py-1.5 text-[11px] font-bold text-white">Create free account</a>
                    <button type="button" aria-label="Not now" className="text-[11px] font-semibold text-slate-400"
                        onClick={() => { setHidden(true); try { sessionStorage.setItem(HIDE_KEY, '1'); posthog.capture('receipt_signup_dismissed', { source, business: businessName }); } catch { /* ignore */ } }}>Not now</button>
                </div>
            </div>
        );
    }
    return (
        <div className={`rounded-2xl border border-[#DBE6FB] bg-[#F4F8FF] px-5 py-4 ${className}`}>
            <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#E8F0FE] text-[#0B57D0]"><Receipt size={18} /></div>
                <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">Keep this receipt</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                        Create a free MoneyWise account to keep your receipts from {businessName || 'this business'}, see where your money goes, and pay faster next time.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                        <a href={href} target="_blank" rel="noopener noreferrer"
                            onClick={() => { try { posthog.capture('receipt_signup_click', { source, business: businessName }); } catch { /* ignore */ } }}
                            className="rounded-xl bg-[#0B57D0] px-4 py-2 text-xs font-bold text-white hover:bg-[#0A4DBA]">Create free account</a>
                        <button type="button" className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                            onClick={() => { setHidden(true); try { sessionStorage.setItem(HIDE_KEY, '1'); posthog.capture('receipt_signup_dismissed', { source, business: businessName }); } catch { /* ignore */ } }}>Not now</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

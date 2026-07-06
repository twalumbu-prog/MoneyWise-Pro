import React, { useMemo } from 'react';
import { Loader2, X } from 'lucide-react';

/**
 * Premium payment-processing screen for the own-UX mobile money checkout
 * (Collections API). Faithful implementation of the Transfer Loading design
 * handoff v2: a single breathing status orb with a thin rotating spinner arc, a
 * per-phase heading, and a contextual panel that swaps per phase —
 * initiating → confirm → polling → success (and failed).
 *
 * Phases are driven by real backend events (see the parent's handlePayMobileMoney):
 * `initiating` while the intent + collection calls run, `confirm` right after the
 * USSD prompt is dispatched, `polling` for the remainder of the wait, then
 * `success`/`failed` from the real status. The confirm→polling split is a short
 * cosmetic pass mirroring the design's own timing (the handoff frames polling
 * copy as reassurance, not literal progress).
 *
 * Brand substitution per the handoff: accent is our #006AFF instead of #2563EB,
 * and type stays on our existing DM Sans stack. Slow-network notice is folded
 * into the polling reassurance rotation as requested.
 */

const ACCENT = '#006AFF';

const STYLE_ID = 'mw-pay-wait-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = `
@keyframes mwpw-breathe { 0%,100%{transform:scale(1)} 50%{transform:scale(1.045)} }
@keyframes mwpw-spin { to{transform:rotate(360deg)} }
@keyframes mwpw-rise { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
@keyframes mwpw-barslide { from{transform:translateX(-100%)} to{transform:translateX(250%)} }
@keyframes mwpw-attn { 0%,100%{box-shadow:0 0 0 0 rgba(0,106,255,.22)} 50%{box-shadow:0 0 0 7px rgba(0,106,255,0)} }
@keyframes mwpw-blink { 0%,100%{opacity:.2} 50%{opacity:1} }
@keyframes mwpw-popin { 0%{transform:scale(0);opacity:0} 62%{transform:scale(1.14)} 100%{transform:scale(1);opacity:1} }
@keyframes mwpw-draw { to{stroke-dashoffset:0} }
@keyframes mwpw-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }
@keyframes mwpw-pulsering { 0%{transform:scale(.72);opacity:.5} 70%{opacity:0} 100%{transform:scale(2.15);opacity:0} }
`;
    document.head.appendChild(el);
}

function maskPhone(phone: string): string {
    const clean = (phone || '').replace(/[^0-9]/g, '');
    if (clean.length < 7) return phone;
    return `${clean.slice(0, 3)} ••• ${clean.slice(-4)}`;
}

function fmtAmount(n: number): string {
    return `K${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export type PaymentPhase = 'initiating' | 'confirm' | 'polling' | 'success' | 'failed';

interface PaymentWaitingScreenProps {
    phase: PaymentPhase;
    amount: number;
    businessName: string;
    payerPhone: string;
    operator: string | null;
    isSlowNetwork: boolean;
    elapsedSeconds: number;
    reference?: string | null;
    failureIsDeclined?: boolean;
    failureReason?: string;
    cancelling: boolean;
    onCancel: () => void;      // polling: stop waiting on this screen
    onRetry?: () => void;      // failed: start over
    onDismiss?: () => void;    // failed: leave the flow
    onDone?: () => void;       // success: view the receipt
}

const primaryBtnClass =
    'w-full py-3.5 rounded-[14px] text-[15px] font-bold text-white transition-all';
const ghostBtnClass =
    'w-full py-3 rounded-[14px] text-sm font-semibold text-slate-500 border border-slate-200 bg-white transition-all hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center gap-2';

export const PaymentWaitingScreen: React.FC<PaymentWaitingScreenProps> = ({
    phase,
    amount,
    businessName,
    payerPhone,
    operator,
    isSlowNetwork,
    elapsedSeconds,
    reference,
    failureIsDeclined,
    failureReason,
    cancelling,
    onCancel,
    onRetry,
    onDismiss,
    onDone,
}) => {
    const opLabel = operator ? operator.toUpperCase() : 'MOBILE MONEY';
    const showSpinner = phase !== 'success' && phase !== 'failed';

    // Polling reassurance copy rotates every second; the slow-network note is
    // folded into the rotation when the latency probe flagged the connection.
    const pollingSub = useMemo(() => {
        const tips = ['Verifying with the network…', 'Confirming your payment…', 'Almost there…'];
        if (isSlowNetwork) tips.push('Your connection seems slow — hang on, we’re still checking…');
        return tips[Math.max(0, Math.floor(elapsedSeconds)) % tips.length];
    }, [elapsedSeconds, isSlowNetwork]);

    const { title, sub } = useMemo(() => {
        switch (phase) {
            case 'initiating':
                return { title: 'Setting up your payment', sub: `Securely reaching ${opLabel}…` };
            case 'confirm':
                return { title: 'Approve on your phone', sub: `Open the prompt on ${maskPhone(payerPhone)} and enter your PIN to approve.` };
            case 'polling':
                return { title: 'Confirming your payment', sub: pollingSub };
            case 'success':
                return { title: 'Payment successful', sub: `${fmtAmount(amount)} paid to ${businessName}.` };
            case 'failed':
                return failureIsDeclined
                    ? { title: 'Payment not completed', sub: 'The prompt wasn’t approved in time. Nothing has been charged.' }
                    : { title: 'Not confirmed yet', sub: failureReason || 'We haven’t received confirmation. If you approved it, it may still complete — please check with the business.' };
        }
    }, [phase, opLabel, payerPhone, pollingSub, amount, businessName, failureIsDeclined, failureReason]);

    // The panel height differs a lot per phase (a tall USSD card vs. a thin progress
    // bar), so this component must fill the full height of whatever fixed-height
    // frame its page wraps it in (matching the design's own fixed-screen technique)
    // — flex-1 + min-h-0 lets it stretch to that frame's real height rather than a
    // hardcoded pixel value, so the bottom panel pins to the actual screen bottom
    // instead of the middle of an arbitrary box.
    const handleDismiss = () => {
        if (phase === 'success') onDone?.();
        else if (phase === 'failed') onDismiss?.();
        else onCancel();
    };

    return (
        <div className="flex flex-1 flex-col min-h-0 px-6 pb-6">
            {/* Header — centered "Send money" label + dismiss */}
            <div className="flex items-center justify-between pt-2 pb-4">
                <span style={{ width: 34, height: 34 }} />
                <span className="text-sm font-bold" style={{ color: '#4A5361', letterSpacing: '.3px' }}>Send money</span>
                <button
                    onClick={handleDismiss}
                    className="flex items-center justify-center rounded-full transition-colors hover:bg-slate-200"
                    style={{ width: 34, height: 34, background: '#F3F5F8', color: '#9AA2AE' }}
                >
                    <X size={14} />
                </button>
            </div>

            {/* Status orb */}
            <div className="mx-auto flex items-center justify-center" style={{ width: 320, height: 132 }}>
                <div className="relative" style={{ width: 92, height: 92 }}>
                    {showSpinner && (
                        <svg width="92" height="92" viewBox="0 0 92 92" style={{ position: 'absolute', inset: 0, zIndex: 2, animation: 'mwpw-spin 1.4s linear infinite', transformOrigin: '46px 46px' }}>
                            <circle cx="46" cy="46" r="41" fill="none" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="60 198" />
                        </svg>
                    )}
                    <div
                        className="flex items-center justify-center"
                        style={{ width: 92, height: 92, borderRadius: '50%', background: '#F7F8FA', border: '1px solid #ECEEF1', animation: 'mwpw-breathe 3.2s ease-in-out infinite', position: 'relative', zIndex: 1 }}
                    >
                        <span className="font-bold" style={{ fontSize: 12, color: '#AEB4BE', letterSpacing: '.3px' }}>ZMW</span>
                    </div>

                    {/* Success badge — blue pop-in with a drawn checkmark (no shadow, no sparkles) */}
                    {phase === 'success' && (
                        <div
                            className="flex items-center justify-center"
                            style={{ position: 'absolute', inset: -3, borderRadius: '50%', background: ACCENT, zIndex: 3, animation: 'mwpw-popin .5s cubic-bezier(.2,.9,.3,1.3) both' }}
                        >
                            <svg width="34" height="34" viewBox="0 0 34 34">
                                <path d="M9 17.5 L15 23.5 L25.5 12" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="30" strokeDashoffset="30" style={{ animation: 'mwpw-draw .45s .2s ease forwards' }} />
                            </svg>
                        </div>
                    )}

                    {/* Failure badge — red pop-in + shake with an X */}
                    {phase === 'failed' && (
                        <div
                            className="flex items-center justify-center"
                            style={{ position: 'absolute', inset: -3, borderRadius: '50%', background: '#E5484D', zIndex: 3, animation: 'mwpw-popin .45s cubic-bezier(.2,.9,.3,1.3) both, mwpw-shake .5s .3s ease' }}
                        >
                            <svg width="30" height="30" viewBox="0 0 30 30">
                                <path d="M9 9 L21 21 M21 9 L9 21" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
                            </svg>
                        </div>
                    )}
                </div>
            </div>

            {/* Heading */}
            <div className="mt-5 text-center" style={{ minHeight: 52 }}>
                <h3 className="text-[20px] font-extrabold text-slate-900" style={{ letterSpacing: '-.3px' }}>{title}</h3>
                <p className="mx-auto mt-1.5 max-w-[290px] text-[13.5px] leading-relaxed text-slate-500">{sub}</p>
            </div>

            {/* Contextual panel — swaps per phase, enters with a rise+fade. flex-1 +
                justify-end is what pins it to the bottom of the fixed-height frame
                above, regardless of how tall this phase's own content is. */}
            <div className="flex flex-1 flex-col justify-end" style={{ minHeight: 0 }}>

                {phase === 'initiating' && (
                    <div style={{ animation: 'mwpw-rise .45s ease both' }}>
                        <div className="relative overflow-hidden" style={{ height: 6, borderRadius: 6, background: '#EEF1F5' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '40%', height: '100%', borderRadius: 6, background: ACCENT, animation: 'mwpw-barslide 1.3s linear infinite' }} />
                        </div>
                        <div className="mt-3.5 flex items-center justify-center gap-1.5 text-[12.5px] font-semibold" style={{ color: '#9AA2AE' }}>
                            <svg width="13" height="13" viewBox="0 0 13 13"><rect x="2.5" y="6" width="8" height="5.5" rx="1.2" fill="#9AA2AE" /><path d="M4 6 V4.2 a2.5 2.5 0 0 1 5 0 V6" fill="none" stroke="#9AA2AE" strokeWidth="1.3" /></svg>
                            Encrypted &amp; secured
                        </div>
                    </div>
                )}

                {phase === 'confirm' && (
                    <div style={{ animation: 'mwpw-rise .45s ease both' }}>
                        <div
                            style={{ borderRadius: 16, background: '#F7F8FA', border: '1.5px solid #DCE6FB', padding: '15px 16px', animation: 'mwpw-attn 2s ease-in-out infinite', fontFamily: 'ui-monospace, Menlo, monospace' }}
                        >
                            <div className="mb-2.5 flex items-center gap-1.5" style={{ fontSize: 10.5, letterSpacing: '.4px', color: '#9AA2AE' }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, animation: 'mwpw-blink 1.2s infinite' }} />
                                {opLabel} · MOBILE MONEY
                            </div>
                            <div style={{ fontSize: 12.5, color: '#3A424E', lineHeight: 1.7 }}>
                                Pay<br />
                                Amount: <span style={{ color: '#0B0F14' }}>{fmtAmount(amount)}</span><br />
                                To: {businessName}<br />
                                Enter PIN to confirm:
                            </div>
                            <div className="mt-2" style={{ fontSize: 16, letterSpacing: 5, color: '#0B0F14' }}>
                                ● ● ● <span style={{ display: 'inline-block', width: 9, height: 17, background: ACCENT, verticalAlign: -3, animation: 'mwpw-blink 1s step-end infinite' }} />
                            </div>
                        </div>
                        <div className="mt-3.5 flex items-center justify-center gap-2 text-[13px] font-semibold" style={{ color: ACCENT }}>
                            <span style={{ position: 'relative', width: 8, height: 8, borderRadius: '50%', background: ACCENT, animation: 'mwpw-pulsering 1.6s ease-out infinite' }} />
                            Waiting for your approval on your phone
                        </div>
                    </div>
                )}

                {phase === 'polling' && (
                    <div style={{ animation: 'mwpw-rise .45s ease both' }}>
                        <div className="relative overflow-hidden" style={{ height: 6, borderRadius: 6, background: '#EEF1F5' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '40%', height: '100%', borderRadius: 6, background: ACCENT, animation: 'mwpw-barslide 1.15s linear infinite' }} />
                        </div>
                        <p className="mt-3.5 text-center text-[12.5px] font-medium leading-normal" style={{ color: '#9AA2AE' }}>
                            Keep this screen open — it updates automatically.
                        </p>
                        <button onClick={onCancel} disabled={cancelling} className={`mt-3 ${ghostBtnClass}`}>
                            {cancelling ? <Loader2 size={13} className="animate-spin" /> : null}
                            {cancelling ? 'Cancelling…' : 'Cancel payment'}
                        </button>
                        <p className="mx-auto mt-2 max-w-[250px] text-center text-[10px] font-medium leading-relaxed text-slate-300">
                            Stops waiting here. If a prompt still arrives and you approve it, the payment will still complete automatically.
                        </p>
                    </div>
                )}

                {phase === 'success' && (
                    <div style={{ animation: 'mwpw-rise .45s ease both' }}>
                        <div style={{ borderRadius: 16, background: '#F4F8FF', border: '1px solid #DBE6FB', padding: 16 }}>
                            <div className="flex justify-between py-1.5 text-[13px]"><span style={{ color: '#6B7480' }}>Amount</span><span className="font-bold" style={{ color: '#0B0F14' }}>{fmtAmount(amount)}</span></div>
                            <div className="flex justify-between py-1.5 text-[13px]" style={{ borderTop: '1px solid #E7EEFA' }}><span style={{ color: '#6B7480' }}>Paid to</span><span className="font-bold" style={{ color: '#0B0F14' }}>{businessName}</span></div>
                            <div className="flex justify-between py-1.5 text-[13px]" style={{ borderTop: '1px solid #E7EEFA' }}><span style={{ color: '#6B7480' }}>Reference</span><span className="font-bold" style={{ color: '#0B0F14', fontFamily: 'ui-monospace, Menlo, monospace' }}>{reference ? `#${reference}` : '—'}</span></div>
                        </div>
                        <button onClick={onDone} className={`mt-3 ${primaryBtnClass}`} style={{ background: ACCENT, boxShadow: `0 10px 22px ${ACCENT}44` }}>
                            View receipt
                        </button>
                    </div>
                )}

                {phase === 'failed' && (
                    <div style={{ animation: 'mwpw-rise .45s ease both' }}>
                        {failureIsDeclined ? (
                            <div className="flex items-center gap-2.5" style={{ borderRadius: 16, background: '#FEF6F6', border: '1px solid #F5DADB', padding: '14px 16px' }}>
                                <svg width="18" height="18" viewBox="0 0 18 18" className="flex-shrink-0"><circle cx="9" cy="9" r="8" fill="none" stroke="#E5484D" strokeWidth="1.5" /><path d="M9 4.5 V10" stroke="#E5484D" strokeWidth="1.6" strokeLinecap="round" /><circle cx="9" cy="13" r="1" fill="#E5484D" /></svg>
                                <span className="text-[13px] font-semibold" style={{ color: '#8A3B3E' }}>No money has left your wallet.</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2.5" style={{ borderRadius: 16, background: '#FFF8EF', border: '1px solid #F5E4CE', padding: '14px 16px' }}>
                                <svg width="18" height="18" viewBox="0 0 18 18" className="flex-shrink-0"><circle cx="9" cy="9" r="8" fill="none" stroke="#B77A1C" strokeWidth="1.5" /><path d="M9 4.5 V10" stroke="#B77A1C" strokeWidth="1.6" strokeLinecap="round" /><circle cx="9" cy="13" r="1" fill="#B77A1C" /></svg>
                                <span className="text-[13px] font-semibold leading-snug" style={{ color: '#8A5A1C' }}>If you approved the prompt, the payment may still complete. Please check with the business before paying again.</span>
                            </div>
                        )}
                        <button onClick={onRetry} className={`mt-3 ${primaryBtnClass}`} style={{ background: ACCENT, boxShadow: `0 10px 22px ${ACCENT}44` }}>
                            Try again
                        </button>
                        <button onClick={onDismiss} className={`mt-2.5 ${ghostBtnClass}`}>Cancel</button>
                    </div>
                )}
            </div>
        </div>
    );
};

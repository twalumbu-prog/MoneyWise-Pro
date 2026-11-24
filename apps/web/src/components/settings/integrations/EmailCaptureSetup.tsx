import React, { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { captureApi } from '../../capture/captureApi';

const STEPS: { name: string; steps: string[] }[] = [
    { name: 'Gmail', steps: ['Open Settings → See all settings → Forwarding and POP/IMAP.', 'Add this address as a forwarding address. Gmail sends a confirmation code, which appears on this card within a minute.', 'Under Filters, create a filter for receipts and invoices, then choose Forward it to this address.'] },
    { name: 'Outlook', steps: ['Open Settings → Mail → Rules.', 'Add a rule for receipts and invoices.', 'Choose Forward to, then paste this address.'] },
];

/** The forwarding address, setup steps, and a test that turns the card green when the first email arrives. */
export const EmailCaptureSetup: React.FC = () => {
    const [address, setAddress] = useState<string | null>(null);
    const [lastReceivedAt, setLastReceivedAt] = useState<string | null>(null);
    const [gmailConfirmation, setGmailConfirmation] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [testing, setTesting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        try { const r = await captureApi.emailStatus(); setAddress(r.address); setLastReceivedAt(r.lastReceivedAt); setGmailConfirmation(r.gmailConfirmation); }
        catch (e: any) { setError(e?.message || 'Could not load your capture address'); }
    };
    useEffect(() => { load(); }, []);
    useEffect(() => {
        if (!testing) return;
        const t = setInterval(load, 4000);
        const stop = setTimeout(() => setTesting(false), 60_000);
        return () => { clearInterval(t); clearTimeout(stop); };
    }, [testing]);

    const test = async () => {
        setError(null);
        try { await captureApi.sendTestEmail(); setTesting(true); }
        catch (e: any) { setError(e?.message || 'Could not send the test email'); }
    };
    const copy = async () => {
        if (!address) return;
        await navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className={`p-5 bg-white border rounded-2xl space-y-3 ${lastReceivedAt ? 'border-emerald-300' : 'border-gray-200'}`}>
            <div>
                <div className="font-bold text-gray-900">Email forwarding</div>
                <div className="text-sm text-gray-500">Forward receipts and invoices to your address and they appear as drafts.</div>
            </div>
            {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
            {address && (
                <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
                    <span className="flex-1 min-w-0 truncate font-mono text-sm text-gray-800">{address}</span>
                    <button onClick={copy} className="text-[#006AFF]" aria-label="Copy address">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
                </div>
            )}
            {gmailConfirmation && (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-xs text-gray-700 whitespace-pre-wrap">
                    <div className="font-semibold text-brand-navy mb-1">Gmail's confirmation message</div>
                    {gmailConfirmation}
                </div>
            )}
            {STEPS.map(s => (
                <details key={s.name} className="text-sm text-gray-600">
                    <summary className="cursor-pointer font-semibold text-gray-800">{s.name} steps</summary>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">{s.steps.map(step => <li key={step}>{step}</li>)}</ol>
                </details>
            ))}
            <div className="flex items-center gap-3">
                <button onClick={test} disabled={!address || testing} className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#006AFF] text-white disabled:opacity-40">
                    {testing ? 'Waiting for the email…' : 'Send test email'}
                </button>
                {lastReceivedAt && <span className="text-xs font-semibold text-emerald-700">Working. Last email {new Date(lastReceivedAt).toLocaleString('en-ZM', { dateStyle: 'short', timeStyle: 'short' })}</span>}
            </div>
        </div>
    );
};

import React, { useEffect, useState } from 'react';
import { apiJson } from 'core';
import { ArrowLeft, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';

interface EmailConnection {
    id: string;
    email_address: string;
    status: 'ACTIVE' | 'EXPIRED' | 'ERROR' | string;
    last_error?: string | null;
    last_synced_at?: string | null;
}

interface GmailStatus { configured: boolean; connections: EmailConnection[] }

/** Gmail's multicolour "M" on a white tile — same footprint as IntegrationLogo. */
export const GmailLogo: React.FC<{ size?: number; className?: string }> = ({ size = 40, className = '' }) => (
    <div className={`rounded-xl bg-white border border-gray-100 flex items-center justify-center shrink-0 shadow-sm ${className}`} style={{ height: size, width: size }}>
        <svg viewBox="52 42 88 66" width={size * 0.58} height={size * 0.58} aria-label="Gmail">
            <path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6" />
            <path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15" />
            <path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2" />
            <path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92" />
            <path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2" />
        </svg>
    </div>
);

const timeAgo = (iso?: string | null) => {
    if (!iso) return 'not yet';
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    return hrs < 24 ? `${hrs} h ago` : new Date(iso).toLocaleDateString();
};

export const GmailIntegration: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [status, setStatus] = useState<GmailStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const load = async () => {
        try {
            setStatus(await apiJson<GmailStatus>('/integrations/gmail/status'));
        } catch (e: any) {
            setError(e?.message || 'Could not load Gmail connections');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Result of the Google redirect (…/settings?tab=integrations&integration=gmail&gmail=connected|error).
        const params = new URLSearchParams(window.location.search);
        const result = params.get('gmail');
        if (result === 'connected') setNotice(`Connected ${params.get('gmail_email') || 'your mailbox'}. New emails are checked every few minutes.`);
        if (result === 'error') setError(params.get('gmail_message') || 'Gmail connection failed');
        if (result) {
            ['gmail', 'gmail_email', 'gmail_message'].forEach(k => params.delete(k));
            const qs = params.toString();
            window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
        }
        load();
    }, []);

    const connect = async () => {
        setBusy('connect'); setError(null);
        try {
            const r = await apiJson<{ url: string }>('/integrations/gmail/connect');
            window.location.href = r.url;
        } catch (e: any) {
            setError(e?.message || 'Could not start the connection');
            setBusy(null);
        }
    };

    const disconnect = async (id: string) => {
        setBusy(id);
        try {
            await apiJson(`/integrations/gmail/${id}`, { method: 'DELETE' });
            setNotice(null);
            await load();
        } catch (e: any) {
            setError(e?.message || 'Could not disconnect');
        } finally {
            setBusy(null);
        }
    };

    const configured = !!status?.configured;
    const conns = status?.connections || [];

    return (
        <div className="space-y-6">
            <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
                <ArrowLeft className="h-4 w-4" /> Back to integrations
            </button>
            <div>
                <h3 className="text-lg font-bold text-brand-navy">Gmail</h3>
                <p className="text-sm text-gray-500">Connect your business mailbox so MoneyWise can pick out receipts, invoices and payment emails for you to approve. MoneyWise only reads your email; it never sends, deletes or changes anything.</p>
            </div>

            {!loading && !configured && (
                <div className="flex gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <div>Not configured yet. Gmail connections are being set up with Google and will be available soon.</div>
                </div>
            )}
            {notice && (
                <div className="flex gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
                    <CheckCircle2 className="h-5 w-5 shrink-0" /> <div>{notice}</div>
                </div>
            )}
            {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

            <div className="p-5 bg-white border border-gray-200 rounded-2xl">
                <div className="flex items-center gap-4">
                    <GmailLogo size={40} />
                    <div className="flex-1 min-w-0">
                        <div className="font-bold text-gray-900">Gmail or Google Workspace</div>
                        <div className="text-sm text-gray-500">Sign in with Google and tick the Gmail permission.</div>
                    </div>
                    <button
                        onClick={connect}
                        disabled={!configured || busy === 'connect'}
                        className="px-4 py-2 rounded-xl text-sm font-semibold bg-brand-navy text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {busy === 'connect' ? 'Opening Google…' : conns.length ? 'Add another' : 'Connect with Google'}
                    </button>
                </div>
                {conns.map(c => (
                    <div key={c.id} className="mt-3 flex items-center justify-between gap-3 text-sm bg-gray-50 rounded-xl px-3 py-2">
                        <div className="min-w-0">
                            <div className="text-gray-800 truncate">{c.email_address}</div>
                            <div className={c.status === 'ACTIVE' ? 'text-gray-500' : 'text-amber-700'}>
                                {c.status === 'ACTIVE' ? `Last checked ${timeAgo(c.last_synced_at)}` : c.status === 'EXPIRED' ? 'Access expired. Connect again to resume.' : c.last_error || c.status.toLowerCase()}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {c.status === 'EXPIRED' && configured && (
                                <button onClick={connect} className="text-xs font-semibold text-brand-navy hover:underline">Reconnect</button>
                            )}
                            <button onClick={() => disconnect(c.id)} disabled={busy === c.id} className="text-gray-400 hover:text-red-600" aria-label="Disconnect">
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

import React, { useEffect, useState } from 'react';
import { apiJson } from 'core';
import { ArrowLeft, MessageCircle, Facebook, Instagram, AlertCircle, Trash2 } from 'lucide-react';

interface Connection {
    id: string;
    platform: 'WHATSAPP' | 'FACEBOOK' | 'INSTAGRAM';
    display_name?: string | null;
    display_phone?: string | null;
    status: string;
    last_message_at?: string | null;
}

interface MetaStatus { configured: boolean; connections: Connection[] }

const PLATFORMS: { key: Connection['platform']; label: string; blurb: string; icon: React.ReactNode }[] = [
    { key: 'WHATSAPP', label: 'WhatsApp Business', blurb: 'Read customer messages and spot orders and payments.', icon: <MessageCircle className="h-5 w-5" /> },
    { key: 'FACEBOOK', label: 'Facebook Page', blurb: 'Messenger conversations on your business Page.', icon: <Facebook className="h-5 w-5" /> },
    { key: 'INSTAGRAM', label: 'Instagram Business', blurb: 'Direct messages on your business or creator account.', icon: <Instagram className="h-5 w-5" /> },
];

export const MetaMessagingIntegration: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [status, setStatus] = useState<MetaStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const load = async () => {
        try {
            setStatus(await apiJson<MetaStatus>('/integrations/meta/status'));
        } catch (e: any) {
            setError(e?.message || 'Could not load messaging connections');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const connect = async (platform: string) => {
        setBusy(platform); setError(null);
        try {
            const r = await apiJson<{ url: string }>(`/integrations/meta/connect/${platform}`);
            window.location.href = r.url;
        } catch (e: any) {
            setError(e?.message || 'Could not start the connection');
        } finally {
            setBusy(null);
        }
    };

    const disconnect = async (id: string) => {
        setBusy(id);
        try {
            await apiJson(`/integrations/meta/connections/${id}`, { method: 'DELETE' });
            await load();
        } catch (e: any) {
            setError(e?.message || 'Could not disconnect');
        } finally {
            setBusy(null);
        }
    };

    const configured = !!status?.configured;

    return (
        <div className="space-y-6">
            <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
                <ArrowLeft className="h-4 w-4" /> Back to integrations
            </button>
            <div>
                <h3 className="text-lg font-bold text-brand-navy">Messaging (WhatsApp, Facebook, Instagram)</h3>
                <p className="text-sm text-gray-500">Connect your business accounts so MoneyWise can spot orders and payments in customer messages and match them to money received.</p>
            </div>

            {!loading && !configured && (
                <div className="flex gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <div>Not configured yet. This connection is being set up with Meta and will be available soon.</div>
                </div>
            )}
            {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

            <div className="space-y-3">
                {PLATFORMS.map(p => {
                    const conns = (status?.connections || []).filter(c => c.platform === p.key);
                    return (
                        <div key={p.key} className="p-5 bg-white border border-gray-200 rounded-2xl">
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-xl bg-brand-navy text-white flex items-center justify-center">{p.icon}</div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-gray-900">{p.label}</div>
                                    <div className="text-sm text-gray-500">{p.blurb}</div>
                                </div>
                                <button
                                    onClick={() => connect(p.key)}
                                    disabled={!configured || busy === p.key}
                                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-brand-navy text-white disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {conns.length ? 'Add another' : 'Connect'}
                                </button>
                            </div>
                            {conns.map(c => (
                                <div key={c.id} className="mt-3 flex items-center justify-between text-sm bg-gray-50 rounded-xl px-3 py-2">
                                    <span className="text-gray-800">{c.display_name || c.display_phone || 'Connected account'} · <span className="text-gray-500">{c.status.toLowerCase()}</span></span>
                                    <button onClick={() => disconnect(c.id)} disabled={busy === c.id} className="text-gray-400 hover:text-red-600" aria-label="Disconnect">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle, Copy, CreditCard, Loader2 } from 'lucide-react';
import { apiJson } from 'core';
import { useAuth } from '../../../context/AuthContext';

interface View {
    available: boolean; encryptionReady: boolean; configured: boolean; enabled: boolean; env: 'sandbox' | 'production';
    cardCurrency?: 'ZMW' | 'USD'; dollarRate?: number | null;
    keyHint: string | null; hasWebhookSecret: boolean; updatedAt: string | null; webhookUrl: string | null; feeNote: string;
}

const field = 'block w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-[#0B57D0] focus:ring-2 focus:ring-[#0B57D0]/20 disabled:bg-gray-50';

/** Card payments through Lipila. Each business saves its own Lipila wallet key here, so its customers' card payments go to its own wallet. */
export const LipilaIntegration: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { userRole } = useAuth();
    const isAdmin = userRole === 'ADMIN';
    const [view, setView] = useState<View | null>(null);
    const [env, setEnv] = useState<'sandbox' | 'production'>('sandbox');
    const [apiKey, setApiKey] = useState('');
    const [secret, setSecret] = useState('');
    const [clearSecret, setClearSecret] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [currency, setCurrency] = useState<'ZMW' | 'USD'>('ZMW');
    const [busy, setBusy] = useState(false);
    const [testing, setTesting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
    const [copied, setCopied] = useState(false);

    const apply = (v: View) => { setView(v); setEnv(v.env); setEnabled(v.enabled); setCurrency(v.cardCurrency === 'USD' ? 'USD' : 'ZMW'); };
    const load = useCallback(async () => {
        try { setError(null); apply(await apiJson<View>('/lipila/settings')); } catch (e: any) { setError(e?.message || 'Could not load the card settings.'); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const save = async () => {
        setBusy(true); setError(null); setNotice(null); setTest(null);
        try {
            const v = await apiJson<View>('/lipila/settings', { method: 'PUT', body: JSON.stringify({ apiKey: apiKey.trim() || undefined, webhookSecret: clearSecret ? '' : secret.trim() ? secret.trim() : undefined, env, enabled, cardCurrency: currency }) });
            apply(v); setApiKey(''); setSecret(''); setClearSecret(false);
            setNotice(v.enabled ? 'Saved. Card payments are on.' : 'Saved. Card payments are off.');
        } catch (e: any) { setError(e?.message || 'Could not save.'); } finally { setBusy(false); }
    };
    const runTest = async () => {
        setTesting(true); setTest(null); setError(null);
        try { setTest(await apiJson<{ ok: boolean; message: string }>('/lipila/settings/test', { method: 'POST' })); } catch (e: any) { setTest({ ok: false, message: e?.message || 'Could not test.' }); } finally { setTesting(false); }
    };
    const remove = async () => {
        if (!window.confirm('Remove the saved Lipila key? Card payments will stop until you save a key again.')) return;
        setBusy(true); setError(null);
        try { await apiJson('/lipila/settings', { method: 'DELETE' }); setNotice('The key was removed.'); await load(); } catch (e: any) { setError(e?.message || 'Could not remove it.'); } finally { setBusy(false); }
    };
    const copy = async () => { if (!view?.webhookUrl) return; try { await navigator.clipboard.writeText(view.webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* the address is shown to copy by hand */ } };

    return (
        <div className="space-y-6">
            <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0B57D0]"><ArrowLeft size={16} /> Integrations</button>
            <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0B57D0] text-white"><CreditCard size={22} /></div>
                <div>
                    <h3 className="text-lg font-bold text-[#1F1F1F]">Lipila card payments</h3>
                    <p className="text-sm text-gray-500">Let customers pay you by card. The money goes to your own Lipila wallet.</p>
                </div>
            </div>

            {!view ? (error ? <p className="rounded-xl bg-[#FCE8E6] px-4 py-3 text-sm text-[#B31412]">{error}</p> : <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Loading…</div>) : !view.available ? (
                <p className="rounded-xl bg-[#FEF7E0] px-4 py-3 text-sm text-[#7A4B00]">Card payments aren’t open for your account yet.</p>
            ) : (
                <>
                    {!view.encryptionReady && <p className="flex items-start gap-2 rounded-xl bg-[#FEF7E0] px-4 py-3 text-sm text-[#7A4B00]"><AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> The server can’t store keys safely yet, so saving is switched off. Ask your administrator to set GATEWAY_CREDENTIALS_KEY on the server.</p>}
                    {error && <p className="rounded-xl bg-[#FCE8E6] px-4 py-3 text-sm text-[#B31412]">{error}</p>}
                    {notice && <p className="rounded-xl bg-[#E6F4EA] px-4 py-3 text-sm text-[#137333]">{notice}</p>}

                    <div className={`flex items-center justify-between gap-3 rounded-2xl border p-4 ${view.configured && view.enabled ? 'border-[#137333]/30 bg-[#E6F4EA]' : 'border-gray-200 bg-gray-50'}`}>
                        <div className="flex items-center gap-3">
                            {view.configured && view.enabled ? <CheckCircle size={20} className="text-[#137333]" /> : <AlertCircle size={20} className="text-gray-400" />}
                            <div>
                                <p className="text-sm font-bold text-gray-900">{!view.configured ? 'Not connected' : view.enabled ? `Card payments are on (${view.env === 'production' ? 'live' : 'testing'})` : 'Connected, card payments are off'}</p>
                                {view.configured && <p className="text-xs text-gray-500">Saved key {view.keyHint}{view.updatedAt ? ` · updated ${new Date(view.updatedAt).toLocaleDateString()}` : ''}</p>}
                            </div>
                        </div>
                        {view.configured && isAdmin && <button type="button" onClick={runTest} disabled={testing} className="h-9 rounded-full px-4 text-xs font-bold text-[#0B57D0] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-white disabled:opacity-60">{testing ? 'Testing…' : 'Test connection'}</button>}
                    </div>
                    {test && <p className={`rounded-xl px-4 py-3 text-sm ${test.ok ? 'bg-[#E6F4EA] text-[#137333]' : 'bg-[#FCE8E6] text-[#B31412]'}`}>{test.message}</p>}

                    <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
                        <h4 className="text-sm font-bold text-gray-900">Your Lipila wallet</h4>
                        <div>
                            <label className="mb-1.5 block text-xs font-bold text-gray-700">Environment</label>
                            <select className={field} value={env} onChange={(e) => setEnv(e.target.value as any)} disabled={!isAdmin || busy}>
                                <option value="sandbox">Testing (sandbox): no real money</option>
                                <option value="production">Live (production): real card payments</option>
                            </select>
                            <p className="mt-1 text-[11px] text-gray-500">The key must come from the same environment. A live key won’t work in testing, and the other way round.</p>
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-bold text-gray-700">Lipila API key {view.configured && <span className="font-normal text-gray-400">(leave empty to keep the saved one)</span>}</label>
                            <input type="password" autoComplete="off" className={field} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={view.configured ? `Saved ${view.keyHint}` : 'Lsk…'} disabled={!isAdmin || busy || !view.encryptionReady} />
                            <p className="mt-1 text-[11px] text-gray-500">In Lipila: Dashboard → Wallets → your wallet → API Keys. It is stored encrypted and never shown again.</p>
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-bold text-gray-700">Webhook signing secret <span className="font-normal text-gray-400">(needed so Lipila can tell us a payment finished)</span></label>
                            <input type="password" autoComplete="off" className={field} value={secret} onChange={(e) => { setSecret(e.target.value); setClearSecret(false); }} placeholder={view.hasWebhookSecret ? 'Saved. Paste a new one to replace it' : 'Paste the signing secret'} disabled={!isAdmin || busy || !view.encryptionReady} />
                            {view.hasWebhookSecret && <label className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-500"><input type="checkbox" checked={clearSecret} onChange={(e) => setClearSecret(e.target.checked)} /> Remove the saved secret</label>}
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-bold text-gray-700">Charge customers in</label>
                            <select className={field} value={currency} onChange={(e) => setCurrency(e.target.value as 'ZMW' | 'USD')} disabled={!isAdmin || busy}>
                                <option value="ZMW">Kwacha (K)</option>
                                <option value="USD">US dollars ($)</option>
                            </select>
                            <p className="mt-1 text-[11px] text-gray-500">{currency === 'USD'
                                ? `Prices you enter are in dollars. Customers are charged the kwacha equivalent at today's rate${view.dollarRate ? ` (about K${view.dollarRate.toFixed(2)} to $1)` : ''}, and the money lands in your wallet in kwacha.`
                                : 'Prices are in kwacha.'}</p>
                        </div>
                        <label className="flex items-center gap-3 rounded-xl bg-gray-50 p-3 text-sm text-gray-800">
                            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={!isAdmin || busy} /> Accept card payments on my payment links, quick pay page and store
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={save} disabled={!isAdmin || busy || !view.encryptionReady || (!view.configured && !apiKey.trim())} className="h-11 rounded-full bg-[#0B57D0] px-6 text-sm font-bold text-white hover:bg-[#0842A0] disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
                            {view.configured && isAdmin && <button type="button" onClick={remove} disabled={busy} className="h-11 rounded-full px-5 text-sm font-bold text-[#B31412] hover:bg-[#FCE8E6]">Remove key</button>}
                        </div>
                        {!isAdmin && <p className="text-xs text-gray-500">Only the account holder can change these.</p>}
                    </section>

                    <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5">
                        <h4 className="text-sm font-bold text-gray-900">Set this up in Lipila too</h4>
                        <p className="text-sm text-gray-600">In your Lipila dashboard go to <b>Settings → Webhooks</b> and add this address:</p>
                        {view.webhookUrl ? (
                            <div className="flex items-center gap-2 rounded-xl bg-gray-50 p-3">
                                <code className="min-w-0 flex-1 break-all text-xs text-gray-800">{view.webhookUrl}</code>
                                <button type="button" onClick={copy} className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-bold text-[#0B57D0] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-white"><Copy size={12} /> {copied ? 'Copied' : 'Copy'}</button>
                            </div>
                        ) : <p className="rounded-xl bg-[#FEF7E0] px-3 py-2 text-xs text-[#7A4B00]">The server’s public address isn’t set (API_PUBLIC_URL), so the webhook address can’t be shown yet.</p>}
                        <p className="text-xs text-gray-500">Copy the signing secret Lipila shows there into the box above. Even without the webhook, payments are still confirmed when the customer’s screen checks, but the webhook makes it instant.</p>
                    </section>

                    <p className="text-xs leading-5 text-gray-500">{view.feeNote} Customers type their card on Lipila’s secure page. Card details never reach MoneyWise.</p>
                </>
            )}
        </div>
    );
};

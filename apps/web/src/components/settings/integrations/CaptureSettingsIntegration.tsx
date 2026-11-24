import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { captureApi, type CaptureSettings } from '../../capture/captureApi';
import { EmailCaptureSetup } from './EmailCaptureSetup';

const Toggle: React.FC<{ on: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }> = ({ on, disabled, onChange, label }) => (
    <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
        className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-[#006AFF]' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
);

const CHANNELS = [
    { key: 'WHATSAPP', label: 'WhatsApp' }, { key: 'FACEBOOK', label: 'Facebook' }, { key: 'INSTAGRAM', label: 'Instagram' },
    { key: 'EMAIL', label: 'Email' }, { key: 'RECEIPT_UPLOAD', label: 'Receipt uploads' }, { key: 'MOMO_SMS', label: 'Mobile money' },
];

export const CaptureSettingsIntegration: React.FC<{ onBack: () => void; canEdit: boolean }> = ({ onBack, canEdit }) => {
    const [s, setS] = useState<CaptureSettings | null>(null);
    const [limit, setLimit] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        captureApi.settings().then(r => { setS(r); setLimit(String(r.autoPostLimit)); }).catch(e => setError(e?.message || 'Could not load settings'));
    }, []);

    const save = async (patch: Partial<CaptureSettings>) => {
        setBusy(true); setError(null);
        try { const r = await captureApi.saveSettings(patch); setS(r); setLimit(String(r.autoPostLimit)); }
        catch (e: any) { setError(e?.message || 'Could not save'); }
        finally { setBusy(false); }
    };

    return (
        <div className="space-y-6">
            <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
                <ArrowLeft className="h-4 w-4" /> Back to integrations
            </button>
            <div>
                <h3 className="text-lg font-bold text-brand-navy">Transaction capture</h3>
                <p className="text-sm text-gray-500">Turns receipt photos and mobile money messages into entries you approve in Inbox → Inflows → Captured.</p>
            </div>
            {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
            {s && !s.planEligible && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
                    Transaction capture needs an active Premium plan. Manage your plan under Subscription &amp; Billing.
                </div>
            )}
            {!canEdit && <p className="text-xs text-gray-500">Only an owner or admin can change these settings.</p>}
            {s?.planEligible && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4 p-5 bg-white border border-gray-200 rounded-2xl">
                        <div>
                            <div className="font-bold text-gray-900">Capture transactions</div>
                            <div className="text-sm text-gray-500">Read uploaded receipts and mirror mobile money messages into the review list.</div>
                        </div>
                        <Toggle label="Capture transactions" on={s.enabled} disabled={!canEdit || busy} onChange={v => save({ enabled: v })} />
                    </div>
                    <div className="p-5 bg-white border border-gray-200 rounded-2xl space-y-4">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <div className="font-bold text-gray-900">Book automatically</div>
                                <div className="text-sm text-gray-500">Only when the amount was read exactly and the money is confirmed. You can undo for 7 days.</div>
                            </div>
                            <Toggle label="Book automatically" on={s.autoPostEnabled} disabled={!canEdit || busy || !s.enabled} onChange={v => save({ autoPostEnabled: v })} />
                        </div>
                        <label className="flex items-center justify-between gap-4 text-sm">
                            <span className="text-gray-700">Up to this amount per transaction (K)</span>
                            <input className="w-32 rounded-xl border border-gray-200 px-3 py-2 text-right" inputMode="decimal" value={limit} disabled={!canEdit || busy}
                                onChange={e => setLimit(e.target.value)} onBlur={() => Number(limit) >= 0 && Number(limit) !== s.autoPostLimit && save({ autoPostLimit: Number(limit) })} />
                        </label>
                    </div>
                    <div className="flex items-center justify-between gap-4 p-5 bg-white border border-gray-200 rounded-2xl">
                        <div>
                            <div className="font-bold text-gray-900">Assisted replies</div>
                            <div className="text-sm text-gray-500">Draft replies to customers from a conversation. Nothing is sent until someone taps Send.</div>
                        </div>
                        <Toggle label="Assisted replies" on={s.repliesEnabled} disabled={!canEdit || busy || !s.enabled} onChange={v => save({ repliesEnabled: v })} />
                    </div>
                    {s.enabled && (
                        <div className="p-5 bg-white border border-gray-200 rounded-2xl space-y-3">
                            <div className="font-bold text-gray-900">Channels</div>
                            {CHANNELS.map(ch => {
                                const rule = s.channels?.[ch.key] ?? {};
                                const set = (patch: Record<string, unknown>) => save({ channels: { ...s.channels, [ch.key]: { ...rule, ...patch } } });
                                return (
                                    <div key={ch.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                                        <span className="flex-1 min-w-[140px] text-gray-800">{ch.label}</span>
                                        <span className="flex items-center gap-2 text-xs text-gray-500">Capture <Toggle label={`${ch.label} capture`} on={rule.capture !== false} disabled={!canEdit || busy} onChange={v => set({ capture: v })} /></span>
                                        <span className="flex items-center gap-2 text-xs text-gray-500">Auto <Toggle label={`${ch.label} auto-post`} on={rule.autoPost !== false && s.autoPostEnabled} disabled={!canEdit || busy || !s.autoPostEnabled} onChange={v => set({ autoPost: v })} /></span>
                                        <input aria-label={`${ch.label} auto-post limit`} className="w-24 rounded-lg border border-gray-200 px-2 py-1 text-right text-xs" inputMode="decimal" placeholder={String(s.autoPostLimit)}
                                            defaultValue={rule.autoPostLimit ?? ''} disabled={!canEdit || busy || !s.autoPostEnabled}
                                            onBlur={e => { const v = e.target.value.trim(); if (v !== String(rule.autoPostLimit ?? '')) set({ autoPostLimit: v === '' ? null : Number(v) }); }} />
                                    </div>
                                );
                            })}
                            <p className="text-xs text-gray-500">Mobile money capture is set up in the MoneyWise phone app. A channel limit can only be lower than the limit above.</p>
                        </div>
                    )}
                    {s.enabled && <EmailCaptureSetup />}
                </div>
            )}
        </div>
    );
};

import React, { useRef, useState } from 'react';
import { apiJson } from 'core';

interface ConnectConfig { appId: string; configId: string; graphVersion: string; state: string }
type Step = 'idle' | 'authorise' | 'finishing' | 'done';

const STEP_TEXT: Record<Step, string> = { idle: '', authorise: 'Step 1 of 3: authorise in the Meta window', finishing: 'Step 2 of 3: saving your number', done: 'Step 3 of 3: connected' };

/** The Facebook SDK loads only when someone clicks Connect, so it costs other pages nothing. */
const loadSdk = (appId: string, version: string) => new Promise<any>((resolve, reject) => {
    const w = window as any;
    if (w.FB) { w.FB.init({ appId, version, xfbml: false }); resolve(w.FB); return; }
    w.fbAsyncInit = () => { w.FB.init({ appId, version, xfbml: false }); resolve(w.FB); };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/en_US/sdk.js';
    s.async = true;
    s.onerror = () => reject(new Error('Could not open Meta sign-up. Check your connection and try again.'));
    document.body.appendChild(s);
});

/** Meta posts the chosen number to this window. Only messages from facebook.com are trusted. */
const listenForSession = () => {
    let session: { wabaId?: string; phoneNumberId?: string; cancelled?: boolean } = {};
    const onMessage = (e: MessageEvent) => {
        let host = '';
        try { host = new URL(e.origin).hostname; } catch { return; }
        if (host !== 'facebook.com' && !host.endsWith('.facebook.com')) return;
        try {
            const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
            if (d?.type !== 'WA_EMBEDDED_SIGNUP') return;
            if (d.event?.startsWith('FINISH')) session = { wabaId: d.data?.waba_id, phoneNumberId: d.data?.phone_number_id };
            else if (d.event === 'CANCEL') session = { cancelled: true };
        } catch { /* not a sign-up message */ }
    };
    window.addEventListener('message', onMessage);
    return { get: () => session, stop: () => window.removeEventListener('message', onMessage) };
};

export const ConnectMetaButton: React.FC<{ label: string; disabled?: boolean; onConnected: () => void; onError: (message: string) => void }> = ({ label, disabled, onConnected, onError }) => {
    const [step, setStep] = useState<Step>('idle');
    const running = useRef(false);

    const connect = async () => {
        if (running.current) return;
        running.current = true;
        setStep('authorise');
        const session = listenForSession();
        try {
            const cfg = await apiJson<ConnectConfig>('/integrations/meta/connect/WHATSAPP');
            const FB = await loadSdk(cfg.appId, cfg.graphVersion);
            const code = await new Promise<string>((resolve, reject) => {
                FB.login((r: any) => (r?.authResponse?.code ? resolve(r.authResponse.code) : reject(new Error('Sign-up was closed before it finished. Nothing was connected.'))), {
                    config_id: cfg.configId, response_type: 'code', override_default_response_type: true, extras: { setup: {}, sessionInfoVersion: '3' },
                });
            });
            for (let i = 0; i < 20 && !session.get().phoneNumberId && !session.get().cancelled; i++) await new Promise(r => setTimeout(r, 250));
            const { wabaId, phoneNumberId } = session.get();
            if (!wabaId || !phoneNumberId) throw new Error('No WhatsApp number was chosen. Nothing was connected.');

            setStep('finishing');
            await apiJson('/integrations/meta/callback', { method: 'POST', body: JSON.stringify({ code, state: cfg.state, wabaId, phoneNumberId }) });
            setStep('done');
            onConnected();
        } catch (e: any) {
            onError(e?.message || 'Could not connect WhatsApp');
        } finally {
            session.stop();
            running.current = false;
            setTimeout(() => setStep('idle'), 2000);
        }
    };

    return (
        <div className="flex flex-col items-end gap-1">
            <button onClick={connect} disabled={disabled || step === 'authorise' || step === 'finishing'}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-brand-navy text-white disabled:opacity-40 disabled:cursor-not-allowed">
                {step === 'idle' || step === 'done' ? label : 'Connecting…'}
            </button>
            {step !== 'idle' && <span className="text-[11px] text-gray-500">{STEP_TEXT[step]}</span>}
        </div>
    );
};

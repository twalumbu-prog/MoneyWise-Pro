import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { PublicPaymentLink } from './PublicPaymentLink';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

/** Short invoice link: /<business-code>/invoice/<n> → resolves to the invoice's payment link and renders its checkout. */
export const PublicInvoiceLink: React.FC = () => {
    const { code, no } = useParams<{ code: string; no: string }>();
    const [token, setToken] = useState<string | null>(null);
    const [state, setState] = useState<'LOADING' | 'NOT_FOUND' | 'ERROR'>('LOADING');
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setState('LOADING');
        axios.get<{ token: string }>(`${API_URL}/lenco/public-invoice-link/${encodeURIComponent(code || '')}/${encodeURIComponent(no || '')}`, { timeout: 30000 })
            .then(res => { if (!cancelled) setToken(res.data.token); })
            .catch(err => { if (!cancelled) setState(err?.response?.status === 404 ? 'NOT_FOUND' : 'ERROR'); });
        return () => { cancelled = true; };
    }, [code, no, attempt]);

    if (token) return <PublicPaymentLink tokenOverride={token} />;

    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center bg-white">
            {state === 'LOADING' && <Loader2 className="h-8 w-8 animate-spin text-[#006AFF]" />}
            {state === 'NOT_FOUND' && (
                <>
                    <h1 className="text-lg font-bold text-slate-900">Invoice not found</h1>
                    <p className="text-sm text-slate-500 max-w-xs">Check that the whole link was copied, or ask the business to resend it.</p>
                </>
            )}
            {state === 'ERROR' && (
                <>
                    <h1 className="text-lg font-bold text-slate-900">We couldn’t open this invoice</h1>
                    <p className="text-sm text-slate-500 max-w-xs">The service is busy right now. Please try again.</p>
                    <button onClick={() => setAttempt(a => a + 1)} className="px-5 py-2.5 rounded-full bg-[#0059D8] text-white text-sm font-bold">Try again</button>
                </>
            )}
        </div>
    );
};

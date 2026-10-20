import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Loader2, ShieldCheck, ShieldAlert, BadgeCheck, AlertCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { toFlowError, type FlowError } from '../lib/oauthErrors';

export const OAUTH_RETURN_KEY = 'mw_oauth_return';

const PARAM_KEYS = ['client_id', 'redirect_uri', 'response_type', 'scope', 'state', 'code_challenge', 'code_challenge_method'] as const;

interface AuthorizeInfo {
    client: {
        name: string;
        description: string | null;
        logo_url: string | null;
        owner_name: string | null;
        verified: boolean;
        redirect_host: string;
    };
    organization: { id: string; name: string };
    scopes: { scope: string; description: string }[];
    auto_approve: boolean;
}

export const OAuthAuthorize: React.FC = () => {
    const [search] = useSearchParams();
    const [info, setInfo] = useState<AuthorizeInfo | null>(null);
    const [error, setError] = useState<FlowError | null>(null);
    const [busy, setBusy] = useState(false);
    const started = useRef(false);

    const requestParams = () => {
        const p: Record<string, string> = {};
        for (const k of PARAM_KEYS) {
            const v = search.get(k);
            if (v) p[k] = v;
        }
        return p;
    };

    const decide = async (approve: boolean) => {
        setBusy(true);
        try {
            const res = await apiFetch('/oauth/authorize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...requestParams(), approve }),
            });
            const json = await res.json();
            if (!res.ok) {
                setError({ code: json.error ?? 'error', message: json.error_description ?? json.error ?? 'Something went wrong.' });
                setBusy(false);
                return;
            }
            window.location.assign(json.redirect_to);
        } catch (err) {
            setError(toFlowError(err));
            setBusy(false);
        }
    };

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        try { sessionStorage.removeItem(OAUTH_RETURN_KEY); } catch { /* storage unavailable */ }

        (async () => {
            try {
                const res = await apiFetch(`/oauth/authorize/info?${new URLSearchParams(requestParams()).toString()}`);
                const json = await res.json();
                if (!res.ok) {
                    setError({ code: json.error ?? 'error', message: json.error_description ?? json.error ?? 'This request is not valid.' });
                    return;
                }
                setInfo(json);
                if (json.auto_approve) {
                    setBusy(true);
                    await decide(true);
                }
            } catch (err) {
                setError(toFlowError(err));
                setBusy(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const shell = (children: React.ReactNode) => (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8">{children}</div>
        </div>
    );

    if (error) {
        return shell(
            <div className="text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
                    <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
                <h1 className="text-lg font-semibold text-gray-900 mb-2">Can't connect this app</h1>
                <p className="text-sm text-gray-600 mb-6">{error.message}</p>
                <Link to="/" className="inline-block px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium">
                    Back to MoneyWise
                </Link>
            </div>
        );
    }

    if (!info || busy) {
        return shell(
            <div className="flex flex-col items-center gap-3 py-6 text-gray-500 text-sm">
                <Loader2 className="w-6 h-6 animate-spin" />
                {info ? `Connecting ${info.client.name}…` : 'Checking request…'}
            </div>
        );
    }

    const { client, organization, scopes } = info;

    return shell(
        <>
            <div className="flex items-center justify-center gap-3 mb-6">
                {client.logo_url ? (
                    <img src={client.logo_url} alt="" className="w-12 h-12 rounded-xl object-cover border border-gray-200" />
                ) : (
                    <div className="w-12 h-12 rounded-xl bg-gray-900 text-white flex items-center justify-center text-lg font-semibold">
                        {client.name.charAt(0).toUpperCase()}
                    </div>
                )}
                <div className="w-8 border-t border-dashed border-gray-300" />
                <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6" />
                </div>
            </div>

            <h1 className="text-lg font-semibold text-gray-900 text-center mb-1">
                {client.name} wants to connect to {organization.name}
            </h1>
            <div className="flex items-center justify-center gap-1.5 mb-1 text-xs">
                {client.verified ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700"><BadgeCheck className="w-3.5 h-3.5" /> Verified app</span>
                ) : (
                    <span className="inline-flex items-center gap-1 text-amber-700"><ShieldAlert className="w-3.5 h-3.5" /> Unverified app</span>
                )}
                {client.owner_name && <span className="text-gray-500">· by {client.owner_name}</span>}
            </div>
            {client.description && <p className="text-sm text-gray-500 text-center mb-4">{client.description}</p>}
            {!client.verified && (
                <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                    MoneyWise hasn't verified this app. It can only <strong>read</strong> your data. Only allow it if you trust {client.owner_name ?? 'its developer'} and expected this request.
                </div>
            )}

            <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 my-5">
                <p className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">This will allow it to</p>
                {scopes.map(s => (
                    <div key={s.scope} className="px-4 py-3 flex items-start gap-3 text-sm text-gray-800">
                        <Check className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
                        <span>{s.description}</span>
                    </div>
                ))}
            </div>

            <div className="flex gap-3">
                <button
                    onClick={() => decide(false)}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                    Cancel
                </button>
                <button
                    onClick={() => decide(true)}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                >
                    Allow
                </button>
            </div>

            {client.redirect_host && (
                <p className="text-xs text-gray-500 text-center mt-4">
                    After you choose, you'll be sent to <span className="font-mono text-gray-700">{client.redirect_host}</span>
                </p>
            )}

            <p className="text-xs text-gray-500 text-center mt-3">
                You can disconnect this app anytime in Settings → MoneyWise API. It will never be able to move money.
                Connecting the wrong organisation? Switch organisation in MoneyWise first, then try again.
            </p>
        </>
    );
};

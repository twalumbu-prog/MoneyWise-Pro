import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Users, Link2Off, CheckCircle2, ExternalLink, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

interface Preview {
    name: string;
    organiser: string;
    memberCount: number;
    targetAmount: number | null;
    progress: number | null;
}

const kwacha = (n: number) => `K${n.toLocaleString('en-ZM', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * Public invite page for group savings (moneywise.blueopus.cloud/savings/join/CODE). People with
 * the app are sent to it by their phone; everyone else lands here: preview the group, sign in (or
 * create a MoneyWise account in a few fields) and join. Contributing and tracking happen in the app.
 */
export const SavingsJoin: React.FC = () => {
    const { code = '' } = useParams<{ code: string }>();
    const { session, loading: authLoading, signInWithPassword, signUp } = useAuth() as any;

    const [preview, setPreview] = useState<Preview | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [mode, setMode] = useState<'login' | 'signup'>('login');
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [joinedId, setJoinedId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch(`${API_URL}/savings/preview/${encodeURIComponent(code)}`)
            .then(async (r) => {
                const body = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(body.error || 'This invite link isn’t valid any more');
                if (!cancelled) setPreview(body);
            })
            .catch((e) => !cancelled && setLoadError(e.message));
        return () => { cancelled = true; };
    }, [code]);

    const join = async () => {
        setBusy(true); setError(null);
        try {
            const { data } = await supabase.auth.getSession();
            const res = await fetch(`${API_URL}/savings/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
                body: JSON.stringify({ code }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error || 'Could not join the group');
            setJoinedId(body.id);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const authenticate = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true); setError(null);
        try {
            if (mode === 'signup') {
                if (name.trim().length < 2 || username.trim().length < 3) throw new Error('Enter your name and a username (3+ characters).');
                if (password.length < 6) throw new Error('Choose a password of at least 6 characters.');
                // A personal MoneyWise account, the same as signing up for individuals in the app.
                await signUp(identifier.trim(), password, name.trim(), `${name.trim()}'s Workspace`, username.trim());
            }
            await signInWithPassword(identifier.trim(), password);
        } catch (err: any) {
            let msg = err?.message || 'Something went wrong';
            try { const parsed = JSON.parse(msg); msg = parsed.error || msg; } catch { /* plain text */ }
            setError(msg);
        } finally {
            setBusy(false);
        }
    };

    const pct = preview?.progress != null ? Math.round(preview.progress * 100) : null;
    const input = 'w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

    return (
        <div className="min-h-screen bg-gray-50 flex items-start justify-center px-4 py-10 font-sans">
            <div className="w-full max-w-md">
                <div className="text-center mb-6">
                    <img src="/logo.png" alt="MoneyWise" className="h-8 mx-auto" onError={(e) => ((e.currentTarget.style.display = 'none'))} />
                </div>

                {!preview && !loadError && (
                    <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-blue-600" /></div>
                )}

                {loadError && (
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center">
                        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4"><Link2Off className="w-7 h-7 text-gray-500" /></div>
                        <h1 className="text-xl font-bold text-gray-900">This invite isn't valid</h1>
                        <p className="text-sm text-gray-500 mt-2">{loadError}. Ask the organiser for a new link.</p>
                    </div>
                )}

                {preview && (
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-8 text-center border-b border-gray-100">
                            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4"><Users className="w-7 h-7 text-blue-600" /></div>
                            <p className="text-sm text-gray-500">You're invited to join</p>
                            <h1 className="text-2xl font-bold text-gray-900 mt-1">{preview.name}</h1>
                            <p className="text-sm text-gray-500 mt-1">Organised by {preview.organiser} · {preview.memberCount} member{preview.memberCount === 1 ? '' : 's'}</p>

                            {preview.targetAmount ? (
                                <div className="mt-6 text-left">
                                    <div className="h-2 rounded-full bg-neutral-200 overflow-hidden"><div className="h-full rounded-full bg-blue-400 transition-all duration-700" style={{ width: `${pct}%` }} /></div>
                                    <div className="flex justify-between text-xs font-bold text-neutral-500 mt-2"><span>{pct}% saved</span><span>Target {kwacha(preview.targetAmount)}</span></div>
                                </div>
                            ) : null}
                        </div>

                        <div className="p-6">
                            {joinedId ? (
                                <div className="text-center space-y-4">
                                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" strokeWidth={1.75} />
                                    <div>
                                        <h2 className="text-lg font-bold text-gray-900">You're in!</h2>
                                        <p className="text-sm text-gray-500 mt-1">Open the MoneyWise app to add money and follow the group's progress.</p>
                                    </div>
                                    <a href={`moneywise://savings/${joinedId}`} className="inline-flex items-center justify-center gap-2 w-full h-12 rounded-full bg-blue-600 text-white font-bold text-sm hover:bg-blue-700">
                                        Open in the app <ExternalLink size={15} />
                                    </a>
                                </div>
                            ) : authLoading ? (
                                <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
                            ) : session ? (
                                <div className="space-y-3">
                                    <p className="text-sm text-gray-600 text-center">You're signed in. Confirm to join this group.</p>
                                    {error && <p className="flex items-center gap-1.5 text-sm text-red-600"><AlertCircle size={15} /> {error}</p>}
                                    <button onClick={join} disabled={busy} className="w-full h-12 rounded-full bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2">
                                        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Join group
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={authenticate} className="space-y-3">
                                    <div className="grid grid-cols-2 p-1 bg-gray-100 rounded-full text-sm font-semibold">
                                        {(['login', 'signup'] as const).map((m) => (
                                            <button key={m} type="button" onClick={() => { setMode(m); setError(null); }}
                                                className={`h-9 rounded-full transition-colors ${mode === m ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
                                                {m === 'login' ? 'I have an account' : 'Create account'}
                                            </button>
                                        ))}
                                    </div>
                                    {mode === 'signup' && (
                                        <>
                                            <input className={input} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
                                            <input className={input} placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} autoComplete="username" required />
                                        </>
                                    )}
                                    <input className={input} placeholder={mode === 'login' ? 'Email or username' : 'Email address'} type={mode === 'login' ? 'text' : 'email'}
                                        value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="email" required />
                                    <input className={input} placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
                                    {error && <p className="flex items-center gap-1.5 text-sm text-red-600"><AlertCircle size={15} /> {error}</p>}
                                    <button type="submit" disabled={busy} className="w-full h-12 rounded-full bg-black text-white font-bold text-sm hover:bg-gray-800 disabled:opacity-60 flex items-center justify-center gap-2">
                                        {busy && <Loader2 className="w-4 h-4 animate-spin" />} {mode === 'login' ? 'Log in to join' : 'Create account & continue'}
                                    </button>
                                </form>
                            )}
                        </div>
                    </div>
                )}

                <p className="text-center text-xs text-gray-400 mt-6">Group savings on MoneyWise</p>
            </div>
        </div>
    );
};

import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Copy, Check, AlertCircle, KeyRound, Pencil, RefreshCw, BadgeCheck, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';

interface OAuthApp {
    id: string;
    client_id: string;
    name: string;
    description: string | null;
    redirect_uris: string[];
    scopes: string[];
    confidential: boolean;
    verified: boolean;
    created_at: string;
    connected_orgs: number;
}

interface Credentials {
    appName: string;
    client_id: string;
    client_secret: string | null;
}

async function call(path: string, options: RequestInit = {}) {
    const res = await apiFetch(path, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Request failed');
    return json;
}

function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
    const [copied, setCopied] = useState(false);
    const [shown, setShown] = useState(!secret);
    return (
        <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                <code className="flex-1 text-xs font-mono text-gray-800 break-all">{shown ? value : '•'.repeat(24)}</code>
                {secret && (
                    <button onClick={() => setShown(s => !s)} className="text-[11px] text-gray-500 hover:text-gray-800">
                        {shown ? 'Hide' : 'Show'}
                    </button>
                )}
                <button
                    onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                    aria-label={`Copy ${label}`}
                >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
            </div>
        </div>
    );
}

const pill = (cls: string) => `text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${cls}`;

export const OAuthApps: React.FC = () => {
    const [apps, setApps] = useState<OAuthApp[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [credentials, setCredentials] = useState<Credentials | null>(null);

    // form: null = closed, 'new' = registering, otherwise the app being edited
    const [editing, setEditing] = useState<'new' | OAuthApp | null>(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [urls, setUrls] = useState('');
    const [writeScope, setWriteScope] = useState(false);
    const [confidential, setConfidential] = useState(true);
    const [saving, setSaving] = useState(false);

    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try { setApps(await call('/developer/oauth-apps')); } catch (e: any) { setError(e.message); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const openForm = (app: 'new' | OAuthApp) => {
        setError(null);
        setEditing(app);
        if (app === 'new') {
            setName(''); setDescription(''); setUrls(''); setWriteScope(false); setConfidential(true);
        } else {
            setName(app.name); setDescription(app.description ?? ''); setUrls(app.redirect_uris.join('\n'));
            setWriteScope(app.scopes.includes('write'));
        }
    };

    const save = async () => {
        if (!editing) return;
        setSaving(true);
        setError(null);
        const body = {
            name,
            description,
            redirect_uris: urls.split(/\s+/).filter(Boolean),
            scopes: writeScope ? ['read', 'write'] : ['read'],
        };
        try {
            if (editing === 'new') {
                const created = await call('/developer/oauth-apps', { method: 'POST', body: JSON.stringify({ ...body, confidential }) });
                setCredentials({ appName: created.name, client_id: created.client_id, client_secret: created.client_secret });
            } else {
                await call(`/developer/oauth-apps/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
            }
            setEditing(null);
            await load();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const regenerate = async (app: OAuthApp) => {
        setBusyId(app.id);
        setError(null);
        try {
            const r = await call(`/developer/oauth-apps/${app.id}/regenerate-secret`, { method: 'POST' });
            setCredentials({ appName: app.name, client_id: r.client_id, client_secret: r.client_secret });
        } catch (e: any) { setError(e.message); } finally { setBusyId(null); }
    };

    const remove = async (app: OAuthApp) => {
        setBusyId(app.id);
        setError(null);
        try {
            await call(`/developer/oauth-apps/${app.id}`, { method: 'DELETE' });
            setApps(prev => prev.filter(a => a.id !== app.id));
            setConfirmDelete(null);
        } catch (e: any) { setError(e.message); } finally { setBusyId(null); }
    };

    const editingVerified = editing && editing !== 'new' ? editing.verified : false;
    const input = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200';

    return (
        <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-bold text-gray-900">Your apps (OAuth)</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Register apps that let users "Connect with MoneyWise" without handling API keys.{' '}
                        <Link to="/docs/api#oauth" className="text-indigo-600 hover:underline">How it works</Link>
                    </p>
                </div>
                {!editing && (
                    <button onClick={() => openForm('new')} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 shrink-0">
                        <Plus className="w-3.5 h-3.5" /> Register app
                    </button>
                )}
            </div>

            {error && (
                <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-px" /> {error}
                </div>
            )}

            {credentials && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                        <KeyRound className="w-4 h-4" /> Credentials for {credentials.appName}
                    </div>
                    <CopyField label="client_id" value={credentials.client_id} />
                    {credentials.client_secret ? (
                        <>
                            <CopyField label="client_secret" value={credentials.client_secret} secret />
                            <p className="text-xs text-amber-800">
                                Copy the secret now — it is shown only once. Keep it in your server's environment variables, never in browser or mobile code.
                            </p>
                        </>
                    ) : (
                        <p className="text-xs text-amber-800">This is a public app: it has no secret and relies on PKCE.</p>
                    )}
                    <button onClick={() => setCredentials(null)} className="text-xs font-semibold text-amber-900 underline">I've saved these</button>
                </div>
            )}

            {editing && (
                <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
                    <p className="text-sm font-semibold text-gray-900">{editing === 'new' ? 'Register an app' : `Edit ${editing.name}`}</p>
                    <div>
                        <label className="text-xs font-medium text-gray-700">App name</label>
                        <input className={input} value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="Acme CRM" />
                        <p className="text-[11px] text-gray-400 mt-1">Shown to admins when they approve the connection.</p>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-700">Description <span className="text-gray-400">(optional)</span></label>
                        <input className={input} value={description} onChange={e => setDescription(e.target.value)} maxLength={200} placeholder="What the app does with MoneyWise data" />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-700">Callback URLs</label>
                        <textarea
                            className={`${input} font-mono text-xs`}
                            rows={3}
                            value={urls}
                            onChange={e => setUrls(e.target.value)}
                            placeholder={'https://yourapp.com/auth/moneywise/callback\nhttp://localhost:5174/auth/moneywise/callback'}
                        />
                        <p className="text-[11px] text-gray-400 mt-1">One per line, up to 5. Must match your app's redirect exactly (including the path). https only, or http://localhost for testing.</p>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-700">Access</label>
                        <div className="mt-1 space-y-1.5">
                            <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked disabled /> read — view balances, transactions, accounts, requisitions, products, payment links</label>
                            <label className={`flex items-center gap-2 text-sm ${editingVerified ? 'text-gray-700' : 'text-gray-400'}`}>
                                <input type="checkbox" checked={writeScope} disabled={!editingVerified} onChange={e => setWriteScope(e.target.checked)} />
                                write — create payment links {!editingVerified && <span className="text-[11px]">(available once your app is verified)</span>}
                            </label>
                        </div>
                    </div>
                    {editing === 'new' && (
                        <div>
                            <label className="text-xs font-medium text-gray-700">App type</label>
                            <div className="mt-1 space-y-1.5 text-sm text-gray-700">
                                <label className="flex items-start gap-2"><input type="radio" className="mt-1" checked={confidential} onChange={() => setConfidential(true)} /> <span><strong>Server-side</strong> — has a backend that can keep a secret. You get a client_id and client_secret.</span></label>
                                <label className="flex items-start gap-2"><input type="radio" className="mt-1" checked={!confidential} onChange={() => setConfidential(false)} /> <span><strong>Mobile or browser-only</strong> — can't hide a secret. You get a client_id only.</span></label>
                            </div>
                        </div>
                    )}
                    <div className="flex gap-2 pt-1">
                        <button onClick={save} disabled={saving || !name.trim() || !urls.trim()} className="px-3.5 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                            {saving ? 'Saving…' : editing === 'new' ? 'Register app' : 'Save changes'}
                        </button>
                        <button onClick={() => setEditing(null)} className="px-3.5 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                    </div>
                </div>
            )}

            {apps.length === 0 && !editing ? (
                <div className="border border-dashed border-gray-200 rounded-xl p-5 text-center text-xs text-gray-400">No apps registered yet.</div>
            ) : (
                <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
                    {apps.map(a => (
                        <div key={a.id} className="p-3.5 space-y-2.5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-semibold text-gray-900">{a.name}</p>
                                        {a.verified ? (
                                            <span className={pill('bg-emerald-50 text-emerald-700 border-emerald-200') + ' inline-flex items-center gap-1'}><BadgeCheck className="w-3 h-3" />Verified</span>
                                        ) : (
                                            <span className={pill('bg-amber-50 text-amber-700 border-amber-200') + ' inline-flex items-center gap-1'}><ShieldAlert className="w-3 h-3" />Unverified · read only</span>
                                        )}
                                        <span className={pill('bg-gray-100 text-gray-500 border-gray-200')}>{a.confidential ? 'server-side' : 'public'}</span>
                                        {a.scopes.map(s => <span key={s} className={pill(s === 'write' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200')}>{s}</span>)}
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-1">
                                        {a.connected_orgs} organisation{a.connected_orgs === 1 ? '' : 's'} connected · registered {new Date(a.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => openForm(a)} className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100" aria-label="Edit app"><Pencil className="w-3.5 h-3.5" /></button>
                                    {a.confidential && (
                                        <button onClick={() => regenerate(a)} disabled={busyId === a.id} className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-50" aria-label="Regenerate secret" title="Regenerate client secret"><RefreshCw className="w-3.5 h-3.5" /></button>
                                    )}
                                    {confirmDelete === a.id ? (
                                        <button onClick={() => remove(a)} disabled={busyId === a.id} className="px-2 py-1 text-[11px] font-semibold text-white bg-red-500 hover:bg-red-600 rounded-md">
                                            {busyId === a.id ? 'Deleting…' : 'Confirm delete'}
                                        </button>
                                    ) : (
                                        <button onClick={() => setConfirmDelete(a.id)} className="p-1.5 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50" aria-label="Delete app"><Trash2 className="w-3.5 h-3.5" /></button>
                                    )}
                                </div>
                            </div>
                            <CopyField label="client_id" value={a.client_id} />
                            <div className="text-[11px] text-gray-500">
                                Callback URLs: <span className="font-mono">{a.redirect_uris.join('  ·  ')}</span>
                            </div>
                            {confirmDelete === a.id && (
                                <p className="text-[11px] text-red-600">Deleting disconnects every organisation using this app, immediately.</p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

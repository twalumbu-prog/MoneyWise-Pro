import React, { useState, useEffect, useCallback } from 'react';
import { Key, Plus, Trash2, Copy, Check, ExternalLink, AlertCircle, Eye, EyeOff, Code2, BookOpen } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const DOCS_URL = 'https://docs.moneywise.pro/api'; // opens the docs artifact

async function apiFetch(path: string, options: RequestInit = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token || ''}`,
            ...(options.headers || {}),
        },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Request failed');
    return json;
}

interface ApiKey {
    id: string;
    name: string;
    key_prefix: string;
    scopes: string[];
    last_used_at: string | null;
    created_at: string;
    revoked_at: string | null;
}

interface NewKeyResult extends ApiKey {
    key: string; // raw key, shown only once
}

function Badge({ children, variant }: { children: React.ReactNode; variant: 'green' | 'blue' | 'gray' }) {
    const styles = {
        green: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
        blue: 'bg-blue-50 text-blue-700 border border-blue-200',
        gray: 'bg-gray-100 text-gray-500 border border-gray-200',
    };
    return (
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${styles[variant]}`}>
            {children}
        </span>
    );
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button onClick={handleCopy} className="p-1.5 rounded-md hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
    );
}

export const DeveloperAPI: React.FC = () => {
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // create form
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newScopes, setNewScopes] = useState<string[]>(['read']);
    const [creating, setCreating] = useState(false);

    // revealed key
    const [createdKey, setCreatedKey] = useState<NewKeyResult | null>(null);
    const [keyVisible, setKeyVisible] = useState(true);

    // revoke confirm
    const [revoking, setRevoking] = useState<string | null>(null);

    const loadKeys = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await apiFetch('/developer/keys');
            setKeys(data);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadKeys(); }, [loadKeys]);

    const handleCreate = async () => {
        if (!newName.trim()) return;
        setCreating(true);
        setError(null);
        try {
            const result: NewKeyResult = await apiFetch('/developer/keys', {
                method: 'POST',
                body: JSON.stringify({ name: newName.trim(), scopes: newScopes }),
            });
            setCreatedKey(result);
            setShowCreate(false);
            setNewName('');
            setNewScopes(['read']);
            setKeyVisible(true);
            await loadKeys();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setCreating(false);
        }
    };

    const handleRevoke = async (id: string) => {
        setRevoking(id);
        try {
            await apiFetch(`/developer/keys/${id}`, { method: 'DELETE' });
            setKeys(prev => prev.filter(k => k.id !== id));
        } catch (e: any) {
            setError(e.message);
        } finally {
            setRevoking(null);
        }
    };

    const scopeToggle = (scope: string) => {
        setNewScopes(prev =>
            prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
        );
    };

    const activeKeys = keys.filter(k => !k.revoked_at);

    return (
        <div className="space-y-6 max-w-3xl">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <Code2 className="w-4 h-4 text-violet-500" />
                        MoneyWise API
                    </h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Build integrations with your MoneyWise data using API keys.
                    </p>
                </div>
                <a
                    href={DOCS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-700 border border-violet-200 rounded-lg px-3 py-1.5 hover:bg-violet-50 transition-colors"
                >
                    <BookOpen className="w-3.5 h-3.5" />
                    View Docs
                    <ExternalLink className="w-3 h-3" />
                </a>
            </div>

            {/* New key reveal banner */}
            {createdKey && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                        <Check className="w-4 h-4" />
                        API key created — copy it now, it won't be shown again
                    </div>
                    <div className="flex items-center gap-2 bg-white border border-emerald-200 rounded-lg px-3 py-2">
                        <Key className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <code className="text-xs font-mono text-gray-800 flex-1 break-all">
                            {keyVisible ? createdKey.key : createdKey.key.replace(/./g, '•')}
                        </code>
                        <button onClick={() => setKeyVisible(v => !v)} className="p-1 text-gray-400 hover:text-gray-600">
                            {keyVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <CopyButton text={createdKey.key} />
                    </div>
                    <button
                        onClick={() => setCreatedKey(null)}
                        className="text-xs text-emerald-600 hover:underline"
                    >
                        I've saved my key — dismiss
                    </button>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            {/* Create form */}
            {showCreate ? (
                <div className="border border-violet-200 rounded-xl p-4 space-y-4 bg-violet-50/30">
                    <p className="text-sm font-semibold text-gray-800">New API key</p>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Key name</label>
                        <input
                            type="text"
                            placeholder="e.g. My Automation Script"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-2">Permissions</label>
                        <div className="flex items-center gap-3">
                            {(['read', 'write'] as const).map(scope => (
                                <label key={scope} className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={newScopes.includes(scope)}
                                        onChange={() => scopeToggle(scope)}
                                        className="accent-violet-600 w-4 h-4"
                                    />
                                    <span className="text-sm text-gray-700 capitalize">{scope}</span>
                                    <span className="text-xs text-gray-400">
                                        {scope === 'read' ? '— view data' : '— create & modify'}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                        <button
                            onClick={handleCreate}
                            disabled={creating || newScopes.length === 0 || !newName.trim()}
                            className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
                        >
                            {creating ? 'Creating…' : 'Create key'}
                        </button>
                        <button
                            onClick={() => { setShowCreate(false); setNewName(''); setNewScopes(['read']); }}
                            className="px-4 py-2 text-gray-600 rounded-lg text-sm hover:bg-gray-100 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 transition-colors"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Create API key
                </button>
            )}

            {/* Key list */}
            {loading ? (
                <div className="text-sm text-gray-400 py-6 text-center">Loading keys…</div>
            ) : activeKeys.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl">
                    <Key className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No API keys yet</p>
                    <p className="text-xs text-gray-400 mt-1">Create one above to start building integrations.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Active keys ({activeKeys.length})</p>
                    {activeKeys.map(k => (
                        <div key={k.id} className="flex items-center gap-3 p-3.5 bg-white border border-gray-200 rounded-xl">
                            <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Key className="w-4 h-4 text-violet-600" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-gray-800 truncate">{k.name}</span>
                                    {k.scopes.map(s => (
                                        <Badge key={s} variant={s === 'write' ? 'blue' : 'green'}>{s}</Badge>
                                    ))}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <code className="text-xs text-gray-400 font-mono">{k.key_prefix}••••••••</code>
                                    <span className="text-gray-200">·</span>
                                    <span className="text-xs text-gray-400">
                                        {k.last_used_at
                                            ? `Last used ${new Date(k.last_used_at).toLocaleDateString()}`
                                            : 'Never used'}
                                    </span>
                                </div>
                            </div>

                            <button
                                onClick={() => handleRevoke(k.id)}
                                disabled={revoking === k.id}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            >
                                <Trash2 className="w-3 h-3" />
                                {revoking === k.id ? 'Revoking…' : 'Revoke'}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Base URL info */}
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Base URL</p>
                <div className="flex items-center gap-2">
                    <code className="text-sm font-mono text-gray-700">
                        {(import.meta.env.VITE_API_URL || 'https://moneywise.blueopus.cloud/api').replace(/\/$/, '')}/v1
                    </code>
                    <CopyButton text={`${(import.meta.env.VITE_API_URL || 'https://moneywise.blueopus.cloud/api').replace(/\/$/, '')}/v1`} />
                </div>
                <p className="text-xs text-gray-400">
                    Pass your key as <code className="font-mono bg-gray-100 px-1 rounded">Authorization: Bearer mwp_live_…</code>
                </p>
            </div>
        </div>
    );
};

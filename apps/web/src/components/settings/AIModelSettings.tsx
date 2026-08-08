import React, { useState, useEffect, useRef } from 'react';
import { aiService } from '../../services/ai.service';
import { BrainCircuit, Loader2, Check, AlertCircle, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

type Provider = 'gemini' | 'openrouter' | 'perplexity';

interface Settings {
    categorization_provider: Provider;
    categorization_model: string;
    autocomplete_provider: Provider;
    autocomplete_model: string;
    ocr_provider: 'gemini' | 'openrouter';
    ocr_model: string;
    perplexity_mode: 'agent' | 'gateway';
}

interface CatalogEntry {
    label: string;
    color: string;
    models: { categorization: string[]; autocomplete: string[]; ocr: string[] };
    note: string;
}

// ── Provider logos ──────────────────────────────────────────────────────────

function ProviderLogo({ provider, size = 18 }: { provider: string; size?: number }) {
    if (provider === 'gemini') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
        );
    }

    if (provider === 'openrouter') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <rect width="24" height="24" rx="6" fill="#7C3AED"/>
                <circle cx="12" cy="7.5" r="2.2" fill="white"/>
                <circle cx="7" cy="16" r="1.8" fill="white"/>
                <circle cx="17" cy="16" r="1.8" fill="white"/>
                <line x1="12" y1="9.7" x2="7.9" y2="14.3" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
                <line x1="12" y1="9.7" x2="16.1" y2="14.3" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
        );
    }

    if (provider === 'perplexity') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <rect width="24" height="24" rx="6" fill="#0D9488"/>
                <line x1="12" y1="4.5" x2="12" y2="19.5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                <line x1="4.5" y1="12" x2="19.5" y2="12" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                <line x1="6.9" y1="6.9" x2="17.1" y2="17.1" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
                <line x1="17.1" y1="6.9" x2="6.9" y2="17.1" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
        );
    }

    return <div style={{ width: size, height: size, borderRadius: 5, background: '#94A3B8' }} />;
}

// ── Provider dropdown ───────────────────────────────────────────────────────

interface ProviderDropdownProps {
    value: string;
    providers: string[];
    catalog: Record<string, CatalogEntry>;
    disabled: boolean;
    onChange: (p: string) => void;
}

function ProviderDropdown({ value, providers, catalog, disabled, onChange }: ProviderDropdownProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-2 px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-900 hover:border-gray-300 transition-colors disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
                <ProviderLogo provider={value} size={16} />
                <span className="flex-1 text-left">{catalog[value]?.label ?? value}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    {providers.map(p => (
                        <button
                            key={p}
                            type="button"
                            onClick={() => { onChange(p); setOpen(false); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                                value === p
                                    ? 'bg-blue-50 text-[#006AFF]'
                                    : 'text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            <ProviderLogo provider={p} size={16} />
                            <span className="flex-1 text-left font-medium">{catalog[p]?.label ?? p}</span>
                            {value === p && <Check className="w-3.5 h-3.5 text-[#006AFF] flex-shrink-0" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Model dropdown ──────────────────────────────────────────────────────────

interface ModelDropdownProps {
    value: string;
    options: string[];
    disabled: boolean;
    onChange: (m: string) => void;
}

function ModelDropdown({ value, options, disabled, onChange }: ModelDropdownProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    const displayValue = value || 'Select model…';

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-2 px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 hover:border-gray-300 transition-colors disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
                <span className="flex-1 text-left font-mono text-xs truncate">{displayValue}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                    {options.length === 0 ? (
                        <div className="px-3 py-2.5 text-xs text-gray-400 italic">No models available</div>
                    ) : (
                        options.map(m => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => { onChange(m); setOpen(false); }}
                                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs font-mono transition-colors ${
                                    value === m
                                        ? 'bg-blue-50 text-[#006AFF]'
                                        : 'text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                                <span className="text-left truncate">{m}</span>
                                {value === m && <Check className="w-3 h-3 text-[#006AFF] flex-shrink-0" />}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

// ── Task row ────────────────────────────────────────────────────────────────

interface TaskRowProps {
    label: string;
    providerKey: 'categorization_provider' | 'autocomplete_provider' | 'ocr_provider';
    modelKey: 'categorization_model' | 'autocomplete_model' | 'ocr_model';
    catalogKey: 'categorization' | 'autocomplete' | 'ocr';
    settings: Settings;
    catalog: Record<string, CatalogEntry>;
    onChange: (key: keyof Settings, value: string) => void;
    omitPerplexity?: boolean;
    isAdmin: boolean;
}

function TaskRow({
    label, providerKey, modelKey, catalogKey,
    settings, catalog, onChange, omitPerplexity, isAdmin,
}: TaskRowProps) {
    const provider = settings[providerKey] as Provider;
    const model = settings[modelKey];
    const modelOptions: string[] = catalog[provider]?.models?.[catalogKey] ?? [];

    const providers = omitPerplexity
        ? (['gemini', 'openrouter'] as Provider[])
        : (['gemini', 'openrouter', 'perplexity'] as Provider[]);

    function handleProviderChange(p: string) {
        onChange(providerKey, p);
        const first = catalog[p]?.models?.[catalogKey]?.[0];
        if (first) onChange(modelKey, first);
    }

    return (
        <div className="space-y-2">
            <label className="block text-[10px] text-gray-400 font-bold tracking-wider uppercase">
                {label}
            </label>

            <div className="grid grid-cols-2 gap-2">
                <ProviderDropdown
                    value={provider}
                    providers={providers}
                    catalog={catalog}
                    disabled={!isAdmin}
                    onChange={handleProviderChange}
                />
                <ModelDropdown
                    value={model}
                    options={modelOptions}
                    disabled={!isAdmin}
                    onChange={m => onChange(modelKey, m)}
                />
            </div>

            {/* Perplexity mode toggle — appears inline when Perplexity selected */}
            {provider === 'perplexity' && (
                <div className="flex gap-1.5 pt-0.5">
                    {(['agent', 'gateway'] as const).map(mode => (
                        <button
                            key={mode}
                            type="button"
                            disabled={!isAdmin}
                            onClick={() => onChange('perplexity_mode', mode)}
                            className={`px-3 py-1.5 rounded-lg text-xs border font-medium transition-colors disabled:cursor-not-allowed ${
                                settings.perplexity_mode === mode
                                    ? 'border-teal-400 bg-teal-50 text-teal-700'
                                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                            }`}
                        >
                            {mode === 'agent' ? '🌐 Agent (web search)' : '⚡ Gateway (fast)'}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Main component ──────────────────────────────────────────────────────────

export const AIModelSettings: React.FC = () => {
    const { userRole } = useAuth();
    const isAdmin = userRole === 'ADMIN';

    const [settings, setSettings] = useState<Settings | null>(null);
    const [catalog, setCatalog] = useState<Record<string, CatalogEntry>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [savedAt, setSavedAt] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { load(); }, []);

    async function load() {
        try {
            setLoading(true);
            const { settings: s, catalog: c } = await aiService.getModelSettings();
            setSettings(s as unknown as Settings);
            setCatalog(c as Record<string, CatalogEntry>);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    function change(key: keyof Settings, value: string) {
        setSettings(prev => prev ? { ...prev, [key]: value } : prev);
        setDirty(true);
        setSavedAt(null);
    }

    async function save() {
        if (!settings || !dirty) return;
        try {
            setSaving(true);
            setError(null);
            const { settings: updated } = await aiService.updateModelSettings(settings as unknown as Record<string, string>);
            setSettings(updated as unknown as Settings);
            setDirty(false);
            setSavedAt(new Date().toLocaleTimeString());
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 mb-1">
                <label className="text-sm font-bold text-brand-navy flex items-center">
                    <BrainCircuit className="h-4 w-4 mr-2 text-[#006AFF]" />
                    AI Model Configuration
                </label>
                {savedAt && !dirty && (
                    <span className="text-xs text-green-600 flex items-center gap-1 flex-shrink-0">
                        <Check className="w-3 h-3" /> Saved at {savedAt}
                    </span>
                )}
            </div>
            <p className="text-xs text-gray-400 mb-5">
                Choose which AI provider and model to use for each task. Changes take effect within 5 minutes.
            </p>

            {loading && (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading model settings…
                </div>
            )}

            {error && !loading && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            {settings && !loading && (
                <div className="space-y-5">
                    <TaskRow
                        label="Expense Categorization"
                        providerKey="categorization_provider"
                        modelKey="categorization_model"
                        catalogKey="categorization"
                        settings={settings}
                        catalog={catalog}
                        onChange={change}
                        isAdmin={isAdmin}
                    />

                    <div className="border-t border-gray-100" />

                    <TaskRow
                        label="24-Hour Auto-Complete"
                        providerKey="autocomplete_provider"
                        modelKey="autocomplete_model"
                        catalogKey="autocomplete"
                        settings={settings}
                        catalog={catalog}
                        onChange={change}
                        isAdmin={isAdmin}
                    />

                    <div className="border-t border-gray-100" />

                    <TaskRow
                        label="Receipt OCR / Scanning"
                        providerKey="ocr_provider"
                        modelKey="ocr_model"
                        catalogKey="ocr"
                        settings={settings}
                        catalog={catalog}
                        onChange={change}
                        omitPerplexity
                        isAdmin={isAdmin}
                    />

                    <p className="text-[10px] text-gray-400 pt-1">
                        API keys (<span className="font-mono">OPENROUTER_API_KEY</span>, <span className="font-mono">PERPLEXITY_API_KEY</span>) are set as Vercel environment variables, not here.
                    </p>

                    {isAdmin && (
                        <div className="pt-1">
                            <button
                                type="button"
                                onClick={save}
                                disabled={!dirty || saving}
                                className="inline-flex items-center px-5 py-2 border border-transparent shadow-sm text-sm font-semibold rounded-lg text-white bg-[#10A34A] hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 transition-colors"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                                        Saving…
                                    </>
                                ) : (
                                    'Save Changes'
                                )}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/**
 * ai.settings.service.ts
 *
 * Reads AI model configuration from the `ai_model_settings` Supabase table with a
 * 5-minute in-memory cache, so every classification call isn't a DB round-trip.
 *
 * Falls back to environment variables when a row is missing or the DB is
 * unreachable — so the system keeps working even before any settings have been
 * saved from the UI.
 *
 * Admin API:  GET/PUT /ai/model-settings
 * UI:         Settings → AI & Automation → Model Settings
 */

import { supabase } from '../../lib/supabase';

export interface AIModelSettings {
    // Real-time expense categorization
    categorization_provider: 'gemini' | 'openrouter' | 'perplexity';
    categorization_model: string;
    // 24-hour auto-completion (heavyweight reasoning)
    autocomplete_provider: 'gemini' | 'openrouter' | 'perplexity';
    autocomplete_model: string;
    // Receipt OCR / vision
    ocr_provider: 'gemini' | 'openrouter';
    ocr_model: string;
    // How to call Perplexity: 'agent' (web-grounded) | 'gateway' (OpenAI-compat)
    perplexity_mode: 'agent' | 'gateway';
}

const DEFAULTS: AIModelSettings = {
    categorization_provider: (process.env.AI_CATEGORIZATION_PROVIDER as any) || 'gemini',
    categorization_model:    process.env.GEMINI_CATEGORIZATION_MODEL       || 'gemini-2.5-flash',
    autocomplete_provider:   (process.env.AI_AUTOCOMPLETE_PROVIDER as any)  || 'openrouter',
    autocomplete_model:      process.env.OPENROUTER_AUTOCOMPLETE_MODEL      || 'deepseek/deepseek-r1',
    ocr_provider:            (process.env.AI_OCR_PROVIDER as any)           || 'gemini',
    ocr_model:               'gemini-2.5-flash-lite',
    perplexity_mode:         'agent',
};

// ── In-memory cache ──────────────────────────────────────────────────────────
let _cache: AIModelSettings | null = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getAIModelSettings(): Promise<AIModelSettings> {
    if (_cache && Date.now() < _cacheExpiry) return _cache;

    try {
        const { data, error } = await supabase
            .from('ai_model_settings')
            .select('key, value');

        if (error || !data?.length) throw new Error(error?.message || 'empty');

        const map = Object.fromEntries(data.map((r: any) => [r.key, r.value]));
        _cache = {
            categorization_provider: (map.categorization_provider as any) || DEFAULTS.categorization_provider,
            categorization_model:    map.categorization_model             || DEFAULTS.categorization_model,
            autocomplete_provider:   (map.autocomplete_provider as any)   || DEFAULTS.autocomplete_provider,
            autocomplete_model:      map.autocomplete_model               || DEFAULTS.autocomplete_model,
            ocr_provider:            (map.ocr_provider as any)            || DEFAULTS.ocr_provider,
            ocr_model:               map.ocr_model                        || DEFAULTS.ocr_model,
            perplexity_mode:         (map.perplexity_mode as any)         || DEFAULTS.perplexity_mode,
        };
        _cacheExpiry = Date.now() + CACHE_TTL_MS;
        return _cache;
    } catch (err: any) {
        console.warn('[AI Settings] DB read failed, using defaults:', err.message);
        return DEFAULTS;
    }
}

export async function updateAIModelSettings(partial: Partial<AIModelSettings>): Promise<void> {
    const upserts = Object.entries(partial).map(([key, value]) => ({
        key,
        value: String(value),
        updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
        .from('ai_model_settings')
        .upsert(upserts, { onConflict: 'key' });

    if (error) throw new Error(`Failed to save AI settings: ${error.message}`);

    // Invalidate cache so next call re-reads from DB
    _cache = null;
    _cacheExpiry = 0;
}

/** Exposes a snapshot of available providers and recommended models for the UI. */
export const PROVIDER_CATALOG = {
    gemini: {
        label: 'Google Gemini',
        color: '#4285F4',
        models: {
            categorization: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'],
            autocomplete:   ['gemini-2.5-pro', 'gemini-2.5-flash'],
            ocr:            ['gemini-2.5-flash-lite', 'gemini-2.5-flash'],
        },
        note: 'Fast, reliable, excellent for structured JSON output. Requires GEMINI_API_KEY.',
    },
    openrouter: {
        label: 'OpenRouter',
        color: '#7C3AED',
        models: {
            categorization: [
                'deepseek/deepseek-r1-distill-llama-70b',
                'meta-llama/llama-3.3-70b-instruct',
                'qwen/qwen-2.5-72b-instruct',
                'anthropic/claude-3-5-haiku',
                'anthropic/claude-sonnet-4-5',
            ],
            autocomplete: [
                'deepseek/deepseek-r1',
                'anthropic/claude-sonnet-4-5',
                'meta-llama/llama-3.3-70b-instruct',
            ],
            ocr: [
                'google/gemini-2.0-flash-001',
                'meta-llama/llama-3.2-90b-vision-instruct',
                'anthropic/claude-3-5-sonnet',
            ],
        },
        note: '100+ models via one key. Requires OPENROUTER_API_KEY. Use deepseek/deepseek-r1 for thorough reasoning.',
    },
    perplexity: {
        label: 'Perplexity (Web-grounded)',
        color: '#20B2AA',
        models: {
            categorization: ['sonar-pro', 'sonar'],
            autocomplete:   ['sonar-pro'],
            ocr:            [],  // Perplexity does not support vision
        },
        note: 'Agent API with live web search — can look up unknown vendors and ZRA codes online for maximum accuracy. Requires PERPLEXITY_API_KEY.',
    },
} as const;

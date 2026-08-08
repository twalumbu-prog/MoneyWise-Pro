/**
 * ai.provider.ts — Unified LLM provider abstraction.
 *
 * Supported providers:
 *   • Gemini      — Google's own REST endpoint (original)
 *   • OpenRouter  — 100+ models, OpenAI-compatible API
 *   • Perplexity  — Agent API (web-grounded, recommended) or Gateway (OpenAI-compat)
 *
 * Which provider + model to use is driven by the `ai_model_settings` DB table,
 * editable from Settings → AI & Automation.  Env-var keys still apply as
 * fallbacks when the DB has no value.
 *
 * Environment variables (keys — never stored in DB):
 *   GEMINI_API_KEY
 *   OPENROUTER_API_KEY
 *   PERPLEXITY_API_KEY
 */

import { getAIModelSettings } from './ai.settings.service';

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LLMResponse {
    text: string;
    provider: string;
    model: string;
}

// ─── OpenAI-compatible (OpenRouter / Perplexity Gateway) ────────────────────

async function callOpenAICompat(
    name: string,
    apiKey: string,
    baseUrl: string,
    model: string,
    messages: LLMMessage[],
    extraHeaders: Record<string, string> = {},
    timeoutMs = 15_000
): Promise<LLMResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const resp = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                ...extraHeaders,
            },
            body: JSON.stringify({ model, messages, temperature: 0, response_format: { type: 'json_object' } }),
            signal: controller.signal as any,
        });

        clearTimeout(timer);
        if (!resp.ok) throw new Error(`${name} API ${resp.status}: ${await resp.text()}`);

        const data = await resp.json();
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error(`${name}: empty response`);

        return { text, provider: name, model };
    } catch (err: any) {
        clearTimeout(timer);
        throw err;
    }
}

// ─── Perplexity Agent API (/responses) ──────────────────────────────────────
//
// This is the recommended path for accounting categorization.  The Agent API
// attaches a live web_search tool so the model can look up unknown vendors,
// ZRA fee codes, or any Zambian business on the web before categorizing —
// grounding the result in fact rather than pattern matching alone.

const CATEGORIZATION_JSON_SCHEMA = {
    name: 'expense_categorization',
    schema: {
        type: 'object',
        properties: {
            account_code: {
                type: 'string',
                description: 'The exact account code from the Chart of Accounts, or UNCATEGORIZED if unsure',
            },
            confidence: {
                type: 'number',
                description: 'Confidence 0.0 – 1.0',
            },
            reasoning: {
                type: 'string',
                description: 'One sentence explaining the category choice, including any web research used',
            },
        },
        required: ['account_code', 'confidence', 'reasoning'],
        additionalProperties: false,
    },
};

async function callPerplexityAgent(
    apiKey: string,
    systemPrompt: string,
    userPrompt: string,
    timeoutMs = 20_000
): Promise<LLMResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const model = 'sonar-pro';

    try {
        const resp = await fetch('https://api.perplexity.ai/responses', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                input: `${systemPrompt}\n\n${userPrompt}`,
                tools: [{ type: 'web_search' }],
                response_format: {
                    type: 'json_schema',
                    json_schema: CATEGORIZATION_JSON_SCHEMA,
                },
            }),
            signal: controller.signal as any,
        });

        clearTimeout(timer);
        if (!resp.ok) throw new Error(`Perplexity Agent API ${resp.status}: ${await resp.text()}`);

        const data = await resp.json();
        const text = data.output_text;
        if (!text) throw new Error('Perplexity Agent: empty output_text');

        return { text, provider: 'Perplexity-Agent', model };
    } catch (err: any) {
        clearTimeout(timer);
        throw err;
    }
}

// ─── Gemini helpers ──────────────────────────────────────────────────────────

async function callGeminiText(model: string, messages: LLMMessage[]): Promise<LLMResponse> {
    const apiKey = process.env.GEMINI_API_KEY!;
    const combined = messages.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: combined }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        }),
    });

    if (!resp.ok) throw new Error(`Gemini text API ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini: empty text response');
    return { text, provider: 'Gemini', model };
}

async function callGeminiVision(model: string, prompt: string, imageBase64: string, mimeType: string): Promise<LLMResponse> {
    const apiKey = process.env.GEMINI_API_KEY!;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);

    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 2048 },
            }),
            signal: controller.signal as any,
        });
        clearTimeout(timer);
        if (!resp.ok) throw new Error(`Gemini Vision API ${resp.status}: ${await resp.text()}`);
        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Gemini Vision: empty response');
        return { text, provider: 'Gemini', model };
    } catch (err: any) {
        clearTimeout(timer);
        throw err;
    }
}

// ─── Public API ──────────────────────────────────────────────────────────────

const OR_HEADERS = {
    'HTTP-Referer': 'https://moneywise.blueopus.cloud',
    'X-Title': 'MoneyWise Pro',
};

/**
 * Call the *configured* provider for text categorization.
 * Provider + model come from `ai_model_settings` DB table (5-min cached).
 * Gemini always runs as a parallel backup unless it's the only configured provider.
 */
export async function callAllCategorizationProviders(
    messages: LLMMessage[]
): Promise<LLMResponse[]> {
    const settings = await getAIModelSettings();
    const tasks: Promise<LLMResponse>[] = [];

    const geminiKey = process.env.GEMINI_API_KEY;
    const orKey     = process.env.OPENROUTER_API_KEY;
    const pplxKey   = process.env.PERPLEXITY_API_KEY;

    // Always include the configured primary provider
    const primary = settings.categorization_provider;

    if (primary === 'gemini' && geminiKey) {
        tasks.push(callGeminiText(settings.categorization_model, messages).catch(e => { throw e; }));
    } else if (primary === 'openrouter' && orKey) {
        tasks.push(callOpenAICompat('OpenRouter', orKey, 'https://openrouter.ai/api/v1', settings.categorization_model, messages, OR_HEADERS).catch(e => { throw e; }));
    } else if (primary === 'perplexity' && pplxKey) {
        if (settings.perplexity_mode === 'agent') {
            const sys = messages.find(m => m.role === 'system')?.content || '';
            const usr = messages.filter(m => m.role === 'user').map(m => m.content).join('\n');
            tasks.push(callPerplexityAgent(pplxKey, sys, usr).catch(e => { throw e; }));
        } else {
            tasks.push(callOpenAICompat('Perplexity-Gateway', pplxKey, 'https://api.perplexity.ai', settings.categorization_model, messages).catch(e => { throw e; }));
        }
    }

    // Always add Gemini as parallel backup when it's not already the primary,
    // to power the agreement-boost logic and provide redundancy.
    if (primary !== 'gemini' && geminiKey && geminiKey !== 'YOUR_GEMINI_API_KEY') {
        const backupModel = process.env.GEMINI_CATEGORIZATION_MODEL || 'gemini-2.5-flash';
        tasks.push(callGeminiText(backupModel, messages).catch(e => { throw e; }));
    }

    const settled = await Promise.allSettled(tasks);
    const results: LLMResponse[] = [];
    for (const r of settled) {
        if (r.status === 'fulfilled') {
            results.push(r.value);
        } else {
            console.warn('[AI Provider] Provider call failed:', r.reason?.message);
        }
    }
    return results;
}

/**
 * Call the *heavyweight* auto-complete model — configured separately in settings
 * so you can point it at a slower, more thorough reasoning model (e.g. deepseek-r1)
 * without affecting real-time categorization latency.
 */
export async function callAutoCompleteProvider(
    messages: LLMMessage[]
): Promise<LLMResponse | null> {
    const settings = await getAIModelSettings();
    const orKey    = process.env.OPENROUTER_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const pplxKey  = process.env.PERPLEXITY_API_KEY;

    const provider = settings.autocomplete_provider;

    try {
        if (provider === 'openrouter' && orKey) {
            return await callOpenAICompat('OpenRouter-AutoComplete', orKey, 'https://openrouter.ai/api/v1', settings.autocomplete_model, messages, OR_HEADERS, 60_000);
        }
        if (provider === 'perplexity' && pplxKey) {
            const sys = messages.find(m => m.role === 'system')?.content || '';
            const usr = messages.filter(m => m.role === 'user').map(m => m.content).join('\n');
            return await callPerplexityAgent(pplxKey, sys, usr, 60_000);
        }
        if (provider === 'gemini' && geminiKey) {
            return await callGeminiText(settings.autocomplete_model, messages);
        }
    } catch (err: any) {
        console.warn('[AI Provider] Auto-complete provider failed, falling back:', err.message);
    }

    // Fallback: try regular ensemble
    const results = await callAllCategorizationProviders(messages);
    return results[0] || null;
}

/**
 * Call OCR providers (vision) in parallel.
 * Gemini Vision is always primary; OpenRouter vision runs alongside if configured.
 */
export async function callAllOcrProviders(
    prompt: string,
    imageBase64: string,
    mimeType = 'image/jpeg'
): Promise<LLMResponse[]> {
    const settings  = await getAIModelSettings();
    const geminiKey = process.env.GEMINI_API_KEY;
    const orKey     = process.env.OPENROUTER_API_KEY;

    const tasks: Promise<LLMResponse>[] = [];

    if (geminiKey && geminiKey !== 'YOUR_GEMINI_API_KEY') {
        tasks.push(callGeminiVision(settings.ocr_model, prompt, imageBase64, mimeType).catch(e => { throw e; }));
    }

    const orOcrModel = settings.ocr_provider === 'openrouter' ? settings.ocr_model : process.env.OPENROUTER_OCR_MODEL;
    if (orKey && orOcrModel) {
        tasks.push((async () => {
            const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orKey}`, ...OR_HEADERS },
                body: JSON.stringify({
                    model: orOcrModel,
                    messages: [{
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
                        ],
                    }],
                    temperature: 0.1,
                    response_format: { type: 'json_object' },
                }),
                signal: AbortSignal.timeout(120_000),
            });
            if (!resp.ok) throw new Error(`OpenRouter Vision ${resp.status}: ${await resp.text()}`);
            const data = await resp.json();
            const text = data.choices?.[0]?.message?.content;
            if (!text) throw new Error('OpenRouter Vision: empty response');
            return { text, provider: 'OpenRouter-Vision', model: orOcrModel } as LLMResponse;
        })().catch(e => { throw e; }));
    }

    const settled = await Promise.allSettled(tasks);
    return settled
        .filter((r): r is PromiseFulfilledResult<LLMResponse> => r.status === 'fulfilled')
        .map(r => r.value);
}

/**
 * models.ts — Allowlisted models for the assistant.
 *
 * The client sends a model id with each message; it is validated against this
 * list before being forwarded. Without the allowlist a caller could point the
 * agent — which holds org-scoped read tools — at an arbitrary model id.
 *
 * All ids are OpenRouter slugs: one key, one dialect, many vendors.
 */

export interface AssistantModel {
    id: string;
    label: string;
    vendor: string;
    /** Shown in the picker so users understand the tradeoff. */
    blurb: string;
    /** Rough relative cost, for the picker's badge. */
    tier: 'fast' | 'balanced' | 'deep';
    /** Models that reliably drive multi-step tool use. */
    toolUse: boolean;
}

export const ASSISTANT_MODELS: AssistantModel[] = [
    {
        id: 'anthropic/claude-sonnet-4-5',
        label: 'Claude Sonnet 4.5',
        vendor: 'Anthropic',
        blurb: 'Best all-round reasoning and tool use. Recommended default.',
        tier: 'balanced',
        toolUse: true,
    },
    {
        id: 'anthropic/claude-3-5-haiku',
        label: 'Claude Haiku 3.5',
        vendor: 'Anthropic',
        blurb: 'Fast and cheap. Good for lookups and simple summaries.',
        tier: 'fast',
        toolUse: true,
    },
    {
        id: 'openai/gpt-4o',
        label: 'GPT-4o',
        vendor: 'OpenAI',
        blurb: 'Strong general reasoning, reliable structured output.',
        tier: 'balanced',
        toolUse: true,
    },
    {
        id: 'openai/gpt-4o-mini',
        label: 'GPT-4o mini',
        vendor: 'OpenAI',
        blurb: 'Low-latency option for quick questions.',
        tier: 'fast',
        toolUse: true,
    },
    {
        id: 'google/gemini-2.5-flash',
        label: 'Gemini 2.5 Flash',
        vendor: 'Google',
        blurb: 'Very fast, large context. Good for wide data sweeps.',
        tier: 'fast',
        toolUse: true,
    },
    {
        id: 'google/gemini-2.5-pro',
        label: 'Gemini 2.5 Pro',
        vendor: 'Google',
        blurb: 'Deeper analysis over large result sets.',
        tier: 'deep',
        toolUse: true,
    },
    {
        id: 'deepseek/deepseek-r1',
        label: 'DeepSeek R1',
        vendor: 'DeepSeek',
        // Free providers serving R1 accept `tools` but don't implement structured
        // tool calling — the model then writes its tool call into the prose and
        // the answer is unusable. It needs a paid provider to work here.
        blurb: 'Thorough step-by-step reasoning, but slower. Needs OpenRouter credits to use tools.',
        tier: 'deep',
        toolUse: true,
    },
];

/**
 * Gemini Flash rather than Sonnet, because it is what this account can actually
 * afford: OpenRouter pre-authorises the full `max_tokens` before running a
 * request, and on the current free-tier balance Sonnet is rejected with a 402
 * while Flash runs fine. Switch this to `anthropic/claude-sonnet-4-5` once
 * credits are topped up — it is the stronger model for multi-step analysis, and
 * users can already pick it from the model menu.
 */
export const DEFAULT_ASSISTANT_MODEL = 'google/gemini-2.5-flash';

export function resolveModel(requested?: string): string {
    if (!requested) return DEFAULT_ASSISTANT_MODEL;
    const hit = ASSISTANT_MODELS.find(m => m.id === requested);
    return hit ? hit.id : DEFAULT_ASSISTANT_MODEL;
}

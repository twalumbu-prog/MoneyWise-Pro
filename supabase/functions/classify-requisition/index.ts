
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LineItem {
    id?: string;
    description: string;
    amount: number;
}

interface ClassificationRequest {
    requisition_id: string;
    line_items: LineItem[];
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { requisition_id, line_items } = await req.json() as ClassificationRequest;

        if (!line_items || line_items.length === 0) {
            throw new Error("No line items provided");
        }

        // Fetch all accounts for mapping
        const { data: accounts } = await supabaseClient
            .from('accounts')
            .select('id, code, name')
            .eq('is_active', true);

        const accountMap = new Map<string, string>(accounts?.map((a: any) => [a.code, a.id]) || []);

        const results = [];
        for (let i = 0; i < line_items.length; i++) {
            const item = line_items[i];
            const result = await processItem(supabaseClient, item, requisition_id, i, accountMap);
            results.push(result);
        }

        return new Response(
            JSON.stringify({ results }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
});

async function processItem(supabase: any, item: LineItem, requisitionId: string, index: number, accountMap: Map<string, string>) {
    const normalized = normalizeDescription(item.description);
    const signature = await generateSignature(normalized);

    // 1. Rule Engine
    const ruleMatch = checkRules(normalized);
    if (ruleMatch) {
        const accountId = accountMap.get(ruleMatch.account_code);
        if (accountId) {
            return await logAndReturn(supabase, requisitionId, index, {
                account_id: accountId,
                account_code: ruleMatch.account_code,
                confidence: ruleMatch.confidence,
                intent: ruleMatch.intent,
                method: "RULE"
            }, item.id);
        }
    }

    // 2. Cache Lookup
    const { data: cached } = await supabase
        .from('ai_transaction_memory')
        .select('*, accounts(code)')
        .eq('description_signature', signature)
        .single();

    if (cached && cached.confidence > 0.8) {
        return await logAndReturn(supabase, requisitionId, index, {
            account_id: cached.system_account_id,
            account_code: cached.accounts?.code,
            confidence: cached.confidence,
            intent: cached.intent,
            method: "CACHE"
        }, item.id);
    }

    // 3. AI Intent (OpenAI GPT-4o-mini)
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
        return { item_id: item.id, suggestion: null, account_code: null, confidence: 0, method: "ERROR-NO-KEY" };
    }

    try {
        const aiResponse = await callAI(openaiKey, item.description);
        const suggestedCode = aiResponse.suggested_code;
        const accountId = accountMap.get(suggestedCode);

        const result = {
            account_id: accountId || null,
            account_code: suggestedCode,
            confidence: aiResponse.confidence,
            intent: aiResponse.intent,
            method: "AI"
        };

        return await logAndReturn(supabase, requisitionId, index, result, item.id);
    } catch (err) {
        console.error(`AI Error for ${item.description}:`, err);
        return { item_id: item.id, suggestion: null, account_code: null, confidence: 0, method: "AI-ERROR" };
    }
}

async function logAndReturn(supabase: any, requisitionId: string, index: number, result: any, itemId?: string) {
    await supabase.from('ai_classification_logs').insert({
        transaction_id: requisitionId,
        line_item_index: index,
        ai_intent: result.intent,
        suggested_account_id: result.account_id,
        method: result.method
    });

    return {
        item_id: itemId,
        suggestion: result.account_id,
        account_code: result.account_code,
        confidence: result.confidence,
        method: result.method
    };
}

async function callAI(apiKey: string, description: string) {
    let lastError = null;
    let retries = 3;

    while (retries > 0) {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: 'You are an accounting assistant. Classify the transaction description into an intent and suggest a 4-digit account code (e.g. 6001 for supplies, 6002 for travel). Respond ONLY in JSON: {"intent": {"category": "...", "tags": []}, "suggested_code": "...", "confidence": 0.0-1.0}' },
                        { role: 'user', content: description }
                    ],
                    response_format: { type: 'json_object' }
                }),
                signal: AbortSignal.timeout(10000) // 10s timeout
            });

            if (!response.ok) {
                const errBody = await response.text();
                throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errBody}`);
            }

            const data = await response.json();
            const content = JSON.parse(data.choices[0].message.content);
            return content;
        } catch (err) {
            console.error(`AI Attempt failed (${retries} left):`, err.message);
            lastError = err;
            retries--;
            if (retries > 0) await new Promise(r => setTimeout(r, 1000));
        }
    }

    throw lastError || new Error("AI Classification failed after all retries");
}

function normalizeDescription(desc: string): string {
    return desc.toLowerCase().trim().replace(/[^a-z0-9 ]/g, "");
}

async function generateSignature(text: string): Promise<string> {
    const msgUint8 = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function checkRules(normalized: string) {
    const rules = [
        { pattern: /airtime|mobile|data|bundle/i, account_code: '6004' },
        { pattern: /fuel|petrol|diesel|taxi|uber|bolt/i, account_code: '6002' },
        { pattern: /lunch|meal|dinner|hotel|food/i, account_code: '6003' },
        { pattern: /paper|pen|stapler|stationery|ink|toner/i, account_code: '6001' }
    ];

    for (const rule of rules) {
        if (rule.pattern.test(normalized)) {
            return { account_code: rule.account_code, confidence: 0.95, intent: { rule_match: true } };
        }
    }
    return null;
}

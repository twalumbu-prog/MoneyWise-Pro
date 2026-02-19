
import { CATEGORIZATION_SYSTEM_PROMPT, buildCategorizationPrompt } from './prompts';
import { memoryService } from './memory.service';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Debug logging for API key detection
console.log('[AI Service] OPENAI_API_KEY loaded:', OPENAI_API_KEY ? 'Yes (length: ' + OPENAI_API_KEY.length + ')' : 'No');
console.log('[AI Service] GEMINI_API_KEY loaded:', GEMINI_API_KEY ? 'Yes' : 'No');

export interface SuggestionResult {
    account_code: string | null;
    confidence: number;
    reasoning: string;
    method: string;
}

export const aiService = {
    async suggestCategory(accounts: any[], description: string, amount: number): Promise<SuggestionResult> {
        console.log(`[AI Service] suggestCategory: ${description} (K${amount})`);
        const results = await this.suggestBatch(accounts, [{ description, amount }]);
        return results[0];
    },

    async suggestBatch(accounts: any[], lineItems: any[]): Promise<SuggestionResult[]> {
        console.log(`[AI Service] suggestBatch: Processing ${lineItems.length} items with ${accounts.length} accounts.`);
        const results: SuggestionResult[] = [];

        for (const [index, item] of lineItems.entries()) {
            console.log(`[AI Service] Processing item ${index + 1}/${lineItems.length}: "${item.description}"`);
            const normalized = item.description.toLowerCase().trim();

            // 0. Memory Look-up (Historical feedback)
            console.log(`[AI Service] Step 0: Checking AI Memory for "${normalized}"...`);
            const memoryMatch = await memoryService.lookup(item.description);
            if (memoryMatch) {
                // Find the account in the provided list to get its code
                const matchedAccount = accounts.find(a => (a.id || a.Id) === memoryMatch.account_id);
                if (matchedAccount) {
                    const code = String(matchedAccount.code || matchedAccount.AcctNum || matchedAccount.Id || '');
                    console.log(`[AI Service] ✅ Memory Match Found: ${code} (Confidence: ${memoryMatch.confidence})`);
                    results.push({
                        account_code: code,
                        confidence: memoryMatch.confidence,
                        reasoning: 'Matches a previously validated transaction in history.',
                        method: 'MEMORY'
                    });
                    continue;
                } else {
                    console.log(`[AI Service] Memory match account_id ${memoryMatch.account_id} not available in current account list.`);
                }
            }

            // 1. Rule Engine
            console.log(`[AI Service] Step 1: Checking Rule Engine for "${normalized}"...`);
            const ruleMatch = this.checkRules(normalized);
            if (ruleMatch) {
                // IMPORTANT: Only use the rule if it maps to an actual account in the provided list
                const exists = accounts.some(a =>
                    String(a.code || a.AcctNum || '').toLowerCase() === String(ruleMatch.account_code).toLowerCase() ||
                    String(a.name || a.Name || '').toLowerCase() === String(ruleMatch.account_code).toLowerCase()
                );

                if (exists) {
                    console.log(`[AI Service] ✅ Rule Match Found & Validated: ${ruleMatch.account_code} (Reason: ${ruleMatch.pattern})`);
                    results.push({
                        account_code: ruleMatch.account_code,
                        confidence: ruleMatch.confidence,
                        reasoning: `Rule matched: ${ruleMatch.pattern}`,
                        method: 'RULE'
                    });
                    continue;
                } else {
                    console.log(`[AI Service] ℹ️ Rule matched "${ruleMatch.account_code}" but this account is not in the current list. Falling back to AI.`);
                }
            } else {
                console.log(`[AI Service] No rule match found.`);
            }

            // 2. OpenAI
            if (OPENAI_API_KEY) {
                try {
                    console.log(`[AI Service] Step 2: Calling OpenAI for "${item.description}"...`);
                    const start = Date.now();
                    const aiResult = await this.callOpenAI(item.description, accounts);
                    console.log(`[AI Service] ✅ OpenAI Response in ${Date.now() - start}ms:`, aiResult);
                    results.push({
                        account_code: aiResult.account_code,
                        confidence: aiResult.confidence,
                        reasoning: `AI Suggestion: ${aiResult.reasoning || aiResult.intent?.category || 'General'}`,
                        method: 'AI'
                    });
                    continue;
                } catch (err: any) {
                    console.error(`[AI Service] ❌ OpenAI Error for "${item.description}":`, err.message);
                }
            } else {
                console.warn('[AI Service] Step 2: OPENAI_API_KEY not found, skipping OpenAI.');
            }

            // 3. Gemini
            if (GEMINI_API_KEY) {
                try {
                    console.log(`[AI Service] Step 3: Calling Gemini for "${item.description}"...`);
                    const start = Date.now();
                    const geminiResult = await this.suggestCategoryGemini(accounts, item.description, item.amount);
                    console.log(`[AI Service] ✅ Gemini Response in ${Date.now() - start}ms:`, geminiResult);
                    results.push(geminiResult);
                    continue;
                } catch (err: any) {
                    console.error(`[AI Service] ❌ Gemini Error for "${item.description}":`, err.message);
                }
            } else {
                console.warn('[AI Service] Step 3: GEMINI_API_KEY not found, skipping Gemini.');
            }

            // 4. Default Fallback
            console.warn(`[AI Service] ⚠️ All classification methods failed for "${item.description}"`);
            results.push({
                account_code: null,
                confidence: 0,
                reasoning: 'No confident match found (AI Quotas exceeded or services unreachable)',
                method: 'FAILED'
            });
        }

        console.log(`[AI Service] suggestBatch completed with ${results.length} results.`);
        return results;
    },

    checkRules(normalized: string) {
        const rules = [
            { pattern: /\b(lunch|dinner|breakfast|meal|food|restaurant|kfc|hungry lion|pizza)\b/i, account_code: '5001' },
            { pattern: /\b(taxi|uber|bolt|yango|transport|bus fare|fuel|petrol|diesel)\b/i, account_code: '5002' },
            { pattern: /\b(airtime|data|internet|bundle|mtn|airtel|zamtel|liquid|starlink)\b/i, account_code: '5003' },
            { pattern: /\b(stationary|paper|pen|printing|toner|office supplies)\b/i, account_code: '5004' },
            { pattern: /\b(cleaning|detergent|doom|soap|toilet paper)\b/i, account_code: '5005' },
            { pattern: /\b(water|electricity|zesco|bills|utility)\b/i, account_code: '5006' },
            { pattern: /\b(rent|lease|office space)\b/i, account_code: '5007' },
            { pattern: /\b(salary|wages|payroll|personnel|staff payment|napsa|pension)\b/i, account_code: '6001' }
        ];

        for (const rule of rules) {
            if (rule.pattern.test(normalized)) {
                return { account_code: rule.account_code, confidence: 0.95, pattern: rule.pattern.toString() };
            }
        }
        return null;
    },

    async callOpenAI(description: string, accounts: any[]) {
        const userPrompt = buildCategorizationPrompt(accounts, description, 0); // amount 0 for now
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: CATEGORIZATION_SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt }
                ],
                response_format: { type: 'json_object' }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`OpenAI API Status ${response.status}: ${errText}`);
        }
        const data = await response.json();
        return JSON.parse(data.choices[0].message.content);
    },

    async suggestCategoryGemini(accounts: any[], description: string, amount: number): Promise<SuggestionResult> {
        // Using REST API directly to avoid SDK dependency issues
        const userPrompt = buildCategorizationPrompt(accounts, description, amount);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`;

        const payload = {
            contents: [{
                parts: [{
                    text: CATEGORIZATION_SYSTEM_PROMPT + '\n' + userPrompt
                }]
            }],
            generationConfig: {
                responseMimeType: "application/json"
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gemini API Status ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) throw new Error('Empty response from Gemini');

        const jsonText = text.replace(/```json\n?|\n?```/g, '').trim();
        const parsed = JSON.parse(jsonText);

        return {
            account_code: parsed.account_code || 'UNCATEGORIZED',
            confidence: parsed.confidence || 0,
            reasoning: parsed.reasoning || 'Gemini Suggestion',
            method: 'AI-GEMINI'
        };
    }
};


import { CATEGORIZATION_SYSTEM_PROMPT, buildCategorizationPrompt } from './prompts';
import { memoryService } from './memory.service';
import { ruleEngine } from './rule.engine';

const AI_TEST_MODE = process.env.AI_TEST_MODE === 'true';

export interface SuggestionResult {
    account_code: string | null;
    confidence: number;
    reasoning: string;
    method: string;
}

export const aiService = {
    async suggestCategory(accounts: any[], description: string, amount: number): Promise<SuggestionResult> {
        const results = await this.suggestBatch(accounts, [{ description, amount }]);
        return results[0];
    },

    /**
     * Parallelized batch suggestion with controlled concurrency.
     */
    async suggestBatch(accounts: any[], lineItems: any[]): Promise<SuggestionResult[]> {
        console.log(`[AI Service] suggestBatch: Processing ${lineItems.length} items.`);

        // 1. Ensure rules are loaded
        await ruleEngine.loadRules();

        // Controlled concurrency: process in chunks of 5
        const CHUNK_SIZE = 5;
        const allResults: SuggestionResult[] = [];

        for (let i = 0; i < lineItems.length; i += CHUNK_SIZE) {
            const chunk = lineItems.slice(i, i + CHUNK_SIZE);
            const chunkPromises = chunk.map(item => this.classifyItem(accounts, item));
            const chunkResults = await Promise.all(chunkPromises);
            allResults.push(...chunkResults);
        }

        return allResults;
    },

    async classifyItem(accounts: any[], item: { description: string, amount: number }): Promise<SuggestionResult> {
        if (AI_TEST_MODE) {
            // ... (keep mock logic)
            const desc = item.description.toLowerCase();
            if (desc.includes('kfc') || desc.includes('subway') || desc.includes('pizza') || desc.includes('diner')) return { account_code: '1001', confidence: 0.95, reasoning: 'MOCK: Staff Meal AI', method: 'AI' };
            if (desc.includes('microsoft') || desc.includes('amazon') || desc.includes('oracle') || desc.includes('zesco')) return { account_code: '4000', confidence: 0.95, reasoning: 'MOCK: Vendor AI', method: 'AI' };
            if (desc.includes('office') || desc.includes('stationery') || desc.includes('paper')) return { account_code: '6101', confidence: 0.95, reasoning: 'MOCK: Office Supplies AI', method: 'AI' };
            if (desc.includes('uber') || desc.includes('emirates') || desc.includes('hilton') || desc.includes('cab')) return { account_code: '6200', confidence: 0.95, reasoning: 'MOCK: Travel AI', method: 'AI' };
            if (desc.includes('water') || desc.includes('electric') || desc.includes('waste')) return { account_code: '6100', confidence: 0.98, reasoning: 'MOCK: Utility AI', method: 'AI' };
            if (desc.includes('consulting') || desc.includes('fee') || desc.includes('sale') || desc.includes('revenue')) return { account_code: '4100', confidence: 0.98, reasoning: 'MOCK: Income AI', method: 'AI' };
            return { account_code: '9999', confidence: 0.50, reasoning: 'MOCK: Generic fallback', method: 'AI' };
        }

        // TIER 1: Rule Engine (Pattern Matching) - Highest Priority
        const ruleMatch = ruleEngine.match(item.description, item.amount);
        if (ruleMatch.matched && ruleMatch.accountId) {
            console.log(`[AI Service] Rule Match: ${item.description} -> ${ruleMatch.accountId}`);
            return {
                account_code: ruleMatch.accountId,
                confidence: ruleMatch.confidence,
                reasoning: ruleMatch.reasoning,
                method: 'RULE'
            };
        }

        // TIER 2: Memory Service (Historical Learning) - Second Priority
        const memoryMatch = await memoryService.lookup({ description: item.description, amount: item.amount });
        if (memoryMatch) {
            console.log(`[AI Service] Memory Match: ${item.description} -> ${memoryMatch.account_id}`);
            return {
                account_code: memoryMatch.account_id,
                confidence: memoryMatch.confidence,
                reasoning: 'Matched historical transaction memory.',
                method: 'MEMORY'
            };
        }

        // TIER 3: AI Models (Ensemble Inference) - Fallback
        const timeout = <T>(promise: Promise<T>, ms: number, name: string): Promise<T> => {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error(`${name} timed out after ${ms}ms`)), ms);
                promise.then(res => { clearTimeout(timer); resolve(res); }).catch(err => { clearTimeout(timer); reject(err); });
            });
        };

        const aiPromises: Promise<SuggestionResult>[] = [];

        // 1. OpenAI (Primary AI)
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        if (OPENAI_API_KEY && OPENAI_API_KEY !== 'YOUR_OPENAI_API_KEY') {
            aiPromises.push(timeout(
                this.callOpenAI(item.description, accounts).then(res => ({
                    account_code: res.account_code,
                    confidence: res.confidence,
                    reasoning: `OpenAI: ${res.reasoning || 'Categorized'}`,
                    method: 'AI-OPENAI'
                })),
                10000,
                'OpenAI'
            ).catch(err => {
                console.warn(`[AI Service] OpenAI failed: ${err.message}`);
                return null as any;
            }));
        }

        // 2. Gemini (Secondary AI / Diversity)
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (GEMINI_API_KEY && GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY') {
            aiPromises.push(timeout(
                this.suggestCategoryGemini(accounts, item.description, item.amount),
                10000,
                'Gemini'
            ).catch(err => {
                console.warn(`[AI Service] Gemini failed: ${err.message}`);
                return null as any;
            }));
        }

        // Run in parallel
        const results = await Promise.all(aiPromises);

        // Filter results: MUST be in the provided accounts list
        const validResults = results.filter((r: SuggestionResult) => {
            if (!r || !r.account_code) return false;
            // Ensure the code exists in our provided list
            const exists = accounts.some((a: any) => String(a.code) === String(r.account_code));
            if (!exists && r.account_code !== 'UNCATEGORIZED') {
                console.warn(`[AI Service] Hallucination detected: AI suggested ${r.account_code} but it is not in the COA. Filtering out.`);
                return false;
            }
            return true;
        });

        if (validResults.length === 0) {
            console.warn(`[AI Service] No valid suggestions from ensemble (all hallucinations or failures).`);
            return {
                account_code: 'UNCATEGORIZED',
                confidence: 0,
                reasoning: `The AI suggested generic codes (${results.map((r: any) => r?.account_code).join(', ')}) instead of matching your specific chart of accounts. Please select the category manually.`,
                method: 'AI-FAILED'
            };
        }

        // Rank by confidence (descending)
        return validResults.sort((a: SuggestionResult, b: SuggestionResult) => b.confidence - a.confidence)[0];
    },

    async callOpenAI(description: string, accounts: any[]) {
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        const userPrompt = buildCategorizationPrompt(accounts, description, 0);
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

        if (!response.ok) throw new Error(`OpenAI API Status ${response.status}`);
        const data = await response.json();
        return JSON.parse(data.choices[0].message.content);
    },

    async suggestCategoryGemini(accounts: any[], description: string, amount: number): Promise<SuggestionResult> {
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const userPrompt = buildCategorizationPrompt(accounts, description, amount);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

        const payload = {
            contents: [{
                parts: [{
                    text: CATEGORIZATION_SYSTEM_PROMPT + '\n' + userPrompt
                }]
            }],
            generationConfig: { responseMimeType: "application/json" }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error(`[AI Service] Gemini API Error Response:`, errBody);
            throw new Error(`Gemini API Status ${response.status}`);
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

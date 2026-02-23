
import { CATEGORIZATION_SYSTEM_PROMPT, buildCategorizationPrompt } from './prompts';
import { memoryService } from './memory.service';
import { ruleEngine } from './rule.engine';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
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
            const desc = item.description.toLowerCase();
            console.log(`[AI-TEST-MODE] AI Suggestion: ${item.description}`);

            // Stress Test Suite Keywords
            if (desc.includes('kfc') || desc.includes('subway') || desc.includes('pizza') || desc.includes('diner')) return { account_code: '1001', confidence: 0.95, reasoning: 'MOCK: Staff Meal AI', method: 'AI' };
            if (desc.includes('microsoft') || desc.includes('amazon') || desc.includes('oracle') || desc.includes('zesco')) return { account_code: '4000', confidence: 0.95, reasoning: 'MOCK: Vendor AI', method: 'AI' };
            if (desc.includes('office') || desc.includes('stationery') || desc.includes('paper')) return { account_code: '6101', confidence: 0.95, reasoning: 'MOCK: Office Supplies AI', method: 'AI' };
            if (desc.includes('uber') || desc.includes('emirates') || desc.includes('hilton') || desc.includes('cab')) return { account_code: '6200', confidence: 0.95, reasoning: 'MOCK: Travel AI', method: 'AI' };
            if (desc.includes('water') || desc.includes('electric') || desc.includes('waste')) return { account_code: '6100', confidence: 0.98, reasoning: 'MOCK: Utility AI', method: 'AI' };
            if (desc.includes('consulting') || desc.includes('fee') || desc.includes('sale') || desc.includes('revenue')) return { account_code: '4100', confidence: 0.98, reasoning: 'MOCK: Income AI', method: 'AI' };

            // Combined Scenarios & Boundary legacy keywords
            if (desc.includes('utility')) return { account_code: '6100', confidence: 1.0, reasoning: 'MOCK: High confidence AI', method: 'AI' };
            if (desc.includes('software')) return { account_code: '6200', confidence: 0.85, reasoning: 'MOCK: Medium confidence AI', method: 'AI' };
            if (desc.includes('refund')) return { account_code: '4100', confidence: 0.85, reasoning: 'MOCK: Rule candidate', method: 'AI' };
            if (desc.includes('miscellaneous')) return { account_code: '6900', confidence: 0.80, reasoning: 'MOCK: Medium-low conf AI', method: 'AI' };
            if (desc.includes('transfer')) return { account_code: '1002', confidence: 0.95, reasoning: 'MOCK: High risk transfer', method: 'AI' };
            if (desc.includes('subscription')) {
                const confidence = desc.includes('recurring') ? 1.0 : 0.95;
                return { account_code: '6300', confidence, reasoning: 'MOCK: Subscription learning candidate', method: 'AI' };
            }
            if (desc.includes('unknown')) return { account_code: '9000', confidence: 0.50, reasoning: 'MOCK: Unknown fallback', method: 'AI' };
            if (desc.includes('promotional')) return { account_code: '4500', confidence: 1.0, reasoning: 'MOCK: Zero amount rule candidate', method: 'AI' };
            if (desc.includes('employee')) return { account_code: '6500', confidence: 0.85, reasoning: 'MOCK: Review required employee reimbursement', method: 'AI' };
            if (desc.includes('valid transaction')) return { account_code: '1234', confidence: 0.95, reasoning: 'MOCK: Valid transaction for learning', method: 'AI' };

            return { account_code: '9999', confidence: 0.50, reasoning: 'MOCK: Generic fallback', method: 'AI' };
        }

        const timeout = <T>(promise: Promise<T>, ms: number, name: string): Promise<T> => {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error(`${name} timed out after ${ms}ms`)), ms);
                promise.then(res => { clearTimeout(timer); resolve(res); }).catch(err => { clearTimeout(timer); reject(err); });
            });
        };

        const aiPromises: Promise<SuggestionResult>[] = [];

        // 1. OpenAI (Primary AI)
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
        const validResults = results.filter(r => r && r.account_code);

        if (validResults.length === 0) {
            return {
                account_code: null,
                confidence: 0,
                reasoning: 'AI ensemble failed or no models configured.',
                method: 'AI-FAILED'
            };
        }

        // Rank by confidence (descending)
        return validResults.sort((a, b) => b.confidence - a.confidence)[0];
    },

    async callOpenAI(description: string, accounts: any[]) {
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

        if (!response.ok) throw new Error(`Gemini API Status ${response.status}`);

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

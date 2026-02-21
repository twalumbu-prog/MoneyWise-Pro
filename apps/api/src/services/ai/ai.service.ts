
import { CATEGORIZATION_SYSTEM_PROMPT, buildCategorizationPrompt } from './prompts';
import { memoryService } from './memory.service';
import { ruleEngine } from './rule.engine';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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
        const normalized = item.description.toLowerCase().trim();

        // 0. Memory Look-up
        const memoryMatch = await memoryService.lookup(item.description);
        if (memoryMatch) {
            const matchedAccount = accounts.find(a => (a.id || a.Id) === memoryMatch.account_id);
            if (matchedAccount) {
                return {
                    account_code: String(matchedAccount.code || matchedAccount.AcctNum || ''),
                    confidence: memoryMatch.confidence,
                    reasoning: 'Matches historical transaction memory.',
                    method: 'MEMORY'
                };
            }
        }

        // 1. Rule Engine
        const ruleMatch = ruleEngine.match(item.description, item.amount);
        if (ruleMatch.matched) {
            const matchedAccount = accounts.find(a => (a.id || a.Id) === ruleMatch.accountId);
            if (matchedAccount) {
                return {
                    account_code: String(matchedAccount.code || matchedAccount.AcctNum || ''),
                    confidence: ruleMatch.confidence,
                    reasoning: ruleMatch.reasoning,
                    method: 'RULE'
                };
            }
        }

        // 2. OpenAI Fallback
        if (OPENAI_API_KEY && OPENAI_API_KEY !== 'YOUR_OPENAI_API_KEY') {
            try {
                const aiResult = await this.callOpenAI(item.description, accounts);
                return {
                    account_code: aiResult.account_code,
                    confidence: aiResult.confidence,
                    reasoning: `AI Suggestion: ${aiResult.reasoning || 'OpenAI Analysis'}`,
                    method: 'AI-OPENAI'
                };
            } catch (err: any) {
                console.error(`[AI Service] OpenAI Error:`, err.message);
            }
        }

        // 3. Gemini Fallback
        if (GEMINI_API_KEY && GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY') {
            try {
                return await this.suggestCategoryGemini(accounts, item.description, item.amount);
            } catch (err: any) {
                console.error(`[AI Service] Gemini Error:`, err.message);
            }
        }

        return {
            account_code: null,
            confidence: 0,
            reasoning: 'All classification methods failed.',
            method: 'FAILED'
        };
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
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`;

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

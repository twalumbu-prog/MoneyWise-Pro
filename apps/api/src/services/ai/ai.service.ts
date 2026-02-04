
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CATEGORIZATION_SYSTEM_PROMPT, buildCategorizationPrompt } from './prompts';

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
        const results = await this.suggestBatch(accounts, [{ description, amount }]);
        return results[0];
    },

    async suggestBatch(accounts: any[], lineItems: any[]): Promise<SuggestionResult[]> {
        const results: SuggestionResult[] = [];

        for (const item of lineItems) {
            const normalized = item.description.toLowerCase().trim();

            // 1. Rule Engine (Expanded for common failures)
            const ruleMatch = this.checkRules(normalized);
            if (ruleMatch) {
                results.push({
                    account_code: ruleMatch.account_code,
                    confidence: ruleMatch.confidence,
                    reasoning: `Rule matched: ${ruleMatch.pattern}`,
                    method: 'RULE'
                });
                continue;
            }

            // 2. OpenAI (High Priority Fallback)
            if (OPENAI_API_KEY) {
                try {
                    console.log('[AI] Calling OpenAI for:', item.description);
                    const aiResult = await this.callOpenAI(item.description, accounts);
                    results.push({
                        account_code: aiResult.account_code, // Adjusted to match expected key from OpenAI
                        confidence: aiResult.confidence,
                        reasoning: `AI Suggestion: ${aiResult.reasoning || aiResult.intent?.category || 'General'}`,
                        method: 'AI'
                    });
                    continue;
                } catch (err: any) {
                    console.error('[AI] OpenAI Error:', err.message);
                }
            } else {
                console.warn('[AI] OPENAI_API_KEY not available, skipping OpenAI fallback');
            }

            // 3. Gemini (Second Priority Fallback - REST API)
            if (GEMINI_API_KEY) {
                try {
                    console.log('[AI] Calling Gemini (REST) for:', item.description);
                    const geminiResult = await this.suggestCategoryGemini(accounts, item.description, item.amount);
                    results.push(geminiResult);
                    continue;
                } catch (err: any) {
                    console.error('[AI] Gemini Error:', err.message);
                }
            }

            // 4. Default Fallback
            results.push({
                account_code: null,
                confidence: 0,
                reasoning: 'No confident match found (AI Quotas exceeded or services unreachable)',
                method: 'FAILED'
            });
        }

        return results;
    },

    checkRules(normalized: string) {
        const rules = [
            // Utilities - Electricity (5002) - SPECIFIC USER CASE
            { pattern: /\b(zesco|electricity|power units|prepaid units)\b/i, account_code: '5002' },
            // Utilities - Water (5003) - SPECIFIC USER CASE
            { pattern: /\b(water bill|lwsc|sewerage|water supply)\b/i, account_code: '5003' },
            // Rent Expense (5001) - SPECIFIC USER CASE
            { pattern: /\b(rent|lease|rental|tenancy)\b/i, account_code: '5001' },

            // Bank Charges (7001) - SPECIFIC USER CASE
            { pattern: /\b(bank charges|bank fee|transaction fee|transfer fee|commission|interest expense|monthly fee)\b/i, account_code: '7001' },
            // Hosting & Domain (5004 - Internet/Comms or 5015 - Software/IT)
            { pattern: /\b(hosting|domain|email hosting|godaddy|bluehost|cloud)\b/i, account_code: '5004' },

            // Internet & Communications (5004) - REFINED
            { pattern: /\b(airtime|data|bundle|internet|wifi|wi-fi|broadband|talk\s*time|subscription)\b/i, account_code: '5004' },
            // Transport & Fuel (5008)
            { pattern: /\b(fuel|petrol|diesel|taxi|uber|bolt|transport|travel|bus|flight|parking|toll)\b/i, account_code: '5008' },
            // Meals & Catering (5009)
            { pattern: /\b(lunch|meal|dinner|food|catering|refreshment|breakfast|snack|coffee|tea|beverage)\b/i, account_code: '5009' },
            // Office Supplies (5005)
            { pattern: /\b(paper|pen|stapler|stationery|ink|toner|pencil|marker|chalk|exercise|textbook|book|notebook)\b/i, account_code: '5005' },
            // Printing & Stationery (5006)
            { pattern: /\b(print|copy|photocopy|binding|laminating)\b/i, account_code: '5006' },
            // Cleaning & Sanitation (5013)
            { pattern: /\b(cleaner|soap|detergent|janitorial|toilet|scrub|broom|mop|sanitizer|disinfectant|tissue|wipes|sanitary)\b/i, account_code: '5013' },
            // Educational / Supplies (9002)
            { pattern: /\b(material|classroom|school supplies|teaching aid|educational)\b/i, account_code: '9002' },
            // Repairs & Maintenance (5007)
            { pattern: /\b(repair|maintenance|fix|broken|plumbing|electrical|bulb|paint|renovation)\b/i, account_code: '5007' },
            // Security Services (5014)
            { pattern: /\b(security|guard|alarm|surveillance)\b/i, account_code: '5014' },
            // Salaries & Personnel (6001)
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

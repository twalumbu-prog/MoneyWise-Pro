
import { CATEGORIZATION_SYSTEM_PROMPT, buildCategorizationPrompt, CategorizationExample } from './prompts';
import { memoryService } from './memory.service';
import { ruleEngine } from './rule.engine';

const AI_TEST_MODE = process.env.AI_TEST_MODE === 'true';
const GEMINI_MODEL = process.env.GEMINI_CATEGORIZATION_MODEL || 'gemini-2.5-flash';

export interface SuggestionResult {
    account_code: string | null;
    confidence: number;
    reasoning: string;
    method: string;
}

export interface ClassifyItem {
    description: string;
    amount: number;
    receipt_data?: any;
    organizationId?: string;
}

export const aiService = {
    async suggestCategory(accounts: any[], description: string, amount: number): Promise<SuggestionResult> {
        const results = await this.suggestBatch(accounts, [{ description, amount }]);
        return results[0];
    },

    /**
     * Parallelized batch suggestion with controlled concurrency.
     */
    async suggestBatch(accounts: any[], lineItems: ClassifyItem[]): Promise<SuggestionResult[]> {
        console.log(`[AI Service] suggestBatch: Processing ${lineItems.length} items.`);
        await ruleEngine.loadRules();

        const CHUNK_SIZE = 5;
        const allResults: SuggestionResult[] = [];
        for (let i = 0; i < lineItems.length; i += CHUNK_SIZE) {
            const chunk = lineItems.slice(i, i + CHUNK_SIZE);
            const chunkResults = await Promise.all(chunk.map(item => this.classifyItem(accounts, item)));
            allResults.push(...chunkResults);
        }
        return allResults;
    },

    /**
     * Hybrid single-item classification: deterministic rules + org memory,
     * then the model ensemble. Account references are always resolved to a
     * concrete COA code (never a raw UUID).
     */
    async classifyItem(accounts: any[], item: ClassifyItem): Promise<SuggestionResult> {
        if (AI_TEST_MODE) {
            const desc = item.description.toLowerCase();
            if (desc.includes('kfc') || desc.includes('subway') || desc.includes('pizza') || desc.includes('diner')) return { account_code: '1001', confidence: 0.95, reasoning: 'MOCK: Staff Meal AI', method: 'AI' };
            if (desc.includes('microsoft') || desc.includes('amazon') || desc.includes('oracle') || desc.includes('zesco')) return { account_code: '4000', confidence: 0.95, reasoning: 'MOCK: Vendor AI', method: 'AI' };
            if (desc.includes('office') || desc.includes('stationery') || desc.includes('paper')) return { account_code: '6101', confidence: 0.95, reasoning: 'MOCK: Office Supplies AI', method: 'AI' };
            if (desc.includes('uber') || desc.includes('emirates') || desc.includes('hilton') || desc.includes('cab')) return { account_code: '6200', confidence: 0.95, reasoning: 'MOCK: Travel AI', method: 'AI' };
            if (desc.includes('water') || desc.includes('electric') || desc.includes('waste')) return { account_code: '6100', confidence: 0.98, reasoning: 'MOCK: Utility AI', method: 'AI' };
            if (desc.includes('consulting') || desc.includes('fee') || desc.includes('sale') || desc.includes('revenue')) return { account_code: '4100', confidence: 0.98, reasoning: 'MOCK: Income AI', method: 'AI' };
            return { account_code: '9999', confidence: 0.50, reasoning: 'MOCK: Generic fallback', method: 'AI' };
        }

        // TIER 1: Rule Engine — resolve the rule's target account (UUID) to its COA code.
        const ruleMatch = ruleEngine.match(item.description, item.amount, undefined, item.organizationId);
        if (ruleMatch.matched && ruleMatch.accountId) {
            const acc = this.findAccountById(accounts, ruleMatch.accountId);
            if (acc) {
                return {
                    account_code: this.codeOf(acc),
                    confidence: ruleMatch.confidence,
                    reasoning: ruleMatch.reasoning,
                    method: 'RULE',
                };
            }
        }

        // TIER 2: Organizational memory (only when we know the org).
        if (item.organizationId) {
            const memoryMatch = await memoryService.lookup({
                description: item.description,
                amount: item.amount,
                organizationId: item.organizationId,
            });
            if (memoryMatch) {
                const acc = this.findAccountById(accounts, memoryMatch.account_id);
                if (acc) {
                    return {
                        account_code: this.codeOf(acc),
                        confidence: memoryMatch.confidence,
                        reasoning: 'Matched a previously confirmed transaction for this organization.',
                        method: memoryMatch.method,
                    };
                }
            }
        }

        // TIER 3: Model ensemble (few-shot grounded when an org is known).
        let examples: CategorizationExample[] = [];
        if (item.organizationId) {
            examples = (await memoryService.getExamples(item.organizationId, item.description, 5))
                .map(e => this.exampleFor(accounts, e))
                .filter((e): e is CategorizationExample => !!e);
        }
        return this.classifyWithModels(accounts, item, examples);
    },

    /**
     * PURE model ensemble (OpenAI + Gemini) with strict exact-code validation.
     * No rule/memory tiers here — callers that want those use classifyItem or
     * the DecisionRouter. Used directly by the DecisionRouter for its AI tier.
     */
    async classifyWithModels(accounts: any[], item: ClassifyItem, examples: CategorizationExample[] = []): Promise<SuggestionResult> {
        if (AI_TEST_MODE) {
            const desc = item.description.toLowerCase();
            if (desc.includes('kfc') || desc.includes('subway') || desc.includes('pizza') || desc.includes('diner')) return { account_code: '1001', confidence: 0.95, reasoning: 'MOCK: Staff Meal AI', method: 'AI' };
            if (desc.includes('microsoft') || desc.includes('amazon') || desc.includes('oracle') || desc.includes('zesco')) return { account_code: '4000', confidence: 0.95, reasoning: 'MOCK: Vendor AI', method: 'AI' };
            if (desc.includes('office') || desc.includes('stationery') || desc.includes('paper')) return { account_code: '6101', confidence: 0.95, reasoning: 'MOCK: Office Supplies AI', method: 'AI' };
            if (desc.includes('uber') || desc.includes('emirates') || desc.includes('hilton') || desc.includes('cab')) return { account_code: '6200', confidence: 0.95, reasoning: 'MOCK: Travel AI', method: 'AI' };
            if (desc.includes('water') || desc.includes('electric') || desc.includes('waste')) return { account_code: '6100', confidence: 0.98, reasoning: 'MOCK: Utility AI', method: 'AI' };
            if (desc.includes('consulting') || desc.includes('fee') || desc.includes('sale') || desc.includes('revenue')) return { account_code: '4100', confidence: 0.98, reasoning: 'MOCK: Income AI', method: 'AI' };
            return { account_code: '9999', confidence: 0.50, reasoning: 'MOCK: Generic fallback', method: 'AI' };
        }

        const timeout = <T>(promise: Promise<T>, ms: number, name: string): Promise<T> =>
            new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error(`${name} timed out after ${ms}ms`)), ms);
                promise.then(res => { clearTimeout(timer); resolve(res); }).catch(err => { clearTimeout(timer); reject(err); });
            });

        const aiPromises: Promise<SuggestionResult>[] = [];

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (GEMINI_API_KEY && GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY') {
            aiPromises.push(timeout(
                this.suggestCategoryGemini(accounts, item.description, item.amount, item.receipt_data, examples),
                12000,
                'Gemini'
            ).catch(err => {
                console.warn(`[AI Service] Gemini failed: ${err.message}`);
                return { model: 'Gemini', error: err.message } as any;
            }));
        }

        const results = await Promise.all(aiPromises);

        // Strict validation: the suggested code MUST be an EXACT member of the COA
        // (by code, or by name as a fallback for models that echo the name). This is
        // what prevents "correct logic, wrong account" from loose substring matching.
        const codeMap = new Map<string, any>();
        const nameMap = new Map<string, any>();
        for (const a of accounts) {
            codeMap.set(String(a.code ?? a.AcctNum ?? '').trim().toLowerCase(), a);
            nameMap.set(String(a.name ?? a.Name ?? '').trim().toLowerCase(), a);
        }

        const validResults = results.filter((r: any): r is SuggestionResult => {
            if (!r || r.error || !r.account_code) return false;
            if (r.account_code === 'UNCATEGORIZED') return true;

            const key = String(r.account_code).trim().toLowerCase();
            const matched = codeMap.get(key) || nameMap.get(key);
            if (matched) {
                r.account_code = String(matched.code ?? matched.AcctNum ?? '');
                return true;
            }
            console.warn(`[AI Service] Rejected non-member code "${r.account_code}" (not exact in COA).`);
            return false;
        });

        if (validResults.length === 0) {
            const failureDetails = results.map((r: any) => {
                const modelName = r?.method?.includes('GEMINI') ? 'Gemini' : (r?.model || 'AI');
                if (!r || r.error) return `${modelName}: ${r?.error || 'Unknown Error'}`;
                return `${modelName}: invalid code "${r.account_code}"`;
            }).join('; ');

            console.warn(`[AI Service] No valid suggestions: ${failureDetails}`);
            return {
                account_code: 'UNCATEGORIZED',
                confidence: 0,
                reasoning: `AI could not match an account in your Chart of Accounts. Details: ${failureDetails}. Please select the category manually.`,
                method: 'AI-FAILED',
            };
        }

        // Agreement boost: if both models independently chose the same code, trust it more.
        const byCode = new Map<string, SuggestionResult[]>();
        for (const r of validResults) {
            const k = String(r.account_code);
            (byCode.get(k) || byCode.set(k, []).get(k)!).push(r);
        }
        let best = validResults.sort((a, b) => b.confidence - a.confidence)[0];
        for (const [, group] of byCode) {
            if (group.length > 1) {
                const top = group.sort((a, b) => b.confidence - a.confidence)[0];
                best = { ...top, confidence: Math.min(0.99, top.confidence + 0.05), reasoning: `${top.reasoning} (models agreed)` };
                break;
            }
        }
        return best;
    },

    findAccountById(accounts: any[], id: string): any | undefined {
        return accounts.find(a => String(a.id ?? a.Id ?? '') === String(id));
    },

    codeOf(account: any): string {
        return String(account.code ?? account.AcctNum ?? '');
    },

    exampleFor(accounts: any[], e: { description: string; account_id: string }): CategorizationExample | null {
        const acc = this.findAccountById(accounts, e.account_id);
        if (!acc) return null;
        return { description: e.description, account_code: this.codeOf(acc), account_name: acc.name ?? acc.Name };
    },

    async suggestCategoryGemini(accounts: any[], description: string, amount: number, receipt_data?: any, examples: CategorizationExample[] = []): Promise<SuggestionResult> {
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const userPrompt = buildCategorizationPrompt(accounts, description, amount, receipt_data, examples);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

        const payload = {
            contents: [{ parts: [{ text: CATEGORIZATION_SYSTEM_PROMPT + '\n' + userPrompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
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
            method: 'AI-GEMINI',
        };
    },
};

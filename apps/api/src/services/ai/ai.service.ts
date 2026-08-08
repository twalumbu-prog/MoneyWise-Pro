
import { CATEGORIZATION_SYSTEM_PROMPT, buildCategorizationPrompt, CategorizationExample } from './prompts';
import { memoryService } from './memory.service';
import { ruleEngine } from './rule.engine';
import { callAllCategorizationProviders } from './ai.provider';

const AI_TEST_MODE = process.env.AI_TEST_MODE === 'true';

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
            return this._mockClassify(item.description);
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
     * PURE model ensemble across all configured providers (Gemini + OpenRouter +
     * Perplexity) with strict exact-code validation and optional advanced-model
     * override. Used directly by the DecisionRouter for its AI tier.
     */
    async classifyWithModels(
        accounts: any[],
        item: ClassifyItem,
        examples: CategorizationExample[] = [],
        options?: { useAdvancedModel?: boolean }
    ): Promise<SuggestionResult> {
        if (AI_TEST_MODE) {
            return this._mockClassify(item.description);
        }

        const userPrompt = buildCategorizationPrompt(accounts, item.description, item.amount, item.receipt_data, examples);
        const messages = [
            { role: 'system' as const, content: CATEGORIZATION_SYSTEM_PROMPT },
            { role: 'user' as const, content: userPrompt },
        ];

        let providerResponses;
        if (options?.useAdvancedModel) {
            // For auto-completion: use the heavyweight reasoning model
            const { callAutoCompleteProvider } = await import('./ai.provider');
            const single = await callAutoCompleteProvider(messages).catch(err => {
                console.warn('[AI Service] Advanced model failed, falling back:', err.message);
                return null;
            });
            providerResponses = single ? [single] : await callAllCategorizationProviders(messages);
        } else {
            providerResponses = await callAllCategorizationProviders(messages);
        }

        // Parse each provider's response into a SuggestionResult
        const parsed: SuggestionResult[] = [];
        for (const resp of providerResponses) {
            try {
                const jsonText = resp.text.replace(/```json\n?|\n?```/g, '').trim();
                const data = JSON.parse(jsonText);
                parsed.push({
                    account_code: data.account_code || 'UNCATEGORIZED',
                    confidence: data.confidence || 0,
                    reasoning: data.reasoning || `${resp.provider} suggestion`,
                    method: `AI-${resp.provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`,
                });
            } catch (err: any) {
                console.warn(`[AI Service] Failed to parse ${resp.provider} response:`, err.message);
            }
        }

        // Strict validation: suggested code MUST be an EXACT member of the COA.
        const codeMap = new Map<string, any>();
        const nameMap = new Map<string, any>();
        for (const a of accounts) {
            codeMap.set(String(a.code ?? a.AcctNum ?? '').trim().toLowerCase(), a);
            nameMap.set(String(a.name ?? a.Name ?? '').trim().toLowerCase(), a);
        }

        const validResults = parsed.filter((r): r is SuggestionResult => {
            if (!r || !r.account_code) return false;
            if (r.account_code === 'UNCATEGORIZED') return true;

            // Strip surrounding brackets some models emit e.g. "[1200]" → "1200"
            const key = String(r.account_code).trim().replace(/^\[|\]$/g, '').toLowerCase();
            const matched = codeMap.get(key) || nameMap.get(key);
            if (matched) {
                r.account_code = String(matched.code ?? matched.AcctNum ?? '');
                return true;
            }
            console.warn(`[AI Service] Rejected non-member code "${r.account_code}" (not exact in COA).`);
            return false;
        });

        if (validResults.length === 0) {
            const failureDetails = parsed.length === 0
                ? `No providers responded (configured: ${providerResponses.length > 0 ? 'yes' : 'none'})`
                : parsed.map(r => `${r.method}: invalid code "${r.account_code}"`).join('; ');

            console.warn(`[AI Service] No valid suggestions: ${failureDetails}`);
            return {
                account_code: 'UNCATEGORIZED',
                confidence: 0,
                reasoning: `AI could not match an account in your Chart of Accounts. Details: ${failureDetails}. Please select the category manually.`,
                method: 'AI-FAILED',
            };
        }

        // Agreement boost: if multiple providers independently chose the same code, trust it more.
        const byCode = new Map<string, SuggestionResult[]>();
        for (const r of validResults) {
            const k = String(r.account_code);
            if (!byCode.has(k)) byCode.set(k, []);
            byCode.get(k)!.push(r);
        }

        let best = [...validResults].sort((a, b) => b.confidence - a.confidence)[0];
        for (const [, group] of byCode) {
            if (group.length > 1) {
                const top = [...group].sort((a, b) => b.confidence - a.confidence)[0];
                best = {
                    ...top,
                    confidence: Math.min(0.99, top.confidence + 0.05),
                    reasoning: `${top.reasoning} (providers agreed)`,
                };
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

    /** Kept for backward-compat; delegates to classifyWithModels. */
    async suggestCategoryGemini(accounts: any[], description: string, amount: number, receipt_data?: any, examples: CategorizationExample[] = []): Promise<SuggestionResult> {
        return this.classifyWithModels(accounts, { description, amount, receipt_data }, examples);
    },

    _mockClassify(description: string): SuggestionResult {
        const desc = description.toLowerCase();
        if (desc.includes('kfc') || desc.includes('subway') || desc.includes('pizza') || desc.includes('diner')) return { account_code: '1001', confidence: 0.95, reasoning: 'MOCK: Staff Meal AI', method: 'AI' };
        if (desc.includes('microsoft') || desc.includes('amazon') || desc.includes('oracle') || desc.includes('zesco')) return { account_code: '4000', confidence: 0.95, reasoning: 'MOCK: Vendor AI', method: 'AI' };
        if (desc.includes('office') || desc.includes('stationery') || desc.includes('paper')) return { account_code: '6101', confidence: 0.95, reasoning: 'MOCK: Office Supplies AI', method: 'AI' };
        if (desc.includes('uber') || desc.includes('emirates') || desc.includes('hilton') || desc.includes('cab')) return { account_code: '6200', confidence: 0.95, reasoning: 'MOCK: Travel AI', method: 'AI' };
        if (desc.includes('water') || desc.includes('electric') || desc.includes('waste')) return { account_code: '6100', confidence: 0.98, reasoning: 'MOCK: Utility AI', method: 'AI' };
        if (desc.includes('consulting') || desc.includes('fee') || desc.includes('sale') || desc.includes('revenue')) return { account_code: '4100', confidence: 0.98, reasoning: 'MOCK: Income AI', method: 'AI' };
        return { account_code: '9999', confidence: 0.50, reasoning: 'MOCK: Generic fallback', method: 'AI' };
    },
};

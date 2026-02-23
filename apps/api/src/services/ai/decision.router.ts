import { ruleEngine } from './rule.engine';
import { memoryService } from './memory.service';
import { aiService, SuggestionResult } from './ai.service';
import { riskClassifier, RiskAssessment } from './risk.classifier';
import { confidenceNormalizer } from './confidence.normalizer';

export interface DecisionResult extends SuggestionResult {
    risk: RiskAssessment;
    decision_path: string;
    rule_id?: string;
    similarity_score?: number;
    requires_review: boolean;
}

export class DecisionRouter {
    private TERMINATION_HIGH = 0.90;
    private TERMINATION_MEDIUM = 0.70;
    private RISK_HARDENING_THRESHOLD = 0.93;

    async classify(accounts: any[], item: { description: string, amount: number, department?: string }): Promise<DecisionResult> {
        console.log(`[DecisionRouter] Hardening Pass Classifying: "${item.description}" (K${item.amount})`);

        let bestResult: SuggestionResult = {
            account_code: null,
            confidence: 0,
            reasoning: 'No matches found.',
            method: 'FAILED'
        };

        let decisionPath = 'FAILED';
        let ruleId: string | undefined;
        let similarityScore: number | undefined;
        let hint: SuggestionResult | null = null;

        // --- TIER 1: MEMORY ---
        const memoryMatch = await memoryService.lookup(item);
        if (memoryMatch) {
            const normalizedConf = confidenceNormalizer.normalizeMemory(memoryMatch.confidence);
            const matchedAccount = accounts.find(a => (a.id || a.Id) === memoryMatch.account_id);

            if (matchedAccount) {
                const result = {
                    account_code: String(matchedAccount.code || matchedAccount.AcctNum || ''),
                    confidence: normalizedConf,
                    reasoning: `Contextual memory match (${Math.round(normalizedConf * 100)}% calibrated)`,
                    method: 'MEMORY'
                };

                if (normalizedConf >= 0.92) {
                    // STOP: High confidence memory
                    return this.finalize(result, accounts, item, 'MEMORY', undefined, normalizedConf);
                } else if (normalizedConf >= 0.85) {
                    // CONTINUE: Weak memory hint
                    hint = { ...result, method: 'MEMORY_WEAK' };
                    console.log(`[DecisionRouter] Weak memory hint stored: ${result.account_code}`);
                }
            }
        }

        // --- TIER 2: RULES ---
        const ruleMatch = ruleEngine.match(item.description, item.amount, item.department);
        if (ruleMatch.matched) {
            const normalizedConf = confidenceNormalizer.normalizeRule(ruleMatch.confidence);
            const matchedAccount = accounts.find(a => (a.id || a.Id) === ruleMatch.accountId);

            if (matchedAccount) {
                const result = {
                    account_code: String(matchedAccount.code || matchedAccount.AcctNum || ''),
                    confidence: normalizedConf,
                    reasoning: ruleMatch.reasoning,
                    method: 'RULE'
                };

                if (normalizedConf >= this.TERMINATION_HIGH) {
                    // STOP: High confidence rule
                    return this.finalize(result, accounts, item, 'RULE', ruleMatch.ruleId);
                }

                // If rule is better than hint, update hint
                if (!hint || normalizedConf > hint.confidence) {
                    hint = result;
                }
            }
        }

        // --- TIER 3: AI ENSEMBLE ---
        const aiResults = await aiService.suggestBatch(accounts, [item]);
        if (aiResults[0] && aiResults[0].account_code) {
            const rawAI = aiResults[0];
            const normalizedConf = confidenceNormalizer.normalizeAI(rawAI.confidence);

            const result = {
                ...rawAI,
                confidence: normalizedConf,
                reasoning: `${rawAI.reasoning} (Calibrated: ${Math.round(normalizedConf * 100)}%)`,
                method: rawAI.method
            };

            if (normalizedConf >= this.TERMINATION_HIGH) {
                // STOP: High confidence AI
                return this.finalize(result, accounts, item, 'AI');
            }

            if (!hint || normalizedConf > hint.confidence) {
                hint = result;
            }
        }

        // --- FINALIZATION & FALLBACK ---
        if (hint && hint.confidence >= this.TERMINATION_MEDIUM) {
            return this.finalize(hint, accounts, item, hint.method);
        }

        return this.finalize(bestResult, accounts, item, 'FAILED');
    }

    private finalize(
        result: SuggestionResult,
        accounts: any[],
        item: any,
        decisionPath: string,
        ruleId?: string,
        similarityScore?: number
    ): DecisionResult {
        const matchedAccount = accounts.find(a => String(a.code || a.AcctNum || '') === result.account_code);
        const risk = riskClassifier.assess({
            description: item.description,
            amount: item.amount,
            accountName: matchedAccount?.name || matchedAccount?.Name
        });

        // PATCH 6: Risk-Aware Logic
        let requiresReview = result.confidence < this.TERMINATION_HIGH;

        if (risk.riskLevel === 'HIGH') {
            if (result.confidence < this.RISK_HARDENING_THRESHOLD) {
                requiresReview = true;
                result.reasoning = `[HIGH RISK] ${result.reasoning}. Requires manual verification.`;
            }
        }

        const final: DecisionResult = {
            ...result,
            risk,
            decision_path: decisionPath,
            rule_id: ruleId,
            similarity_score: similarityScore,
            requires_review: requiresReview
        };

        // PATCH 10: Defensive Logging
        console.log('[DR-EVENT]', JSON.stringify({
            description: item.description,
            chosen_method: decisionPath,
            normalized_confidence: final.confidence,
            risk_level: risk.riskLevel,
            requires_review: final.requires_review,
            account: final.account_code
        }));

        return final;
    }
}

export const decisionRouter = new DecisionRouter();

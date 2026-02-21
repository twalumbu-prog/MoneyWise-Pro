import { ruleEngine, RuleMatchResult } from './rule.engine';
import { memoryService } from './memory.service';
import { aiService, SuggestionResult } from './ai.service';
import { riskClassifier, RiskAssessment } from './risk.classifier';

export interface DecisionResult extends SuggestionResult {
    risk: RiskAssessment;
    decision_path: string;
    rule_id?: string;
    similarity_score?: number;
    requires_review: boolean;
}

export class DecisionRouter {
    private HIGH_CONFIDENCE_THRESHOLD = 0.90;
    private MEDIUM_CONFIDENCE_THRESHOLD = 0.70;

    async classify(accounts: any[], item: { description: string, amount: number, department?: string }): Promise<DecisionResult> {
        console.log(`[DecisionRouter] Classifying: "${item.description}" (K${item.amount})`);

        let result: SuggestionResult = {
            account_code: null,
            confidence: 0,
            reasoning: 'Starting classification flow...',
            method: 'FLOW'
        };

        let decisionPath = '';
        let ruleId: string | undefined;
        let similarityScore: number | undefined;

        // 1. Attempt Memory Lookup (Tier 1: Exact, Tier 2: Vector Similarity)
        console.log('[DecisionRouter] Step 1: Memory Lookup');
        const memoryMatch = await memoryService.lookup(item.description);
        if (memoryMatch && memoryMatch.confidence >= 0.85) {
            const matchedAccount = accounts.find(a => (a.id || a.Id) === memoryMatch.account_id);
            if (matchedAccount) {
                result = {
                    account_code: String(matchedAccount.code || matchedAccount.AcctNum || ''),
                    confidence: memoryMatch.confidence,
                    reasoning: `Found in historical memory (Similarity: ${memoryMatch.confidence})`,
                    method: 'MEMORY'
                };
                decisionPath = 'MEMORY';
                similarityScore = memoryMatch.confidence;
            }
        }

        // 2. Attempt Rule Engine
        if (!result.account_code) {
            console.log('[DecisionRouter] Step 2: Rule Engine');
            const ruleMatch = ruleEngine.match(item.description, item.amount, item.department);
            if (ruleMatch.matched) {
                const matchedAccount = accounts.find(a => (a.id || a.Id) === ruleMatch.accountId);
                if (matchedAccount) {
                    result = {
                        account_code: String(matchedAccount.code || matchedAccount.AcctNum || ''),
                        confidence: ruleMatch.confidence,
                        reasoning: ruleMatch.reasoning,
                        method: 'RULE'
                    };
                    decisionPath = 'RULE';
                    ruleId = ruleMatch.ruleId;
                }
            }
        }

        // 3. Attempt AI (Ensemble)
        if (!result.account_code) {
            console.log('[DecisionRouter] Step 3: AI Models');
            const aiResults = await aiService.suggestBatch(accounts, [item]);
            if (aiResults[0] && aiResults[0].account_code) {
                result = aiResults[0];
                decisionPath = 'AI';
            }
        }

        // 4. Default Fallback
        if (!result.account_code) {
            result.reasoning = 'No confident match found across all tiers.';
            result.method = 'FAILED';
            decisionPath = 'FAILED';
        }

        // 5. Risk Assessment
        const matchedAccount = accounts.find(a => String(a.code || a.AcctNum || '') === result.account_code);
        const risk = riskClassifier.assess({
            description: item.description,
            amount: item.amount,
            accountName: matchedAccount?.name || matchedAccount?.Name
        });

        const requiresReview = result.confidence < this.HIGH_CONFIDENCE_THRESHOLD || risk.riskLevel === 'HIGH';

        return {
            ...result,
            risk,
            decision_path: decisionPath,
            rule_id: ruleId,
            similarity_score: similarityScore,
            requires_review: requiresReview
        };
    }
}

export const decisionRouter = new DecisionRouter();

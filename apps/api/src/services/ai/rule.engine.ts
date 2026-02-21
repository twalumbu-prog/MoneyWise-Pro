import { supabase } from '../../lib/supabase';

export interface RuleMatchResult {
    matched: boolean;
    confidence: number;
    accountId: string | null;
    ruleId?: string;
    reasoning: string;
}

export interface AccountingRule {
    id: string;
    name: string;
    pattern: string;
    priority: number;
    confidence_score: number;
    target_account_id: string;
    conditions_json?: {
        min_amount?: number;
        max_amount?: number;
        department?: string;
    };
}

export class RuleEngine {
    private rules: AccountingRule[] = [];

    async loadRules() {
        const { data, error } = await supabase
            .from('accounting_rules')
            .select('*')
            .eq('is_active', true)
            .order('priority', { ascending: false });

        if (error) {
            console.error('[RuleEngine] Failed to load rules:', error);
            return;
        }

        this.rules = data || [];
        console.log(`[RuleEngine] Loaded ${this.rules.length} active rules.`);
    }

    match(description: string, amount: number, department?: string): RuleMatchResult {
        const normalized = description.toLowerCase().trim();

        for (const rule of this.rules) {
            // 1. Regex/Keyword Match
            let isMatch = false;
            try {
                // Check if it's a regex (starts/ends with /)
                if (rule.pattern.startsWith('/') && rule.pattern.endsWith('/')) {
                    const regex = new RegExp(rule.pattern.slice(1, -1), 'i');
                    isMatch = regex.test(normalized);
                } else {
                    // Keyword match (comma separated)
                    const keywords = rule.pattern.toLowerCase().split(',').map(k => k.trim());
                    isMatch = keywords.some(k => normalized.includes(k));
                }
            } catch (err) {
                console.error(`[RuleEngine] Invalid pattern in rule ${rule.id}: ${rule.pattern}`);
                continue;
            }

            if (!isMatch) continue;

            // 2. Condition Validation
            if (rule.conditions_json) {
                const { min_amount, max_amount, department: targetDept } = rule.conditions_json;

                if (min_amount !== undefined && amount < min_amount) continue;
                if (max_amount !== undefined && amount > max_amount) continue;
                if (targetDept && department && targetDept.toLowerCase() !== department.toLowerCase()) continue;
            }

            // 3. Match Found
            return {
                matched: true,
                confidence: Math.min(rule.confidence_score, 0.97),
                accountId: rule.target_account_id,
                ruleId: rule.id,
                reasoning: `Matched rule: ${rule.name} (Priority: ${rule.priority})`
            };
        }

        return {
            matched: false,
            confidence: 0,
            accountId: null,
            reasoning: 'No matching rule found.'
        };
    }
}

export const ruleEngine = new RuleEngine();

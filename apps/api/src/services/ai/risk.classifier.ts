export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RiskAssessment {
    riskLevel: RiskLevel;
    reasons: string[];
}

export class RiskClassifier {
    // Configurable thresholds
    private HIGH_VALUE_THRESHOLD = 5000; // in local currency (e.g., K5,000)
    private MEDIUM_VALUE_THRESHOLD = 1000;

    /**
     * Assesses the risk of a transaction based on amount and keywords.
     */
    assess(data: {
        description: string;
        amount: number;
        accountId?: string;
        accountName?: string;
    }): RiskAssessment {
        const reasons: string[] = [];
        let score = 0; // 0-100 score

        const normalizedDesc = data.description.toLowerCase();
        const normalizedAcc = (data.accountName || '').toLowerCase();

        // 1. Amount-based risk
        if (data.amount >= this.HIGH_VALUE_THRESHOLD) {
            score += 60;
            reasons.push(`High transaction value (>= K${this.HIGH_VALUE_THRESHOLD})`);
        } else if (data.amount >= this.MEDIUM_VALUE_THRESHOLD) {
            score += 30;
            reasons.push(`Moderate transaction value (>= K${this.MEDIUM_VALUE_THRESHOLD})`);
        }

        // 2. Account-type risk (Revenue/Asset/Liability are higher risk than internal expense)
        const highRiskKeywords = ['revenue', 'unearned', 'asset', 'capital', 'loan', 'investment', 'payroll', 'tax'];
        const matches = highRiskKeywords.filter(k =>
            normalizedAcc.includes(k) || normalizedDesc.includes(k)
        );

        if (matches.length > 0) {
            score += 40;
            reasons.push(`Sensitive accounting category detected: ${matches.join(', ')}`);
        }

        // 3. Ambiguity check (Short descriptions)
        if (normalizedDesc.length < 5) {
            score += 20;
            reasons.push('Ambiguous/Too short description');
        }

        // Final Classification
        let riskLevel: RiskLevel = 'LOW';
        if (score >= 70) riskLevel = 'HIGH';
        else if (score >= 40) riskLevel = 'MEDIUM';

        return { riskLevel, reasons };
    }
}

export const riskClassifier = new RiskClassifier();

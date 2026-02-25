export interface AIScenario {
    name: string;
    input: {
        description: string;
        amount: number;
        department?: string;
    };
    expected: {
        decision_path?: string;
        min_confidence?: number;
        max_confidence?: number;
        requires_review?: boolean;
        risk_level?: 'LOW' | 'MEDIUM' | 'HIGH';
        should_learn?: boolean;
    };
    metadata?: Record<string, any>;
}

export interface TestResult {
    scenario: AIScenario;
    actual?: any;
    passed: boolean;
    errors: string[];
}

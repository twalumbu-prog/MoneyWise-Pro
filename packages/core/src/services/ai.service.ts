import { apiFetch } from '../api/apiFetch';

export interface AccountingRule {
    id: string;
    name: string;
    pattern: string;
    priority: number;
    confidence_score: number;
    target_account_id: string;
    conditions_json?: any;
    is_active: boolean;
    created_at: string;
}

export interface AIMetric {
    date: string;
    prediction_count: number;
    override_count: number;
    rule_hits: number;
    ai_hits: number;
    memory_hits: number;
    low_confidence_count: number;
}

export const aiService = {
    // Rules
    async getRules(): Promise<AccountingRule[]> {
        const response = await apiFetch('/ai/rules');
        if (!response.ok) throw new Error('Failed to fetch rules');
        return response.json();
    },

    async createRule(rule: Partial<AccountingRule>): Promise<AccountingRule> {
        const response = await apiFetch('/ai/rules', {
            method: 'POST',
            body: JSON.stringify(rule)
        });
        if (!response.ok) throw new Error('Failed to create rule');
        return response.json();
    },

    async updateRule(id: string, rule: Partial<AccountingRule>): Promise<AccountingRule> {
        const response = await apiFetch(`/ai/rules/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(rule)
        });
        if (!response.ok) throw new Error('Failed to update rule');
        return response.json();
    },

    async deleteRule(id: string): Promise<void> {
        const response = await apiFetch(`/ai/rules/${id}`, {
            method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete rule');
    },

    // Metrics
    async getDailyMetrics(days: number = 30): Promise<AIMetric[]> {
        const response = await apiFetch(`/ai/metrics/daily?days=${days}`);
        if (!response.ok) throw new Error('Failed to fetch metrics');
        return response.json();
    },

    async getStats(): Promise<any> {
        const response = await apiFetch('/ai/metrics/stats');
        if (!response.ok) throw new Error('Failed to fetch stats');
        return response.json();
    },

    // Model Settings
    async getModelSettings(): Promise<{ settings: Record<string, string>; catalog: Record<string, any> }> {
        const response = await apiFetch('/ai/model-settings');
        if (!response.ok) throw new Error('Failed to load model settings');
        return response.json();
    },

    async updateModelSettings(partial: Record<string, string>): Promise<{ settings: Record<string, string> }> {
        const response = await apiFetch('/ai/model-settings', {
            method: 'PUT',
            body: JSON.stringify(partial),
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error((err as any).error || 'Failed to save model settings');
        }
        return response.json();
    },
};

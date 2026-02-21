import { supabase } from '../lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

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
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const response = await fetch(`${API_URL}/ai/rules`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to fetch rules');
        return response.json();
    },

    async createRule(rule: Partial<AccountingRule>): Promise<AccountingRule> {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const response = await fetch(`${API_URL}/ai/rules`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(rule)
        });
        if (!response.ok) throw new Error('Failed to create rule');
        return response.json();
    },

    async updateRule(id: string, rule: Partial<AccountingRule>): Promise<AccountingRule> {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const response = await fetch(`${API_URL}/ai/rules/${id}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(rule)
        });
        if (!response.ok) throw new Error('Failed to update rule');
        return response.json();
    },

    async deleteRule(id: string): Promise<void> {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const response = await fetch(`${API_URL}/ai/rules/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to delete rule');
    },

    // Metrics
    async getDailyMetrics(days: number = 30): Promise<AIMetric[]> {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const response = await fetch(`${API_URL}/ai/metrics/daily?days=${days}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to fetch metrics');
        return response.json();
    },

    async getStats(): Promise<any> {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const response = await fetch(`${API_URL}/ai/metrics/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to fetch stats');
        return response.json();
    }
};

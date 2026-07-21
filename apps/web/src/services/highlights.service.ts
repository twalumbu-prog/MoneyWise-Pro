import { supabase } from '../lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export interface HighlightCard {
    id: string;
    title: string;
    body: string;
    tone: 'positive' | 'neutral' | 'warning';
}

export interface HighlightHeadline {
    revenue: number;
    spending: number;
    profit: number;
    topCategory: { name: string; amount: number } | null;
    periodStart: string;
    periodEnd: string;
}

export interface Achievement {
    id: string;
    metric: 'REVENUE' | 'PROFIT';
    period: 'DAY' | 'WEEK' | 'MONTH';
    value: number;
    previousValue: number | null;
    periodStart: string;
    periodEnd: string;
    title: string;
}

export interface HighlightsPayload {
    cards: HighlightCard[];
    headline: HighlightHeadline | null;
    achievements: Achievement[];
}

async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    return {
        'Authorization': `Bearer ${session?.access_token}`,
        'Content-Type': 'application/json',
    };
}

export const highlightsService = {
    async getHighlights(): Promise<HighlightsPayload> {
        const response = await fetch(`${API_URL}/ai/highlights`, {
            headers: await authHeaders(),
        });
        if (!response.ok) throw new Error('Failed to fetch financial highlights');
        const data = await response.json();
        return {
            cards: Array.isArray(data.cards) ? data.cards : [],
            headline: data.headline || null,
            achievements: Array.isArray(data.achievements) ? data.achievements : [],
        };
    },

    /**
     * Tell the server the badges have been shown, so the confetti fires once per
     * achievement rather than on every visit to Reports.
     */
    async acknowledgeAchievements(ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        await fetch(`${API_URL}/ai/highlights/acknowledge`, {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({ ids }),
        });
    },
};

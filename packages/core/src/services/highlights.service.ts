import { apiFetch, apiJson } from '../api/apiFetch';

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

export const highlightsService = {
    async getHighlights(): Promise<HighlightsPayload> {
        const data = await apiJson<Partial<HighlightsPayload>>('/ai/highlights');
        // Normalised defensively: this feed is AI-generated and has shipped
        // partial payloads, and the Reports screen maps over all three.
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
        // Fire-and-forget, exactly as before: a failed acknowledgement must not
        // break the render that just happened.
        try {
            await apiFetch('/ai/highlights/acknowledge', {
                method: 'POST',
                body: JSON.stringify({ ids }),
            });
        } catch {
            /* non-critical */
        }
    },
};

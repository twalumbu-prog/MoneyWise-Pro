import { supabase } from '../lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export interface DigestCard {
    id: string;
    title: string;
    body: string;
    tone: 'positive' | 'neutral' | 'warning';
}

export const digestService = {
    async getDigest(): Promise<DigestCard[]> {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(`${API_URL}/ai/digest`, {
            headers: {
                'Authorization': `Bearer ${session?.access_token}`,
                'Content-Type': 'application/json',
            },
        });
        if (!response.ok) throw new Error('Failed to fetch financial digest');
        const data = await response.json();
        return Array.isArray(data.cards) ? data.cards : [];
    },
};

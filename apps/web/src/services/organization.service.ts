import { supabase } from '../lib/supabase';
import axios from 'axios';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export interface Organization {
    id: string;
    name: string;
    slug: string;
    email?: string;
    phone?: string;
    address?: string;
    tax_id?: string;
    website?: string;
}

export const organizationService = {
    async getOrganization(): Promise<Organization> {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
            throw new Error('Not authenticated');
        }

        const response = await axios.get(`${API_URL}/api/organizations`, {
            headers: {
                Authorization: `Bearer ${session.access_token}`
            }
        });

        return response.data;
    },

    async updateOrganization(data: Partial<Organization>): Promise<Organization> {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
            throw new Error('Not authenticated');
        }

        const response = await axios.put(`${API_URL}/api/organizations`, data, {
            headers: {
                Authorization: `Bearer ${session.access_token}`
            }
        });

        return response.data;
    }
};

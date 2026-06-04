import { supabase } from '../lib/supabase';
import axios from 'axios';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export interface Product {
    id: string;
    organization_id: string;
    name: string;
    description?: string;
    price: number;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export const productService = {
    async getProducts(): Promise<Product[]> {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
            throw new Error('Not authenticated');
        }

        const response = await axios.get(`${API_URL}/organizations/products`, {
            headers: {
                Authorization: `Bearer ${session.access_token}`
            }
        });

        return response.data;
    },

    async createProduct(product: Partial<Product>): Promise<Product> {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
            throw new Error('Not authenticated');
        }

        const response = await axios.post(`${API_URL}/organizations/products`, product, {
            headers: {
                Authorization: `Bearer ${session.access_token}`
            }
        });

        return response.data;
    },

    async updateProduct(id: string, product: Partial<Product>): Promise<Product> {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
            throw new Error('Not authenticated');
        }

        const response = await axios.put(`${API_URL}/organizations/products/${id}`, product, {
            headers: {
                Authorization: `Bearer ${session.access_token}`
            }
        });

        return response.data;
    },

    async deleteProduct(id: string): Promise<void> {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
            throw new Error('Not authenticated');
        }

        await axios.delete(`${API_URL}/organizations/products/${id}`, {
            headers: {
                Authorization: `Bearer ${session.access_token}`
            }
        });
    },

    async getProductSales(id: string): Promise<any[]> {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
            throw new Error('Not authenticated');
        }

        const response = await axios.get(`${API_URL}/organizations/products/${id}/sales`, {
            headers: {
                Authorization: `Bearer ${session.access_token}`
            }
        });

        return response.data;
    }
};

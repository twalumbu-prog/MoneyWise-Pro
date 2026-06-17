import { supabase } from '../lib/supabase';
import axios from 'axios';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export type ProductType = 'PRODUCT' | 'SERVICE_FIXED' | 'SERVICE_VARIABLE' | 'DONATION';

export interface Product {
    id: string;
    organization_id: string;
    name: string;
    description?: string;
    price: number;
    is_active: boolean;
    image_url?: string | null;
    product_type?: ProductType;
    wallet_id?: string | null;
    income_account_id?: string | null;
    category?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface PaymentLink {
    id: string;
    organization_id: string;
    product_id: string;
    token: string;
    customer_name: string;
    customer_phone: string;
    amount: number;
    wallet_id?: string | null;
    status: 'ACTIVE' | 'PAID' | 'CANCELLED';
    reference?: string | null;
    created_at?: string;
    paid_at?: string | null;
    path?: string;
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

export const paymentLinkService = {
    async createPaymentLink(payload: {
        product_id: string;
        customer_name: string;
        customer_phone: string;
        amount: number;
    }): Promise<PaymentLink> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Not authenticated');

        const response = await axios.post(`${API_URL}/organizations/payment-links`, payload, {
            headers: { Authorization: `Bearer ${session.access_token}` }
        });
        return response.data;
    },

    async listPaymentLinks(productId?: string): Promise<PaymentLink[]> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Not authenticated');

        const response = await axios.get(`${API_URL}/organizations/payment-links`, {
            params: productId ? { product_id: productId } : undefined,
            headers: { Authorization: `Bearer ${session.access_token}` }
        });
        return response.data;
    },

    async deactivatePaymentLink(id: string): Promise<PaymentLink> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Not authenticated');

        const response = await axios.post(`${API_URL}/organizations/payment-links/${id}/deactivate`, {}, {
            headers: { Authorization: `Bearer ${session.access_token}` }
        });
        return response.data;
    }
};

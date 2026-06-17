import axios from 'axios';
import { supabase } from '../lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export interface Department {
    id: string;
    organization_id: string;
    name: string;
    is_archived: boolean;
    created_at: string;
}

const getHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}` };
};

export interface DepartmentConfig {
    use_departments: boolean;
    departments: Department[];
}

export const departmentService = {
    async list(): Promise<DepartmentConfig> {
        const headers = await getHeaders();
        const res = await axios.get(`${API_URL}/departments`, { headers });
        return res.data;
    },
    async create(name: string): Promise<Department> {
        const headers = await getHeaders();
        const res = await axios.post(`${API_URL}/departments`, { name }, { headers });
        return res.data;
    },
    async update(id: string, data: Partial<Pick<Department, 'name' | 'is_archived'>>): Promise<Department> {
        const headers = await getHeaders();
        const res = await axios.patch(`${API_URL}/departments/${id}`, data, { headers });
        return res.data;
    },
    async delete(id: string): Promise<void> {
        const headers = await getHeaders();
        await axios.delete(`${API_URL}/departments/${id}`, { headers });
    },
};

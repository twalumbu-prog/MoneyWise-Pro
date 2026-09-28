import { apiFetch, apiJson } from '../api/apiFetch';

export interface Department {
    id: string;
    organization_id: string;
    name: string;
    is_archived: boolean;
    created_at: string;
}

export interface DepartmentConfig {
    use_departments: boolean;
    departments: Department[];
}

export const departmentService = {
    list(): Promise<DepartmentConfig> {
        return apiJson<DepartmentConfig>('/departments');
    },

    create(name: string): Promise<Department> {
        return apiJson<Department>('/departments', {
            method: 'POST',
            body: JSON.stringify({ name }),
        });
    },

    update(id: string, data: Partial<Pick<Department, 'name' | 'is_archived'>>): Promise<Department> {
        return apiJson<Department>(`/departments/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    },

    async delete(id: string): Promise<void> {
        await apiFetch(`/departments/${id}`, { method: 'DELETE' });
    },
};

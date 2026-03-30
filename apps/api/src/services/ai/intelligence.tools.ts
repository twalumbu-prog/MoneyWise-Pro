import { supabase } from '../../lib/supabase';

export interface FinancialSummaryParams {
    startDate?: string;
    endDate?: string;
}

export interface SearchRequisitionsParams {
    query?: string;
    status?: string;
    limit?: number;
    department?: string;
}

export const intelligenceTools = {
    /**
     * Discovery Tool: Get list of departments, types, and statuses present in the system.
     */
    async get_organization_info(organizationId: string) {
        // Get unique departments
        const { data: depts } = await supabase
            .from('requisitions')
            .select('department')
            .eq('organization_id', organizationId)
            .not('department', 'is', null);
        
        // Get unique types
        const { data: types } = await supabase
            .from('requisitions')
            .select('type')
            .eq('organization_id', organizationId)
            .not('type', 'is', null);

        const uniqueDepts = Array.from(new Set(depts?.map(d => d.department))).filter(Boolean);
        const uniqueTypes = Array.from(new Set(types?.map(t => t.type))).filter(Boolean);
        
        return {
            available_departments: uniqueDepts,
            available_types: uniqueTypes,
            record_statuses: ["DRAFT", "SUBMITTED", "AUTHORISED", "RECEIVED", "CHANGE_SUBMITTED", "DISBURSED", "COMPLETED", "REJECTED"]
        };
    },

    /**
     * Detail Tool: Get full details for a specific requisition, including all line items.
     * Use this for granular questions about 'kinds of things' within a request.
     */
    async get_requisition_details(organizationId: string, requisitionId: string) {
        // Get requisition header
        const { data: requisition, error: reqErr } = await supabase
            .from('requisitions')
            .select('*')
            .eq('id', requisitionId)
            .eq('organization_id', organizationId)
            .single();

        if (reqErr) throw reqErr;

        // Get line items
        const { data: items, error: lineErr } = await supabase
            .from('line_items')
            .select('id, description, quantity, unit_price, estimated_amount, actual_amount, qb_account_name')
            .eq('requisition_id', requisitionId);

        if (lineErr) throw lineErr;

        return {
            requisition,
            line_items: items || []
        };
    },

    /**
     * Batch Detail Tool: Get full details for multiple requisitions at once.
     * Use this if you have a list of IDs and need to see all their contents efficiently.
     */
    async get_batch_requisition_details(organizationId: string, requisitionIds: string[]) {
        if (!requisitionIds || requisitionIds.length === 0) return [];

        // Get requisitions
        const { data: requisitions, error: reqErr } = await supabase
            .from('requisitions')
            .select('id, description, department, type, status, estimated_total, actual_total, created_at')
            .in('id', requisitionIds)
            .eq('organization_id', organizationId);

        if (reqErr) throw reqErr;

        // Get all line items for these requisitions
        const { data: items, error: lineErr } = await supabase
            .from('line_items')
            .select('requisition_id, description, quantity, unit_price, actual_amount')
            .in('requisition_id', requisitionIds);

        if (lineErr) throw lineErr;

        // Map items to their parent requisitions
        return requisitions.map(req => ({
            ...req,
            line_items: items?.filter(item => item.requisition_id === req.id) || []
        }));
    },
    /**
     * Get a financial summary for an organization within a date range.
     */
    async get_financial_summary(organizationId: string, params: FinancialSummaryParams = {}) {
        const { startDate, endDate } = params;
        
        let query = supabase
            .from('requisitions')
            .select('estimated_total, actual_total, status, department, type, created_at')
            .eq('organization_id', organizationId);

        if (startDate) query = query.gte('created_at', startDate);
        if (endDate) query = query.lte('created_at', endDate);

        const { data, error } = await query;

        if (error) throw error;
        if (!data || data.length === 0) return { message: 'No transactions found for this period.' };

        // Perform aggregations
        const totalEstimated = data.reduce((sum, r) => sum + (Number(r.estimated_total) || 0), 0);
        const totalActual = data.reduce((sum, r) => sum + (Number(r.actual_total) || 0), 0);
        const count = data.length;

        const byStatus = data.reduce((acc: any, r) => {
            acc[r.status] = (acc[r.status] || 0) + 1;
            return acc;
        }, {});

        const byType = data.reduce((acc: any, r) => {
            const type = r.type || 'Other';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {});

        const byDepartment = data.reduce((acc: any, r) => {
            const dept = r.department || 'Unknown';
            acc[dept] = (acc[dept] || 0) + (Number(r.actual_total || r.estimated_total) || 0);
            return acc;
        }, {});

        return {
            period: { startDate, endDate },
            summary: {
                total_transactions: count,
                total_estimated_volume: totalEstimated.toFixed(2),
                total_actual_spend: totalActual.toFixed(2),
                status_breakdown: byStatus,
                type_breakdown: byType,
                spend_by_department: byDepartment
            }
        };
    },

    /**
     * Search for specific requisitions with filters.
     */
    async search_requisitions(organizationId: string, params: SearchRequisitionsParams = {}) {
        const { query: searchText, status, limit = 20, department } = params;

        let query = supabase
            .from('requisitions')
            .select('id, description, estimated_total, actual_total, status, created_at, staff_name, department, type')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });

        if (status) query = query.eq('status', status);
        if (department) query = query.ilike('department', `%${department}%`);
        if (searchText) query = query.ilike('description', `%${searchText}%`);

        query = query.limit(limit);

        const { data, error } = await query;

        if (error) throw error;
        
        return {
            count: data?.length || 0,
            results: data || []
        };
    }
};

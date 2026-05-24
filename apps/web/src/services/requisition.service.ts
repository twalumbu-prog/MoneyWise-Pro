import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';



interface LineItem {
    id?: string;
    description: string;
    quantity: number;
    unit_price: number;
    estimated_amount: number;
    actual_amount?: number;
    ai_extracted_amount?: number;
    receipt_url?: string;
    receipt_ocr_data?: any;
    receipt_ocr_status?: 'NONE' | 'PENDING' | 'DONE' | 'FAILED';
}

interface CreateRequisitionData {
    description: string;
    estimated_total: number;
    items?: LineItem[];
    department: string;
    type?: string;
    staff_name?: string;
    employee_id?: string;
    loan_amount?: number;
    repayment_period?: number;
    interest_rate?: number;
    monthly_deduction?: number;
    payment_method?: string;
    recipient_account?: string;
    recipient_bank_code?: string;
    recipient_name?: string;
}

export interface Requisition {
    id: string;
    requestor_id: string;
    description: string;
    estimated_total: number;
    status: string;
    created_at: string;
    items?: LineItem[];
    requestor_name?: string;
    department?: string;
    type?: 'EXPENSE' | 'ADVANCE' | 'LOAN';
    staff_name?: string;
    employee_id?: string;
    loan_amount?: number;
    repayment_period?: number;
    interest_rate?: number;
    monthly_deduction?: number;
    actual_total?: number;
    payment_method?: string;
    recipient_account?: string;
    recipient_bank_code?: string;
    recipient_name?: string;
    organization_id: string;
    disbursements?: any[];
    audit_score?: number;
    audit_score_breakdown?: {
        timing: number;
        compliance: number;
        accuracy: number;
    };
    accounted_at?: string;

    organization?: {
        id: string;
        name: string;
        lenco_subaccount_id: string;
        lenco_public_key: string;
    };
    receipts?: any[];
}
export const REQUISITION_STATUS_CONFIG: Record<string, { 
    label: string, 
    color: string, 
    tab: string, 
    isCompleted: boolean,
    iconType: 'clock' | 'check' | 'alert' | 'rotate' | 'check-circle'
}> = {
    'DRAFT': { label: 'Draft', color: 'gray', tab: 'ALL', isCompleted: false, iconType: 'rotate' },
    'PENDING_APPROVAL': { label: 'Awaiting Approval', color: 'amber', tab: 'PENDING_APPROVAL', isCompleted: false, iconType: 'clock' },
    'AUTHORISED': { label: 'Authorised', color: 'blue', tab: 'REVIEWED', isCompleted: false, iconType: 'check-circle' },
    'REJECTED': { label: 'Rejected', color: 'red', tab: 'ALL', isCompleted: false, iconType: 'alert' },
    'DISBURSED': { label: 'Disbursed', color: 'emerald', tab: 'DISBURSED', isCompleted: false, iconType: 'check' },
    'EXPENSED': { label: 'Expensed', color: 'purple', tab: 'CHANGE_SUBMITTED', isCompleted: false, iconType: 'clock' },
    'CHANGE_SUBMITTED': { label: 'Returned', color: 'purple', tab: 'CHANGE_SUBMITTED', isCompleted: false, iconType: 'check-circle' },
    'RECEIVED': { label: 'Funds Received', color: 'emerald', tab: 'DISBURSED', isCompleted: false, iconType: 'check-circle' },
    'CATEGORIZED': { label: 'Completed', color: 'blue', tab: 'COMPLETED', isCompleted: true, iconType: 'check-circle' },
    'COMPLETED': { label: 'Completed', color: 'blue', tab: 'COMPLETED', isCompleted: true, iconType: 'check-circle' },
    'ACCOUNTED': { label: 'Accounted', color: 'emerald', tab: 'COMPLETED', isCompleted: true, iconType: 'check-circle' }
};

export const getStatusConfig = (status: string) => {
    return REQUISITION_STATUS_CONFIG[status] || { 
        label: status.charAt(0) + status.slice(1).toLowerCase(), 
        color: 'gray', 
        tab: 'ALL', 
        isCompleted: false,
        iconType: 'clock' 
    };
};

export const requisitionService = {
    async disburse(id: string, payload: {
        payment_method: string;
        total_prepared: number;
        recipient_account?: string;
        recipient_bank_code?: string;
        recipient_account_name?: string;
    }) {
        const response = await apiFetch(`/requisitions/${id}/disburse`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || data.message || 'Disbursement failed');
        }

        return data; // { message, disbursement_id, lencoStatus }
    },

    async disburseExcess(id: string, payload: {
        payment_method: string;
        total_prepared: number;
        recipient_account?: string;
        recipient_bank_code?: string;
        recipient_account_name?: string;
    }) {
        const response = await apiFetch(`/requisitions/${id}/disburse-excess`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || data.message || 'Excess disbursement failed');
        }

        return data;
    },

    async verifyDisbursement(id: string) {
        const response = await apiFetch(`/requisitions/${id}/verify-disbursement`);
        const data = await response.json();
        // Don't throw on non-2xx — status can be 'pending' or 'failed', caller handles it
        return data; // { status: 'successful' | 'pending' | 'failed', message, details }
    },

    async acknowledge(id: string, signature: string) {
        const response = await apiFetch(`/requisitions/${id}/acknowledge`, {
            method: 'POST',
            body: JSON.stringify({ signature }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || err.error || 'Failed to acknowledge receipt');
        }

        return response.json();
    },

    async getAll() {
        const response = await apiFetch('/requisitions');

        if (!response.ok) {
            throw new Error('Failed to fetch requisitions');
        }

        return response.json();
    },

    async getById(id: string) {
        const response = await apiFetch(`/requisitions/${id}`);

        if (!response.ok) {
            throw new Error('Failed to fetch requisition');
        }

        return response.json();
    },

    async create(data: CreateRequisitionData) {
        const response = await apiFetch('/requisitions', {
            method: 'POST',
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const errorObj: any = new Error(err.message || err.error || 'Failed to create requisition');
            errorObj.activeRequisitionId = err.activeRequisitionId;
            errorObj.code = err.code;
            throw errorObj;
        }

        return response.json();
    },

    async update(id: string, data: Partial<CreateRequisitionData>) {
        const response = await apiFetch(`/requisitions/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            throw new Error('Failed to update requisition');
        }

        return response.json();
    },

    getAllAdmin: async () => {
        const response = await apiFetch('/requisitions/admin/all');

        if (!response.ok) {
            const err = await response.json();
            throw new Error(JSON.stringify(err));
        }

        return response.json();
    },

    updateStatus: async (id: string, status: string) => {
        const response = await apiFetch(`/requisitions/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        });

        if (!response.ok) {
            throw new Error('Failed to update status');
        }

        return response.json();
    },

    updateExpenses: async (id: string, items: { id: string, actual_amount: number, receipt_url?: string }[]) => {
        const response = await apiFetch(`/requisitions/${id}/expenses`, {
            method: 'PUT',
            body: JSON.stringify({ items }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'Failed to update expenses');
        }

        return response.json();
    },

    submitChange: async (id: string, denominations: any, change_amount: number, submission_method: 'CASH' | 'MONEYWISE_WALLET' = 'CASH', change_external_reference?: string) => {
        const response = await apiFetch(`/requisitions/${id}/submit-change`, {
            method: 'POST',
            body: JSON.stringify({ 
                denominations, 
                change_amount, 
                submission_method, 
                change_external_reference 
            }),
        });

        if (!response.ok) {
            const err = await response.json();
            const message = err.message || err.error || 'Failed to submit change';
            throw new Error(message);
        }

        return response.json();
    },
    deleteMessage: async (requisitionId: string, messageId: string) => {
        const response = await apiFetch(`/requisitions/${requisitionId}/messages/${messageId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to delete message');
        }

        return response.json();
    },

    confirmChange: async (id: string, confirmed_denominations: any, confirmed_change_amount: number) => {
        const response = await apiFetch(`/requisitions/${id}/confirm-change`, {
            method: 'POST',
            body: JSON.stringify({ confirmed_denominations, confirmed_change_amount }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'Failed to confirm change');
        }

        return response.json();
    },

    markRead: async (id: string) => {
        const response = await apiFetch(`/requisitions/${id}/mark-read`, {
            method: 'POST',
        });

        if (!response.ok) {
            console.error('Failed to mark requisition as read');
        }
    },

    getFileUrl(path: string | null) {
        if (!path) return null;
        const { data } = supabase.storage.from('receipts').getPublicUrl(path);
        return data.publicUrl;
    },

    async analyzeReceipt(requisitionId: string, itemId: string): Promise<void> {
        const response = await apiFetch(`/requisitions/${requisitionId}/items/${itemId}/analyze-receipt`, {
            method: 'POST',
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to trigger receipt analysis');
        }
    },

    async getDisbursementHistory() {
        const response = await apiFetch('/requisitions/disbursements/history');

        if (!response.ok) {
            throw new Error('Failed to fetch disbursement history');
        }

        return response.json();
    },

    async updateDisbursement(id: string, data: { total_prepared: number, denominations: any }) {
        const response = await apiFetch(`/requisitions/disbursements/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to update disbursement');
        }

        return response.json();
    },

    async analyzeDisbursementProof(id: string) {
        const response = await apiFetch(`/requisitions/disbursements/${id}/analyze-proof`, {
            method: 'POST',
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to analyze disbursement proof');
        }

        return response.json();
    },

    async getMessages(id: string): Promise<RequisitionMessage[]> {
        const response = await apiFetch(`/requisitions/${id}/messages`);

        if (!response.ok) throw new Error('Failed to fetch messages');
        return response.json();
    },

    async sendMessage(id: string, content: string, type: 'CHAT' | 'SYSTEM' = 'CHAT', metadata: any = {}): Promise<RequisitionMessage> {
        const response = await apiFetch(`/requisitions/${id}/messages`, {
            method: 'POST',
            body: JSON.stringify({ content, type, metadata })
        });

        if (!response.ok) throw new Error('Failed to send message');
        return response.json();
    },

    async approveCategorization(id: string, overrides: { id: string, account_id: string }[] = []) {
        const response = await apiFetch(`/requisitions/${id}/approve-categorization`, {
            method: 'POST',
            body: JSON.stringify({ overrides }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to approve categorization');
        }

        return response.json();
    },

    async retriggerAI(id: string) {
        const response = await apiFetch(`/requisitions/${id}/retrigger-ai`, {
            method: 'POST',
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || err.error || 'Failed to retrigger AI categorization');
        }

        return response.json();
    },

    async postToQuickBooks(id: string, data: { payment_account_id: string, payment_account_name: string }) {
        const response = await apiFetch(`/requisitions/${id}/post-quickbooks`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
        return response.json();
    },

    async scanReceipts(id: string, imageUrls: string[]) {
        const response = await apiFetch(`/requisitions/${id}/scan-receipts`, {
            method: 'POST',
            body: JSON.stringify({ imageUrls }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const errorMessage = err.details ? `${err.error}\nDetails: ${err.details}` : (err.error || 'Failed to scan receipts');
            throw new Error(errorMessage);
        }

        return response.json();
    },

    async acknowledgeReceipt(id: string, signature?: string) {
        const response = await apiFetch(`/requisitions/${id}/acknowledge`, {
            method: 'POST',
            body: JSON.stringify({ signature }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to acknowledge receipt');
        }

        return response.json();
    },

    async deleteReceipt(requisitionId: string, receiptId: string) {
        const response = await apiFetch(`/requisitions/${requisitionId}/receipts/${receiptId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to delete receipt');
        }

        return response.json();
    },
    async updateLineItemAccount(itemId: string, accountId: string) {
        const response = await apiFetch(`/requisitions/items/${itemId}/account`, {
            method: 'PATCH',
            body: JSON.stringify({ accountId }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to update line item account');
        }

        return response.json();
    },

    async revertToDraft(id: string) {
        const response = await apiFetch(`/requisitions/${id}/revert-to-draft`, {
            method: 'POST',
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || err.error || 'Failed to revert requisition to draft');
        }

        return response.json();
    },
    async getAuditReport(startDate?: string, endDate?: string) {
        let url = '/requisitions/reports/audit';
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        if (params.toString()) url += `?${params.toString()}`;

        const response = await apiFetch(url);
        if (!response.ok) throw new Error('Failed to fetch audit report');
        return response.json();
    }
};

export interface RequisitionMessage {
    id: string;
    requisition_id: string;
    user_id: string;
    user_name: string;
    message_type: 'CHAT' | 'SYSTEM';
    content: string;
    metadata: any;
    created_at: string;
}

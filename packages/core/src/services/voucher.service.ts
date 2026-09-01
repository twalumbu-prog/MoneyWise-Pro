import { apiJson } from '../api/apiFetch';
import { isApiError } from '../api/ApiError';

export interface VoucherLine {
    id: string;
    voucher_id: string;
    account_id: string;
    description: string;
    debit: number;
    credit: number;
    accounts?: { code: string; name: string };
}

export interface Voucher {
    id: string;
    requisition_id: string;
    created_by: string;
    reference_number: string;
    total_debit: number;
    total_credit: number;
    status: 'DRAFT' | 'POSTED';
    posted_at?: string;
    created_at: string;
    requisitions?: {
        description: string;
        line_items?: any[];
        disbursements?: any[];
    };
    voucher_lines?: VoucherLine[];
}

export const voucherService = {
    getAll(): Promise<Voucher[]> {
        return apiJson<Voucher[]>('/vouchers');
    },

    getById(id: string): Promise<Voucher> {
        return apiJson<Voucher>(`/vouchers/${id}`);
    },

    createFromRequisition(requisitionId: string): Promise<Voucher> {
        return apiJson<Voucher>('/vouchers', {
            method: 'POST',
            body: JSON.stringify({ requisition_id: requisitionId }),
        });
    },

    post(id: string): Promise<Voucher> {
        return apiJson<Voucher>(`/vouchers/${id}/post`, { method: 'POST' });
    },

    /**
     * Posting can fail at several distinct stages (classification, journal
     * build, QuickBooks sync). The backend reports `stage` and `details`
     * alongside `error`, and the cashier needs all three to know whether to
     * retry or fix the classification — so the composite message is rebuilt
     * here rather than losing everything but `error`.
     */
    async postVoucherWithClassification(
        requisitionId: string,
        items: any[],
        paymentAccount?: { id: string; name: string },
    ): Promise<any> {
        try {
            return await apiJson(`/requisitions/${requisitionId}/post-voucher`, {
                method: 'POST',
                body: JSON.stringify({
                    items,
                    payment_account_id: paymentAccount?.id,
                    payment_account_name: paymentAccount?.name,
                }),
            });
        } catch (err) {
            if (!isApiError(err)) throw err;
            const body = err.data ?? {};
            let message = body.error || 'Failed to post voucher';
            if (body.stage) message += ` [Stage: ${body.stage}]`;
            if (body.details) message += ` — ${body.details}`;
            throw new Error(message);
        }
    },
};

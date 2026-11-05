import { apiJson } from 'core';

export type CaptureStatus = 'NEW' | 'NEEDS_REVIEW' | 'POSTING' | 'APPROVED' | 'AUTO_POSTED' | 'MERGED' | 'DISMISSED' | 'FAILED';

export interface CaptureRow {
    id: string;
    source: 'WHATSAPP' | 'FACEBOOK' | 'INSTAGRAM' | 'EMAIL' | 'RECEIPT_UPLOAD' | 'MOMO_SMS';
    status: CaptureStatus;
    direction: 'IN' | 'OUT' | null;
    amount: number | null;
    currency: string | null;
    zmw_amount: number | null;
    occurred_on: string | null;
    counterparty_name: string | null;
    payment_method: string;
    confidence: number | null;
    deterministic: boolean;
    claim_state: 'CLAIMED' | 'CORROBORATED';
    match_type: string;
    flags: string[];
    suggested_account_id: string | null;
    suggested_wallet_id: string | null;
    cashbook_entry_id: string | null;
    posted_at: string | null;
    created_at: string;
    momo_capture_id: string | null;
}

export interface CaptureDetail {
    capture: CaptureRow & { evidence_summary: string | null; line_items: any[]; match_candidates: any[]; matched_cashbook_entry_id: string | null; reasoning: string | null };
    attachments: { id: string; mime: string; url: string | null }[];
    momoMessages: { id: string; raw_text: string; provider: string; occurred_at: string }[];
    entries: { id: string; date: string; description: string; debit: number; credit: number; transaction_at: string | null; created_at: string }[];
    wallets: { id: string; name: string; provider_type: string }[];
    categories: { id: string; name: string; code: string; emoji: string | null }[];
    undoAvailableUntil: string | null;
}

export interface CaptureSettings { enabled: boolean; autoPostEnabled: boolean; autoPostLimit: number; dailyAiBudget: number; planEligible: boolean }

const post = <T,>(path: string, body: unknown = {}) => apiJson<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const captureApi = {
    list: (status?: string) => apiJson<{ enabled: boolean; items: CaptureRow[]; nextBefore: string | null }>(`/captures${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    count: () => apiJson<{ needsReview: number }>('/captures/count'),
    detail: (id: string) => apiJson<CaptureDetail>(`/captures/${id}`),
    upload: (fileBase64: string, mime: string) => post<{ attachmentId: string; duplicate: boolean }>('/captures/upload', { fileBase64, mime }),
    approve: (id: string, edits: Record<string, unknown> = {}) => post(`/captures/${id}/approve`, { edits }),
    dismiss: (id: string) => post(`/captures/${id}/dismiss`),
    undo: (id: string) => post(`/captures/${id}/undo`),
    merge: (id: string, body: { cashbookEntryId?: string; captureId?: string; accountId?: string }) => post(`/captures/${id}/merge`, body),
    bulkApprove: (ids: string[]) => post<{ results: { id: string; ok: boolean; error?: string }[] }>('/captures/bulk-approve', { ids }),
    settings: () => apiJson<CaptureSettings>('/captures/settings'),
    saveSettings: (patch: Partial<CaptureSettings>) => apiJson<CaptureSettings>('/captures/settings', { method: 'PUT', body: JSON.stringify(patch) }),
};

export const kwacha = (n: number | null | undefined) =>
    n == null ? '—' : `K${Number(n).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const readFileAsBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]+;base64,/, ''));
    r.onerror = () => reject(new Error('Could not read the file'));
    r.readAsDataURL(file);
});

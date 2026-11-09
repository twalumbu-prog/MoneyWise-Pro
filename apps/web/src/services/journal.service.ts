import { apiJson } from 'core';

export interface JournalLineInput { account_id: string; debit?: number | null; credit?: number | null; description?: string | null }
export interface JournalInput { date: string; reference?: string | null; description: string; lines: JournalLineInput[] }

export interface JournalLine {
    id: string; account_id: string; account_name: string | null; account_code: string | null; account_type: string | null;
    debit: number; credit: number; description: string | null;
}
export interface JournalEntry {
    id: string; entry_date: string; description: string | null; journal_number: string | null; reference: string | null;
    source_type: string; created_at: string; created_by: string | null; created_by_name: string | null;
    total_debit: number; total_credit: number; lines: JournalLine[];
}

export const journalService = {
    post(input: JournalInput): Promise<JournalEntry> {
        return apiJson<JournalEntry>('/journal-entries', { method: 'POST', body: JSON.stringify(input) });
    },
    list(opts: { from?: string; to?: string; search?: string; sourceType?: string; limit?: number; offset?: number } = {}): Promise<{ entries: JournalEntry[]; total: number; limit: number; offset: number }> {
        const p = new URLSearchParams();
        if (opts.from) p.set('from', opts.from);
        if (opts.to) p.set('to', opts.to);
        if (opts.search) p.set('search', opts.search);
        if (opts.sourceType) p.set('source_type', opts.sourceType);
        if (opts.limit) p.set('limit', String(opts.limit));
        if (opts.offset) p.set('offset', String(opts.offset));
        return apiJson(`/journal-entries?${p}`);
    },
    reverse(id: string, date?: string): Promise<JournalEntry> {
        return apiJson<JournalEntry>(`/journal-entries/${id}/reverse`, { method: 'POST', body: JSON.stringify({ date }) });
    },
};

// ── Statements ───────────────────────────────────────────────────────────────

export interface TrialBalanceRow { account_id: string; code: string | null; name: string; type: string; period_debit: number; period_credit: number; debit: number; credit: number }
export interface TrialBalance { start: string; end: string; ledgerComplete: boolean; rows: TrialBalanceRow[]; totals: { debit: number; credit: number; period_debit: number; period_credit: number }; balanced: boolean }

export interface CfLine { account_id?: string; label: string; amount: number }
export interface CashFlow {
    start: string; end: string; method: 'INDIRECT'; ledgerComplete: boolean; netProfit: number;
    operating: { adjustments: CfLine[]; adjustmentsTotal: number; total: number };
    investing: { lines: CfLine[]; total: number }; financing: { lines: CfLine[]; total: number };
    netChange: number; openingCash: number; closingCash: number;
    cashAccounts: { account_id: string; code: string | null; name: string; opening: number; closing: number }[];
    checks: { cashChangeTiesToBalanceSheet: boolean; difference: number; ledgerBalanced: boolean; ledgerGap: number };
}

export interface EquityRow { account_id: string | null; code: string | null; name: string; kind: string; opening: number; profit: number; other_movements: number; closing: number }
export interface ChangesInEquity {
    start: string; end: string; ledgerComplete: boolean; rows: EquityRow[];
    totals: { opening: number; profit: number; other_movements: number; closing: number }; balanceSheetEquity: number;
    checks: { closingTiesToBalanceSheet: boolean; difference: number; rollForwardOk: boolean };
}

export interface GeneralLedgerRow { id: string; journal_id: string; date: string; reference: string | null; source_type: string; description: string; debit: number; credit: number; balance: number }
export interface GeneralLedger {
    account: { id: string; code: string | null; name: string; type: string }; start: string; end: string; normalBalance: 'DEBIT' | 'CREDIT';
    opening: number; totalDebit: number; totalCredit: number; closing: number; rows: GeneralLedgerRow[]; truncated: boolean;
}

const range = (s: string, e: string) => `startDate=${s}&endDate=${e}`;
export const statementsService = {
    trialBalance: (s: string, e: string) => apiJson<TrialBalance>(`/reports/trial-balance?${range(s, e)}`),
    cashFlow: (s: string, e: string) => apiJson<CashFlow>(`/reports/cash-flow?${range(s, e)}`),
    changesInEquity: (s: string, e: string) => apiJson<ChangesInEquity>(`/reports/changes-in-equity?${range(s, e)}`),
    generalLedger: (accountId: string, s: string, e: string) => apiJson<GeneralLedger>(`/reports/general-ledger?${range(s, e)}&accountId=${accountId}`),
};

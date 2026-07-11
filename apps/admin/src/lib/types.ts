// Mirrors the API's reconciliation.service response shapes.

export type ReconStatus =
    | 'RECONCILED'
    | 'MINOR_DRIFT'
    | 'OUT_OF_BALANCE'
    | 'NOT_LINKED'
    | 'NO_WALLET'
    | 'CHECKING'
    | 'ERROR';

export interface SectionRecon {
    moneywise: number;
    lenco: number;
    difference: number;
}

export interface FeesBreakdown {
    bankFees: number;
    platformFees: number;
}

export interface OrgReconSummary {
    orgId: string;
    name: string;
    slug: string | null;
    linked: boolean;
    lencoSubaccountId: string | null;
    walletCount: number;
    inflows: SectionRecon | null;
    outflows: SectionRecon | null;
    closing: SectionRecon | null;
    fees: FeesBreakdown | null;
    status: ReconStatus;
    reconciliationPct: number | null;
    error?: string;
    lastCheckedAt: string;
}

export interface OverviewResponse {
    tolerance: number;
    generatedAt: string;
    organizations: OrgReconSummary[];
}

export type TxnMatchStatus = 'MATCHED' | 'MONEYWISE_ONLY' | 'LENCO_ONLY';
export type TxnCategory = 'NORMAL' | 'PLATFORM_FEE' | 'CHANGE_RETURN';

export interface ReconTxnRow {
    matchStatus: TxnMatchStatus;
    category: TxnCategory;
    direction: 'inflow' | 'outflow';
    date: string;
    description: string;
    reference: string | null;
    lencoId: string | null;
    moneywiseAmount: number | null;
    lencoAmount: number | null;
    bankFee: number | null;
    difference: number;
    walletId: string | null;
    entryType: string | null;
    requisitionId: string | null;
}

export interface OrgDetailResponse extends OrgReconSummary {
    tolerance: number;
    generatedAt: string;
    transactions: ReconTxnRow[];
    counts: { matched: number; moneywiseOnly: number; lencoOnly: number };
}

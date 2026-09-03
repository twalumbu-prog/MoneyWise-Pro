import { getStatusConfig } from 'core';

export interface InflowRow {
    id: string;
    description: string;
    debit: number;
    status?: string;
    date: string;
    created_at?: string;
    reference_number?: string;
    account_type?: string;
    has_unread_updates?: boolean;
}

export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
    CASH: 'Cash',
    AIRTEL_MONEY: 'Mobile Money',
    BANK: 'Bank',
    MONEYWISE_WALLET: 'MoneyWise Wallet',
    MASTERFEES: 'Master Fees',
    MASTERFEES_MANUAL: 'Master Fees (Manual)',
};

export const inflowTitle = (description: string) =>
    (description || 'Inflow').replace(/^PENDING_INTENT:\s*/, '').split(' | ')[0].trim();

export function inflowStatusIcon(status: string): 'clock' | 'check' | 'alert' | 'rotate' | 'check-circle' {
    return getStatusConfig(status).iconType;
}

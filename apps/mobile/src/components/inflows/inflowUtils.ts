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

export const INFLOW_TABS: { label: string; value: string }[] = [
    { label: 'All', value: 'ALL' },
    { label: 'Orders', value: 'ORDERS' },
    { label: 'Delivered', value: 'DELIVERED' },
    { label: 'Open Balance', value: 'OPEN_BALANCE' },
    { label: 'Paid/Completed', value: 'COMPLETED' },
    { label: 'Accounted', value: 'ACCOUNTED' },
];

export const inflowTitle = (description: string) =>
    (description || 'Inflow').replace(/^PENDING_INTENT:\s*/, '').split(' | ')[0].trim();

export function getInflowTab(inflow: InflowRow): string {
    const s = (inflow.status || '').toUpperCase();
    const desc = (inflow.description || '').toUpperCase();
    const accType = (inflow.account_type || '').toUpperCase();

    if (s === 'ACCOUNTED' || s === 'CATEGORIZED') {
        return 'ACCOUNTED';
    }
    if (s === 'DELIVERED' || desc.includes('DELIVERED')) {
        return 'DELIVERED';
    }
    if (s === 'OPEN_BALANCE' || s === 'PARTIAL' || s === 'UNPAID' || s === 'REVIEWED' || accType === 'ACCOUNTS_RECEIVABLE') {
        return 'OPEN_BALANCE';
    }
    if (s === 'PENDING' || s === 'ORDER' || s === 'ORDERS' || s === 'PENDING_APPROVAL' || accType === 'ORDER' || desc.includes('PENDING_INTENT')) {
        return 'ORDERS';
    }
    return 'COMPLETED';
}

export function inflowStatusIcon(status: string): 'clock' | 'check' | 'alert' | 'rotate' | 'check-circle' {
    return getStatusConfig(status).iconType;
}

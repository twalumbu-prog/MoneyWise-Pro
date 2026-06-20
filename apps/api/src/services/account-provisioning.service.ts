import { supabase } from '../lib/supabase';

/**
 * Baseline chart-of-accounts every organization needs so the balance sheet balances
 * from day one — without these the reporting layer has to paper over the gaps per-org.
 *
 *  - MoneyWise Wallet (ASSET): the legacy report maps any account with code
 *    QB-1150040000 (or a name containing "main") to the organization's MONEYWISE_WALLET
 *    cashbook balance, so this account always reflects the real wallet balance.
 *  - Owner's Equity (EQUITY): owner contributions / opening balances land here.
 *  - Retained Earnings (EQUITY): the report rolls cumulative (income - expense) onto
 *    this row (matched by code QB-73 / subtype "Retained Earnings"), so accumulated
 *    profit or loss always shows up in equity and Assets - Liabilities == Total Equity.
 */
export const DEFAULT_ACCOUNTS = [
    { code: 'QB-1150040000', name: 'MoneyWise Wallet', type: 'ASSET', subtype: 'Bank', description: 'Default MoneyWise wallet account' },
    { code: '3100', name: "Owner's Equity", type: 'EQUITY', subtype: "Owner's Equity", description: 'Owner contributions and opening balances' },
    { code: 'QB-73', name: 'Retained Earnings', type: 'EQUITY', subtype: 'Retained Earnings', description: 'Accumulated net profit/loss' },
];

/**
 * Seed the baseline accounts for an organization. Idempotent: existing accounts with the
 * same (code, organization_id) are left untouched, so this is safe to call more than once
 * and never clobbers an org's own chart of accounts.
 */
export async function seedDefaultAccounts(organizationId: string): Promise<void> {
    const rows = DEFAULT_ACCOUNTS.map(a => ({
        ...a,
        organization_id: organizationId,
        is_active: true,
        updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
        .from('accounts')
        .upsert(rows, { onConflict: 'code,organization_id', ignoreDuplicates: true });

    if (error) {
        // Provisioning is best-effort — never block organization creation on it.
        console.error(`[Provisioning] Failed to seed default accounts for org ${organizationId.slice(0, 8)}:`, error.message);
    }
}

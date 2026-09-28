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

export const DEFAULT_PERSONAL_ACCOUNTS = [
    { code: 'QB-1150040000', name: 'MoneyWise Wallet', type: 'ASSET', subtype: 'Bank', description: 'Main Personal Wallet' },
    { code: '3100', name: "Personal Equity", type: 'EQUITY', subtype: "Owner's Equity", description: 'Opening balance and personal worth' },
    { code: 'QB-73', name: 'Retained Savings', type: 'EQUITY', subtype: 'Retained Earnings', description: 'Accumulated net savings/deficit' },

    // Income Sources
    { code: 'INC-101', name: 'Salary & Wages', type: 'INCOME', subtype: 'Revenue', description: 'Personal employment salary and wages' },
    { code: 'INC-102', name: 'Side Business & Freelancing', type: 'INCOME', subtype: 'Revenue', description: 'Freelancing and side income' },
    { code: 'INC-103', name: 'Investments & Dividends', type: 'INCOME', subtype: 'Other Income', description: 'Returns from investments and dividends' },
    { code: 'INC-104', name: 'Rental Income', type: 'INCOME', subtype: 'Other Income', description: 'Income from property rentals' },
    { code: 'INC-105', name: 'Gifts & Allowances', type: 'INCOME', subtype: 'Other Income', description: 'Gifts, allowances, and transfers received' },

    // Expense Categories
    { code: 'EXP-201', name: 'Rent & Housing', type: 'EXPENSE', subtype: 'Operating Expenses', description: 'Housing rent and accommodation expenses' },
    { code: 'EXP-202', name: 'Groceries & Household', type: 'EXPENSE', subtype: 'Operating Expenses', description: 'Food, groceries, and household supplies' },
    { code: 'EXP-203', name: 'Utilities', type: 'EXPENSE', subtype: 'Operating Expenses', description: 'Electricity, water, cooking gas, internet' },
    { code: 'EXP-204', name: 'Transport & Fuel', type: 'EXPENSE', subtype: 'Operating Expenses', description: 'Public transport, taxi, and vehicle fuel' },
    { code: 'EXP-205', name: 'Dining & Entertainment', type: 'EXPENSE', subtype: 'Operating Expenses', description: 'Restaurants, takeout, movies, recreation' },
    { code: 'EXP-206', name: 'Healthcare & Medical', type: 'EXPENSE', subtype: 'Operating Expenses', description: 'Medical bills, pharmacy, health insurance' },
    { code: 'EXP-207', name: 'Education & Fees', type: 'EXPENSE', subtype: 'Operating Expenses', description: 'Tuition, courses, books, educational fees' },
    { code: 'EXP-208', name: 'Savings & Investments', type: 'EXPENSE', subtype: 'Operating Expenses', description: 'Personal savings allocations and investments' },
];

export async function seedPersonalAccounts(organizationId: string): Promise<void> {
    const rows = DEFAULT_PERSONAL_ACCOUNTS.map(a => ({
        ...a,
        organization_id: organizationId,
        is_active: true,
        updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
        .from('accounts')
        .upsert(rows, { onConflict: 'code,organization_id', ignoreDuplicates: false });

    if (error) {
        console.error(`[Provisioning] Failed to seed personal accounts for org ${organizationId.slice(0, 8)}:`, error.message);
    }

    // Purge unwanted business template accounts for this personal organization
    const BUSINESS_TEMPLATE_NAMES = [
        'Inventory Shrinkage', 'Cost of Goods Sold', 'Packaging Expense',
        'Sales Revenue', 'Licences & Levies', 'Professional Fees',
        'Repairs & Maintenance', 'Office Supplies', 'Marketing & Advertising',
        'Bank & Payment Charges', 'Sundry Income', 'Sundry Expenses', 'Interest Income',
        "Owner's Equity", 'Retained Earnings'
    ];

    const { error: purgeError } = await supabase
        .from('accounts')
        .delete()
        .eq('organization_id', organizationId)
        .in('name', BUSINESS_TEMPLATE_NAMES);

    if (purgeError) {
        console.warn(`[Provisioning] Warning purging business accounts for org ${organizationId.slice(0, 8)}:`, purgeError.message);
    }
}

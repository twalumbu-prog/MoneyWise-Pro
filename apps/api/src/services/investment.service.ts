/**
 * investment.service.ts — Books an investor's investments automatically.
 *
 * Every investment into a target becomes an ASSET account for the investor
 * ("Investment – Kapstone Capital", carrying the target's logo) and is posted
 * through the cashbook, so the balance sheet, the legacy report path and the GL
 * all see it without special cases:
 *
 *   Paid from the org's own wallet        Dr Investment      Cr Wallet
 *   Paid from outside (Airtel Money…)     Dr Wallet          Cr Owner's Capital
 *                                         Dr Investment      Cr Wallet
 *
 * In the second case the cash passes through the wallet, so its balance is
 * untouched, while assets and equity both rise by the amount invested. Any gap
 * between what the investor paid and what reached the target (collection fees)
 * is booked to an expense account instead of inflating the asset.
 *
 * Retained earnings is NOT touched: buying an asset isn't income. It moves only
 * when the investment earns something.
 */

import { supabase } from '../lib/supabase';
import { cashbookService } from './cashbook.service';
import { lusakaToday } from './schedule.service';
import { finalizeIfPaid } from './collectionRecovery.service';
import { LencoService } from './lenco.service';
import { ensureOrgLencoCredentials, ensureValidLencoAccountId, isLencoAccountId } from './lencoAccountLink.service';

/** Marks the pass-through cashbook rows so automations never mistake them for deposits. */
export const INVEST_PASSTHROUGH_PREFIX = 'INVEST-PT:';

const PENDING_EXPIRY_MS = 24 * 60 * 60 * 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

interface Target {
    id: string;
    organization_id: string;
    display_name: string;
    wallet_id: string;
    logo_url: string | null;
    organizations?: { logo_url: string | null } | null;
}

const targetLogo = (t: Target) => t.logo_url || t.organizations?.logo_url || null;

async function loadTarget(targetId: string): Promise<Target | null> {
    const { data } = await supabase
        .from('investment_targets')
        .select('id, organization_id, wallet_id, display_name, logo_url, organizations(logo_url)')
        .eq('id', targetId)
        .eq('is_active', true)
        .maybeSingle();
    return (data as any) ?? null;
}

// ── Accounts ─────────────────────────────────────────────────────────────────

/** The per-target asset account. Logo is refreshed every time so a new logo shows up. */
export async function ensureInvestmentAccount(orgId: string, target: Target): Promise<string> {
    const code = `INV-${target.id.slice(0, 8).toUpperCase()}`;
    const logo = targetLogo(target);

    const { data: existing } = await supabase
        .from('accounts')
        .select('id, logo_url, name')
        .eq('organization_id', orgId)
        .eq('code', code)
        .maybeSingle();

    if (existing) {
        if (existing.logo_url !== logo || existing.name !== `Investment – ${target.display_name}`) {
            await supabase.from('accounts').update({ logo_url: logo, name: `Investment – ${target.display_name}`, is_active: true }).eq('id', existing.id);
        }
        return existing.id;
    }

    const { data, error } = await supabase
        .from('accounts')
        .insert({
            organization_id: orgId,
            code,
            name: `Investment – ${target.display_name}`,
            type: 'ASSET',
            subtype: 'Other Asset',
            description: `Money invested in ${target.display_name} through MoneyWise Invest.`,
            logo_url: logo,
            is_active: true,
        })
        .select('id')
        .single();
    if (error || !data) throw new Error(`Could not create the investment account: ${error?.message}`);
    return data.id;
}

async function ensureContributionAccount(orgId: string): Promise<string> {
    const { data: candidates } = await supabase
        .from('accounts')
        .select('id, code, name, subtype')
        .eq('organization_id', orgId)
        .eq('type', 'EQUITY')
        .eq('is_active', true);

    const owner =
        candidates?.find(a => a.code === '3000') ??
        candidates?.find(a => a.subtype === "Owner's Equity") ??
        candidates?.find(a => /owner.*(capital|contribution|equity)/i.test(a.name));
    if (owner) return owner.id;

    const { data, error } = await supabase
        .from('accounts')
        .insert({
            organization_id: orgId, code: 'INV-CONTRIB', name: "Owner's Capital", type: 'EQUITY', subtype: "Owner's Equity",
            description: 'Money the owners put into the business from outside its wallets.', is_active: true,
        })
        .select('id')
        .single();
    if (error || !data) throw new Error(`Could not create the Owner's Capital account: ${error?.message}`);
    return data.id;
}

async function ensureFeesAccount(orgId: string): Promise<string> {
    const { data: existing } = await supabase
        .from('accounts').select('id').eq('organization_id', orgId).eq('code', 'INV-FEES').maybeSingle();
    if (existing) return existing.id;

    const { data, error } = await supabase
        .from('accounts')
        .insert({
            organization_id: orgId, code: 'INV-FEES', name: 'Investment Transaction Fees', type: 'EXPENSE', subtype: 'Operating Expenses',
            description: 'Collection and transfer fees paid when investing.', is_active: true,
        })
        .select('id')
        .single();
    if (error || !data) throw new Error(`Could not create the fees account: ${error?.message}`);
    return data.id;
}

// ── Posting ──────────────────────────────────────────────────────────────────

/** Creates a cashbook entry once; a second call with the same key is a no-op. */
async function postOnce(orgId: string, key: string, entry: Record<string, any>) {
    const { data: existing } = await supabase
        .from('cashbook_entries')
        .select('id')
        .eq('organization_id', orgId)
        .eq('external_reference', key)
        .maybeSingle();
    if (existing) return existing.id as string;

    const created = await cashbookService.createEntry(orgId, { ...entry, external_reference: key } as any);
    return created.id as string;
}

async function investorWallet(orgId: string) {
    const { data } = await supabase
        .from('organization_wallets')
        .select('id')
        .eq('organization_id', orgId)
        .eq('is_main', true)
        .maybeSingle();
    return data?.id ?? null;
}

/** Posts the pass-through accounting for an outside-funded investment. */
async function postExternalInvestment(inv: any, target: Target, received: number) {
    const orgId = inv.investor_organization_id;
    const paid = Math.max(Number(inv.amount_paid), received);
    const fee = round2(paid - received);
    const walletId = await investorWallet(orgId);

    const [assetAcct, equityAcct] = await Promise.all([
        ensureInvestmentAccount(orgId, target),
        ensureContributionAccount(orgId),
    ]);

    const base = {
        entry_type: 'ADJUSTMENT',
        date: lusakaToday(),
        created_by: inv.created_by,
        account_type: walletId ? 'MONEYWISE_WALLET' : 'CASH',
        wallet_id: walletId,
        status: 'COMPLETED',
    };
    const ref = inv.reference;

    // Contribution first, so the wallet never dips below zero mid-way.
    await postOnce(orgId, `${INVEST_PASSTHROUGH_PREFIX}${ref}:in`, {
        ...base, description: `Owner contribution: ${inv.method === 'MOBILE_MONEY' ? 'mobile money' : 'external'} payment into ${target.display_name} (${ref})`,
        debit: paid, credit: 0, account_id: equityAcct,
    });
    await postOnce(orgId, `${INVEST_PASSTHROUGH_PREFIX}${ref}:out`, {
        ...base, description: `Investment in ${target.display_name} (${ref})`,
        debit: 0, credit: received, account_id: assetAcct,
    });
    if (fee > 0.005) {
        const feesAcct = await ensureFeesAccount(orgId);
        await postOnce(orgId, `${INVEST_PASSTHROUGH_PREFIX}${ref}:fee`, {
            ...base, description: `Fees on investment in ${target.display_name} (${ref})`,
            debit: 0, credit: fee, account_id: feesAcct,
        });
    }
    return { assetAcct, fee };
}


// ── Wallet-to-wallet investments (real money) ───────────────────────────────

export class WalletInvestError extends Error {
    constructor(public code: string, message: string, public httpStatus = 422) { super(message); }
}

const walletInvestKey = (ref: string) => `invest_transfer:${ref}`;

/**
 * Pays an investment company from the investor's MoneyWise wallet with a REAL Lenco on-us
 * transfer (the same mechanism group-savings uses), and books both ledgers only once Lenco
 * confirms it. Booking the ledgers alone moved no money: the company's wallet looked funded
 * but its Lenco account was empty, so forwarding the deposit on to its bank could never work.
 *
 * Returns { mode: 'LEDGER' } for test-mode organizations (no real Lenco account exists), in
 * which case the caller keeps the old ledger-only behaviour.
 */
async function startWalletInvestment(params: {
    investorOrgId: string; userId: string; target: Target; sourceWalletId: string; sourceWalletName: string;
    amount: number; investorAccountId?: string | null; investorAccountNumber?: string | null; productName?: string | null;
}): Promise<{ mode: 'LEDGER' } | { mode: 'LENCO'; reference: string; outcome: 'confirmed' | 'waiting' | 'failed' }> {
    await Promise.all([ensureOrgLencoCredentials(params.investorOrgId), ensureOrgLencoCredentials(params.target.organization_id)]);
    const [{ data: investor }, { data: company }] = await Promise.all([
        supabase.from('organizations').select('lenco_subaccount_id, lenco_secret_key, payment_test_mode').eq('id', params.investorOrgId).maybeSingle(),
        supabase.from('organizations').select('lenco_subaccount_id, lenco_secret_key, payment_test_mode').eq('id', params.target.organization_id).maybeSingle(),
    ]);
    if (investor?.payment_test_mode || company?.payment_test_mode) return { mode: 'LEDGER' };

    for (const [row, id] of [[investor, params.investorOrgId], [company, params.target.organization_id]] as const) {
        if (row && row.lenco_subaccount_id && !isLencoAccountId(row.lenco_subaccount_id)) {
            const fixed = await ensureValidLencoAccountId(id);
            if (fixed.ok) (row as any).lenco_subaccount_id = fixed.accountId;
        }
    }
    if (!investor?.lenco_subaccount_id || !investor.lenco_secret_key || !isLencoAccountId(investor.lenco_subaccount_id)) {
        console.error(`[Invest] investor org ${params.investorOrgId} has no usable Lenco wallet`);
        throw new WalletInvestError('WALLET_UNAVAILABLE', "Your wallet isn't fully connected for transfers yet. Please pay by mobile money for now.", 409);
    }
    if (!company?.lenco_subaccount_id || !company.lenco_secret_key || !isLencoAccountId(company.lenco_subaccount_id)) {
        console.error(`[Invest] target org ${params.target.organization_id} has no usable Lenco wallet`);
        throw new WalletInvestError('TARGET_UNAVAILABLE', `${params.target.display_name} can't receive wallet payments right now. Please pay by mobile money.`, 409);
    }

    // The money must really be in the investor's Lenco account, not just on the ledger.
    const real = await LencoService.getAccountBalance(investor.lenco_subaccount_id, investor.lenco_secret_key).catch(() => null);
    const available = Number(real?.availableBalance ?? real?.balance ?? NaN);
    if (Number.isFinite(available) && available < params.amount) {
        throw new WalletInvestError('INSUFFICIENT_FUNDS', `Your wallet doesn't have K${params.amount.toFixed(2)} available at the moment.`, 400);
    }

    const details = await LencoService.getAccountDetails(company.lenco_subaccount_id, company.lenco_secret_key).catch(() => null);
    const till = details?.details?.tillNumber ? String(details.details.tillNumber) : '';
    if (!till) throw new WalletInvestError('TARGET_UNAVAILABLE', `${params.target.display_name} can't receive wallet payments right now. Please pay by mobile money.`, 409);

    const reference = `INVW-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { error: insErr } = await supabase.from('investments').insert({
        investor_organization_id: params.investorOrgId,
        investment_target_id: params.target.id,
        target_organization_id: params.target.organization_id,
        reference,
        method: 'WALLET',
        amount_paid: round2(params.amount),
        status: 'PENDING',
        created_by: params.userId,
        investor_account_id: params.investorAccountId ?? null,
        investor_account_number: params.investorAccountNumber ?? null,
        product_name: params.productName ? String(params.productName).slice(0, 120) : null,
    });
    if (insErr) throw new Error(`Could not record the investment: ${insErr.message}`);
    await supabase.from('app_settings').upsert({
        key: walletInvestKey(reference),
        value: { sourceWalletId: params.sourceWalletId, sourceWalletName: params.sourceWalletName },
        description: 'Pending wallet investment transfer (safe to delete once settled).',
        updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

    try {
        await LencoService.transferToLencoMerchant(
            { amount: round2(params.amount), reference, tillNumber: till, narration: `Investment: ${params.target.display_name}`.slice(0, 60) },
            investor.lenco_subaccount_id, investor.lenco_secret_key,
        );
    } catch (e: any) {
        await supabase.from('investments').update({ status: 'FAILED', failure_reason: e?.message || 'Transfer could not be started' }).eq('reference', reference);
        throw new WalletInvestError('TRANSFER_FAILED', e?.message || 'The transfer could not be started. Nothing was taken.', 422);
    }

    // On-us transfers normally settle within seconds; otherwise the cron settles it.
    let outcome: 'confirmed' | 'waiting' | 'failed' = 'waiting';
    for (let i = 0; i < 6 && outcome === 'waiting'; i++) {
        await new Promise(r => setTimeout(r, 1500));
        const { data: inv } = await supabase.from('investments').select('*').eq('reference', reference).maybeSingle();
        if (!inv) break;
        outcome = await settleWalletInvestment(inv).catch(() => 'waiting' as const);
    }
    return { mode: 'LENCO', reference, outcome };
}

/** Asks Lenco whether a pending wallet investment went through; books both ledgers or fails it. Safe to repeat. */
async function settleWalletInvestment(inv: any): Promise<'confirmed' | 'waiting' | 'failed'> {
    if (inv.status !== 'PENDING') return inv.status === 'CONFIRMED' ? 'confirmed' : 'failed';
    const { data: org } = await supabase.from('organizations').select('lenco_secret_key').eq('id', inv.investor_organization_id).maybeSingle();

    let status: any = null;
    try { status = await LencoService.getTransferStatus(inv.reference, (org as any)?.lenco_secret_key || undefined); } catch { return 'waiting'; }
    const st = String(status?.status || '').toLowerCase();

    if (st === 'failed' || st === 'declined' || st === 'rejected') {
        await supabase.from('investments')
            .update({ status: 'FAILED', failure_reason: status?.reasonForFailure || 'The wallet transfer was not completed.' })
            .eq('id', inv.id).eq('status', 'PENDING');
        return 'failed';
    }
    if (st !== 'successful') {
        if (!status && Date.now() - new Date(inv.created_at).getTime() > 60 * 60 * 1000) {
            await supabase.from('investments')
                .update({ status: 'FAILED', failure_reason: 'Lenco never received the transfer.' })
                .eq('id', inv.id).eq('status', 'PENDING');
            return 'failed';
        }
        return 'waiting';
    }

    // Claim before posting so two callers can't both post; postOnce makes a crash-retry safe.
    const amount = round2(Number(inv.amount_paid));
    const { data: claimed } = await supabase.from('investments')
        .update({ status: 'CONFIRMED', amount_received: amount, confirmed_at: new Date().toISOString() })
        .eq('id', inv.id).eq('status', 'PENDING').select('*').maybeSingle();
    if (!claimed) return 'confirmed';

    try {
        const target = await loadTarget(inv.investment_target_id);
        if (!target) throw new Error('Investment target no longer exists');
        const { data: saved } = await supabase.from('app_settings').select('value').eq('key', walletInvestKey(inv.reference)).maybeSingle();
        const sourceWalletId = (saved?.value as any)?.sourceWalletId || await investorWallet(inv.investor_organization_id);
        const sourceName = (saved?.value as any)?.sourceWalletName || 'MoneyWise wallet';

        const assetAcct = await ensureInvestmentAccount(inv.investor_organization_id, target);
        const label = `Investment: ${sourceName} ➜ ${target.display_name}`;
        const date = lusakaToday();

        // Both rows carry the transfer's reference so the Lenco sync recognises them instead of logging the same movement again.
        await postOnce(inv.investor_organization_id, inv.reference, {
            entry_type: 'ADJUSTMENT', description: `${label} (Outflow) | Ref: ${inv.reference}`, debit: 0, credit: amount, date,
            created_by: inv.created_by, account_type: 'MONEYWISE_WALLET', wallet_id: sourceWalletId, status: 'COMPLETED', account_id: assetAcct,
        });
        await postOnce(inv.target_organization_id, inv.reference, {
            entry_type: 'ADJUSTMENT', description: `${label} (Inflow) | Ref: ${inv.reference}`, debit: amount, credit: 0, date,
            reference_number: inv.reference, created_by: inv.created_by, account_type: 'MONEYWISE_WALLET', wallet_id: target.wallet_id, status: 'COMPLETED',
        });
        await supabase.from('investments').update({ account_id: assetAcct }).eq('id', inv.id);
        return 'confirmed';
    } catch (err: any) {
        console.error(`[Investments] Posting wallet investment ${inv.reference} failed:`, err);
        await supabase.from('investments').update({ status: 'PENDING', confirmed_at: null }).eq('id', inv.id);
        return 'waiting';
    }
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface InvestorPayoutContext {
    investorName: string;
    investorEmail: string | null;
    accountNumber: string | null;
    fundName: string;
    companyName: string;
    reference: string;
    /** What the recipient's bank statement should show: the investor's account number. */
    narration: string;
}

/**
 * Who a deposit into an investment company's wallet came from. Works from the cashbook
 * row: mobile-money deposits carry the investment's reference in external_reference,
 * wallet transfers in reference_number. Null when the deposit isn't a known investment.
 */
async function payoutContextForDeposit(
    targetOrgId: string,
    entry: { id?: string | null; external_reference?: string | null; reference_number?: string | null }
): Promise<InvestorPayoutContext | null> {
    const refs = [entry.external_reference, entry.reference_number].filter((r): r is string => !!r);
    if (!refs.length) return null;

    const { data: inv } = await supabase
        .from('investments')
        .select('reference, product_name, created_by, investor_account_id, investor_account_number, investment_target_id')
        .eq('target_organization_id', targetOrgId)
        .in('reference', refs)
        .limit(1)
        .maybeSingle();
    if (!inv) return null;

    const [{ data: user }, { data: acct }, { data: target }] = await Promise.all([
        supabase.from('users').select('name, email').eq('id', inv.created_by).maybeSingle(),
        inv.investor_account_id
            ? supabase.from('investor_accounts').select('applicant').eq('id', inv.investor_account_id).maybeSingle()
            : Promise.resolve({ data: null as any }),
        supabase.from('investment_targets').select('display_name').eq('id', inv.investment_target_id).maybeSingle(),
    ]);

    const a = (acct?.applicant ?? {}) as any;
    const applicantName = [a.first_name, a.last_name].filter(Boolean).join(' ').trim();
    const investorName = applicantName || user?.name || 'Investor';
    const investorEmail: string | null = a.email || user?.email || null;
    const companyName = target?.display_name || 'Investment company';
    const fundName = inv.product_name || companyName;
    const accountNumber = inv.investor_account_number || null;

    // The company reconciles on the investor's account number alone (falls back to the name if none is on file).
    const narration = (accountNumber || investorName).replace(/\s+/g, ' ').slice(0, 100);
    return { investorName, investorEmail, accountNumber, fundName, companyName, reference: inv.reference, narration };
}

export const investmentService = {
    ensureInvestmentAccount,
    loadTarget,
    payoutContextForDeposit,
    startWalletInvestment,

    /** Called before the investor pays, so the payment can be matched to them later. */
    async recordIntent(params: {
        investorOrgId: string; userId: string; targetId: string; reference: string; amount: number;
        investorAccountId?: string | null; investorAccountNumber?: string | null; productName?: string | null;
    }) {
        const target = await loadTarget(params.targetId);
        if (!target) throw new Error('Investment target not found');
        if (target.organization_id === params.investorOrgId) throw new Error('Cannot invest into your own organization');
        if (!(params.amount > 0)) throw new Error('Amount must be greater than zero');
        if (!/^[A-Za-z0-9_-]{6,64}$/.test(params.reference)) throw new Error('Invalid reference');

        const { data, error } = await supabase
            .from('investments')
            .insert({
                investor_organization_id: params.investorOrgId,
                investment_target_id: target.id,
                target_organization_id: target.organization_id,
                reference: params.reference,
                method: 'MOBILE_MONEY',
                amount_paid: round2(params.amount),
                created_by: params.userId,
                investor_account_id: params.investorAccountId ?? null,
                investor_account_number: params.investorAccountNumber ?? null,
                product_name: params.productName ? String(params.productName).slice(0, 120) : null,
            })
            .select('id, status')
            .single();

        if (error) {
            if ((error as any).code === '23505') return { id: null, status: 'EXISTS' }; // idempotent retry
            throw new Error(`Could not record the investment: ${error.message}`);
        }
        return data;
    },

    /** Records a wallet-to-wallet investment. The cashbook outflow itself is posted by the caller. */
    async recordWalletInvestment(params: {
        investorOrgId: string; userId: string; target: Target; reference: string; amount: number; accountId: string;
        investorAccountId?: string | null; investorAccountNumber?: string | null; productName?: string | null;
    }) {
        await supabase.from('investments').insert({
            investor_organization_id: params.investorOrgId,
            investment_target_id: params.target.id,
            target_organization_id: params.target.organization_id,
            reference: params.reference,
            method: 'WALLET',
            amount_paid: round2(params.amount),
            amount_received: round2(params.amount),
            status: 'CONFIRMED',
            account_id: params.accountId,
            created_by: params.userId,
            confirmed_at: new Date().toISOString(),
            investor_account_id: params.investorAccountId ?? null,
            investor_account_number: params.investorAccountNumber ?? null,
            product_name: params.productName ? String(params.productName).slice(0, 120) : null,
        });
    },

    /**
     * Confirms one pending mobile-money investment if its deposit has landed in
     * the target's wallet. Safe to call repeatedly (client on success + the cron).
     */
    async confirm(inv: any): Promise<'confirmed' | 'waiting' | 'failed'> {
        if (inv.status !== 'PENDING') return inv.status === 'CONFIRMED' ? 'confirmed' : 'failed';
        if (inv.method === 'WALLET') return settleWalletInvestment(inv);

        const findDeposit = () => supabase
            .from('cashbook_entries')
            .select('id, debit, status')
            .eq('organization_id', inv.target_organization_id)
            .eq('external_reference', inv.reference)
            .gt('debit', 0)
            .in('status', ['COMPLETED', 'UNACCOUNTED', 'ACCOUNTED'])
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        let { data: deposit } = await findDeposit();
        if (!deposit && inv.method === 'MOBILE_MONEY') {
            // Paid at Lenco but never finalised (app closed mid-wait, webhook late)? Book it now.
            const outcome = await finalizeIfPaid(inv.reference, inv.target_organization_id);
            if (outcome === 'finalized') ({ data: deposit } = await findDeposit());
            if (outcome === 'failed') {
                await supabase.from('investments')
                    .update({ status: 'FAILED', failure_reason: 'The mobile money payment was declined or not approved.' })
                    .eq('id', inv.id).eq('status', 'PENDING');
                return 'failed';
            }
        }

        if (!deposit) {
            if (Date.now() - new Date(inv.created_at).getTime() > PENDING_EXPIRY_MS) {
                await supabase.from('investments')
                    .update({ status: 'FAILED', failure_reason: 'No deposit arrived within 24 hours.' })
                    .eq('id', inv.id).eq('status', 'PENDING');
                return 'failed';
            }
            return 'waiting';
        }

        // Claim before posting so two callers can't both post; postOnce makes a crash-retry safe.
        const received = round2(Number(deposit.debit));
        const { data: claimed } = await supabase
            .from('investments')
            .update({ status: 'CONFIRMED', amount_received: received, confirmed_at: new Date().toISOString() })
            .eq('id', inv.id)
            .eq('status', 'PENDING')
            .select('*')
            .maybeSingle();
        if (!claimed) return 'confirmed';

        try {
            const target = await loadTarget(inv.investment_target_id);
            if (!target) throw new Error('Investment target no longer exists');
            const { assetAcct, fee } = await postExternalInvestment(claimed, target, received);
            await supabase.from('investments').update({ account_id: assetAcct, fee_amount: fee }).eq('id', inv.id);
            return 'confirmed';
        } catch (err: any) {
            console.error(`[Investments] Posting ${inv.reference} failed:`, err);
            await supabase.from('investments').update({ status: 'PENDING', confirmed_at: null }).eq('id', inv.id);
            return 'waiting';
        }
    },

    /** Cron sweep: confirm every pending investment whose deposit has arrived. */
    async confirmPending(budgetMs = 15_000) {
        const started = Date.now();
        const { data: pending } = await supabase
            .from('investments')
            .select('*')
            .eq('status', 'PENDING')
            .order('created_at', { ascending: true })
            .limit(50);

        const out = { checked: pending?.length ?? 0, confirmed: 0, failed: 0 };
        for (const inv of pending ?? []) {
            if (Date.now() - started > budgetMs) break;
            try {
                const r = await this.confirm(inv);
                if (r === 'confirmed') out.confirmed++;
                if (r === 'failed') out.failed++;
            } catch (err: any) {
                console.error(`[Investments] confirm ${inv.reference} errored:`, err.message);
            }
        }
        return out;
    },
};

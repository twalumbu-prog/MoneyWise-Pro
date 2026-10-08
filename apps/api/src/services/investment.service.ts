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

/** Marks the pass-through cashbook rows so automations never mistake them for deposits. */
export const INVEST_PASSTHROUGH_PREFIX = 'INVEST-PT:';

const PENDING_EXPIRY_MS = 24 * 60 * 60 * 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

interface Target {
    id: string;
    organization_id: string;
    display_name: string;
    logo_url: string | null;
    organizations?: { logo_url: string | null } | null;
}

const targetLogo = (t: Target) => t.logo_url || t.organizations?.logo_url || null;

async function loadTarget(targetId: string): Promise<Target | null> {
    const { data } = await supabase
        .from('investment_targets')
        .select('id, organization_id, display_name, logo_url, organizations(logo_url)')
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

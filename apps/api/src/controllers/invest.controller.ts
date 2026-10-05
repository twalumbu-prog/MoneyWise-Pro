import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';
import { investmentService } from '../services/investment.service';
import { investorAccountService, InvestorAccountError } from '../services/investorAccount.service';

/**
 * Real (non-demo) investment targets shown at the top of the Invest feature.
 * Each row is a real organization + wallet that can receive actual money via
 * mobile money (existing wallet-scoped Lenco collection endpoints, unchanged)
 * or an internal MoneyWise wallet-to-wallet transfer (walletTransferToTarget
 * below).
 */
export const listInvestmentTargets = async (req: any, res: any): Promise<any> => {
    try {
        const { data, error } = await supabase
            .from('investment_targets')
            .select('id, organization_id, wallet_id, display_name, category, description, logo_url, priority, provider_key, requires_account, sales_people, fund_fact_sheet_url, organizations(logo_url)')
            .eq('is_active', true)
            .order('priority', { ascending: true });

        if (error) throw error;

        res.json((data || []).map((t) => ({
            id: t.id,
            organizationId: t.organization_id,
            walletId: t.wallet_id,
            displayName: t.display_name,
            category: t.category,
            description: t.description,
            // Falls back to the organization's own uploaded logo when the target has none.
            logoUrl: t.logo_url || (t as any).organizations?.logo_url || null,
            providerKey: (t as any).provider_key ?? null,
            requiresAccount: (t as any).requires_account !== false,
            salesPeople: Array.isArray((t as any).sales_people) ? (t as any).sales_people : [],
            factSheetUrl: (t as any).fund_fact_sheet_url ?? null,
        })));
    } catch (error: any) {
        console.error('Error listing investment targets:', error);
        res.status(500).json({ error: 'Failed to load investment targets', details: error.message });
    }
};

/**
 * Moves real ledger funds from the caller's own wallet into a real investment
 * target's wallet — the "MoneyWise wallet" funding method on the Invest page.
 * Mirrors transferSubwalletFunds (cashbook.controller.ts), except the two
 * paired cashbook entries land in two DIFFERENT organizations rather than one.
 * The destination must be a row in investment_targets (never an arbitrary
 * org/wallet id supplied by the client) so this can't be used as a general
 * cross-tenant transfer primitive.
 */
export const walletTransferToInvestmentTarget = async (req: any, res: any): Promise<any> => {
    try {
        const { sourceWalletId, targetId, amount, description, productName } = req.body;
        const organizationId = (req as any).user.organization_id;
        const userId = (req as any).user.id;

        if (!sourceWalletId || !targetId || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ error: 'Source wallet, investment target, and a valid amount are required' });
        }
        if (!organizationId) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        const { data: target, error: targetError } = await supabase
            .from('investment_targets')
            .select('organization_id, wallet_id, display_name')
            .eq('id', targetId)
            .eq('is_active', true)
            .single();

        if (targetError || !target) {
            return res.status(404).json({ error: 'Investment target not found' });
        }
        if (target.organization_id === organizationId) {
            return res.status(400).json({ error: 'Cannot invest into your own organization' });
        }
        // No active account with this company, no investing — checked server-side so the
        // app's prompt can't be bypassed by calling the endpoint directly.
        const investorAccount = await investorAccountService.assertCanInvest(organizationId, targetId);

        const { data: sourceWallet, error: sourceWalletError } = await supabase
            .from('organization_wallets')
            .select('id, name')
            .eq('id', sourceWalletId)
            .eq('organization_id', organizationId)
            .single();

        if (sourceWalletError || !sourceWallet) {
            return res.status(404).json({ error: 'Source wallet not found' });
        }

        const sourceBalance = await cashbookService.getCurrentBalance(organizationId, 'MONEYWISE_WALLET', sourceWalletId);
        if (sourceBalance < amount) {
            return res.status(400).json({ error: `Insufficient funds in ${sourceWallet.name}. Available: K${sourceBalance.toFixed(2)}` });
        }

        const transferDesc = description || `Investment: ${sourceWallet.name} ➜ ${target.display_name}`;
        const today = new Date().toISOString().split('T')[0];

        // Book it as an asset on the investor's side: Dr Investment / Cr Wallet.
        const fullTarget = await investmentService.loadTarget(targetId);
        const investmentAccountId = fullTarget
            ? await investmentService.ensureInvestmentAccount(organizationId, fullTarget)
            : null;

        const outflowEntry = await cashbookService.createEntry(organizationId, {
            entry_type: 'ADJUSTMENT',
            description: `${transferDesc} (Outflow)`,
            debit: 0,
            credit: amount,
            date: today,
            created_by: userId,
            account_type: 'MONEYWISE_WALLET',
            wallet_id: sourceWalletId,
            status: 'COMPLETED',
            ...(investmentAccountId ? { account_id: investmentAccountId } : {}),
        } as any);

        const inflowEntry = await cashbookService.createEntry(target.organization_id, {
            entry_type: 'ADJUSTMENT',
            description: `${transferDesc} (Inflow)`,
            debit: amount,
            credit: 0,
            date: today,
            created_by: userId,
            account_type: 'MONEYWISE_WALLET',
            wallet_id: target.wallet_id,
            status: 'COMPLETED',
        } as any);

        if (fullTarget && investmentAccountId) {
            await investmentService.recordWalletInvestment({
                investorOrgId: organizationId, userId, target: fullTarget, amount,
                reference: `WT-${outflowEntry.id}`, accountId: investmentAccountId,
                investorAccountId: investorAccount?.id ?? null, investorAccountNumber: investorAccount?.account_number ?? null,
                productName,
            }).catch(err => console.error('[Investments] could not record wallet investment:', err.message));
        }

        res.json({
            message: 'Investment transfer completed successfully',
            outflowEntryId: outflowEntry.id,
            inflowEntryId: inflowEntry.id,
        });
    } catch (error: any) {
        if (error instanceof InvestorAccountError) return res.status(error.httpStatus).json({ error: error.message, code: error.code });
        console.error('Error transferring investment funds:', error);
        res.status(500).json({ error: 'Failed to transfer funds', details: error.message });
    }
};

/**
 * Registers a mobile-money investment BEFORE the investor pays. The public
 * collection endpoints don't know who is paying, so this is what lets the
 * deposit — once it lands in the target's wallet — be booked to the right
 * investor automatically.
 */
export const recordInvestmentIntent = async (req: any, res: any): Promise<any> => {
    try {
        const { reference, investmentTargetId, amount, productName } = req.body;
        const { organization_id: investorOrgId, id: userId } = (req as any).user;
        if (!reference || !investmentTargetId || typeof amount !== 'number') {
            return res.status(400).json({ error: 'reference, investmentTargetId and amount are required' });
        }
        const investorAccount = await investorAccountService.assertCanInvest(investorOrgId, investmentTargetId);
        const result = await investmentService.recordIntent({
            investorOrgId, userId, targetId: investmentTargetId, reference, amount,
            investorAccountId: investorAccount?.id ?? null, investorAccountNumber: investorAccount?.account_number ?? null, productName,
        });
        res.status(201).json(result);
    } catch (error: any) {
        if (error instanceof InvestorAccountError) return res.status(error.httpStatus).json({ error: error.message, code: error.code });
        res.status(400).json({ error: error.message });
    }
};

/** Optional fast path: the app calls this on success so the books update immediately. */
export const confirmInvestment = async (req: any, res: any): Promise<any> => {
    try {
        const { data: inv } = await supabase
            .from('investments')
            .select('*')
            .eq('reference', req.params.reference)
            .eq('investor_organization_id', (req as any).user.organization_id)
            .maybeSingle();
        if (!inv) return res.status(404).json({ error: 'Investment not found' });
        res.json({ result: await investmentService.confirm(inv) });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};


// ── Investor accounts ────────────────────────────────────────────────────────

const sendAccountError = (res: any, error: any, fallback: string) => {
    if (error instanceof InvestorAccountError) {
        return res.status(error.httpStatus).json({ error: error.message, code: error.code, details: error.details });
    }
    console.error(`[Invest] ${fallback}:`, error);
    return res.status(500).json({ error: fallback, details: error?.message });
};

/** The caller's account / application with each company (one row per company). */
export const listMyInvestorAccounts = async (req: any, res: any): Promise<any> => {
    try {
        const orgId = req.user.organization_id;
        if (!orgId) return res.status(400).json({ error: 'User organization context missing' });
        const rows = await investorAccountService.myAccounts(orgId);
        res.json(rows.map((r: any) => ({
            id: r.id, targetId: r.investment_target_id, source: r.source, status: r.status,
            accountNumber: r.account_number, reviewNote: r.review_note, createdAt: r.created_at, updatedAt: r.updated_at,
        })));
    } catch (error: any) { sendAccountError(res, error, 'Failed to load your investment accounts'); }
};

export const connectInvestorAccount = async (req: any, res: any): Promise<any> => {
    try {
        const { targetId, accountNumber } = req.body ?? {};
        if (!targetId || typeof accountNumber !== 'string') return res.status(400).json({ error: 'targetId and accountNumber are required' });
        const row = await investorAccountService.connect({
            investorOrgId: req.user.organization_id, userId: req.user.id, targetId, accountNumber,
        });
        res.status(201).json(row);
    } catch (error: any) { sendAccountError(res, error, 'Failed to connect the account'); }
};

/** Reads an uploaded ID with AI so the application form can be pre-filled. */
const extractionCalls = new Map<string, number[]>();
export const extractInvestorId = async (req: any, res: any): Promise<any> => {
    try {
        const { path, idType } = req.body ?? {};
        if (typeof path !== 'string') return res.status(400).json({ error: 'path is required' });

        // Each call is a paid vision request: cap it per user so it can't be used as a free OCR endpoint.
        const now = Date.now();
        const recent = (extractionCalls.get(req.user.id) ?? []).filter(t => now - t < 60 * 60 * 1000);
        if (recent.length >= 12) return res.status(429).json({ error: 'Too many ID reads. Please enter your details manually or try again later.' });
        recent.push(now);
        extractionCalls.set(req.user.id, recent);

        res.json(await investorAccountService.extractIdDetails(req.user.id, path, typeof idType === 'string' ? idType : ''));
    } catch (error: any) { sendAccountError(res, error, 'Failed to read the ID'); }
};

export const applyForInvestorAccount = async (req: any, res: any): Promise<any> => {
    try {
        const { targetId, applicant, documents, declaration } = req.body ?? {};
        if (!targetId) return res.status(400).json({ error: 'targetId is required' });
        const row = await investorAccountService.apply({
            investorOrgId: req.user.organization_id, userId: req.user.id, targetId, applicant, documents, declaration: declaration === true,
        });
        res.status(201).json(row);
    } catch (error: any) { sendAccountError(res, error, 'Failed to submit the application'); }
};

// ── Company side (CRM → Investors, Settings → Investor payouts) ──────────────

export const listInvestorApplications = async (req: any, res: any): Promise<any> => {
    try {
        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        res.json(await investorAccountService.listApplications(req.user.organization_id, status));
    } catch (error: any) { sendAccountError(res, error, 'Failed to load applications'); }
};

export const getInvestorApplication = async (req: any, res: any): Promise<any> => {
    try {
        const row = await investorAccountService.getApplication(req.params.id, req.user.organization_id);
        if (!row) return res.status(404).json({ error: 'Application not found' });
        res.json(row);
    } catch (error: any) { sendAccountError(res, error, 'Failed to load the application'); }
};

export const reviewInvestorApplication = async (req: any, res: any): Promise<any> => {
    try {
        const { status, accountNumber, note } = req.body ?? {};
        const row = await investorAccountService.review({
            id: req.params.id, targetOrgId: req.user.organization_id, reviewerId: req.user.id, status, accountNumber, note,
        });
        res.json(row);
    } catch (error: any) { sendAccountError(res, error, 'Failed to update the application'); }
};

export const getPayoutSettings = async (req: any, res: any): Promise<any> => {
    try {
        res.json(await investorAccountService.getPayoutSettings(req.user.organization_id));
    } catch (error: any) { sendAccountError(res, error, 'Failed to load payout settings'); }
};

export const savePayoutSettings = async (req: any, res: any): Promise<any> => {
    try {
        const { bankName, branch, accountNumber, accountName, forwardDeposits } = req.body ?? {};
        res.json(await investorAccountService.savePayoutSettings({
            orgId: req.user.organization_id, userId: req.user.id,
            bankName, branch, accountNumber, accountName, forwardDeposits: forwardDeposits === true,
        }));
    } catch (error: any) { sendAccountError(res, error, 'Failed to save payout settings'); }
};

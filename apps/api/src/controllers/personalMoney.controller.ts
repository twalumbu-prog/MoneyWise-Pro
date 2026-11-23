import { Response } from 'express';
import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';
import { ledgerService } from '../services/ledger.service';
import { createManualJournal } from '../services/journalEntry.service';
import { orgContext } from './personalOnboarding.controller';
import {
    PROVIDERS, providerByCode, parseMoney, walletName, HOLDING_KINDS, isHoldingKind, holdingAccountName, findingsFromEmails,
    type ProviderType, type HoldingKind, type EmailRow,
} from '../services/personalOnboarding/money';

/**
 * Personal onboarding, "Your money" (docs/personal-onboarding-plan.md steps 8, 10, 11, 12).
 *
 *   GET    /onboarding/personal/money              accounts (with opening + current balance), holdings, totals
 *   PUT    /onboarding/personal/accounts           { walletId?, providerType, providerCode?, nickname?, customName?, balance }
 *   DELETE /onboarding/personal/accounts/:walletId
 *   PUT    /onboarding/personal/holdings           { accountId?, kind, name, value, monthlyRepayment?, repaymentDay? }
 *   DELETE /onboarding/personal/holdings/:accountId
 *   GET    /onboarding/personal/gmail-findings
 *
 * Opening balances are real bookkeeping, marked so they can be told apart from activity:
 *   - an account's balance is one OPENING_BALANCE cashbook entry, external_reference ONB-OPEN-<walletId>, against
 *     Personal Equity, so the wallet card and the books both start at what the person typed;
 *   - a holding is its own ASSET / LIABILITY account plus one manual journal, reference ONB-HOLD-<accountId>.
 * Saving again replaces the same entry; it never adds a second one.
 */

const today = () => new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10); // Lusaka calendar day
const openRef = (walletId: string) => `ONB-OPEN-${walletId}`;
const holdRef = (accountId: string) => `ONB-HOLD-${accountId}`;

const SUBTYPE: Record<ProviderType, string> = { MOBILE_MONEY: 'Mobile Money', BANK: 'Bank', CUSTOM: 'Cash' };

/** Personal Equity (3100) — where opening balances land. Created if a workspace somehow lacks it. */
async function equityAccountId(orgId: string): Promise<string> {
    const { data } = await supabase.from('accounts').select('id, code, name').eq('organization_id', orgId).eq('type', 'EQUITY').eq('is_active', true);
    const rows = data || [];
    const hit = rows.find((a: any) => a.code === '3100') ?? rows.find((a: any) => /equity/i.test(a.name)) ?? null;
    if (hit) return hit.id;
    const { data: made, error } = await supabase.from('accounts').insert({
        organization_id: orgId, code: '3100', name: 'Personal Equity', type: 'EQUITY', subtype: "Owner's Equity", is_active: true,
        description: 'Your personal worth: opening balances, and everything earned less spent',
    }).select('id').single();
    if (error || !made) throw new Error(`Could not create Personal Equity: ${error?.message}`);
    return made.id;
}

/** The ASSET account behind an external wallet, created and linked if missing, so its journals never fall to Uncategorised. */
async function ensureWalletAsset(orgId: string, wallet: { id: string; name: string; qb_account_id: string | null }, type: ProviderType): Promise<string> {
    if (wallet.qb_account_id) {
        const { data: linked } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('type', 'ASSET').eq('id', wallet.qb_account_id).maybeSingle();
        if (linked) return linked.id;
    }
    const { data: byName } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('type', 'ASSET').eq('name', wallet.name).maybeSingle();
    let id = byName?.id as string | undefined;
    if (!id) {
        const { data: made, error } = await supabase.from('accounts').insert({
            organization_id: orgId, code: `EXT-${wallet.id.slice(0, 8).toUpperCase()}`, name: wallet.name, type: 'ASSET', subtype: SUBTYPE[type], is_active: true,
            description: `Money in ${wallet.name}`,
        }).select('id').single();
        if (error || !made) throw new Error(`Could not create the account for ${wallet.name}: ${error?.message}`);
        id = made.id;
    }
    await supabase.from('external_wallets').update({ qb_account_id: id }).eq('id', wallet.id);
    return id!;
}

async function openingEntry(orgId: string, walletId: string) {
    const { data } = await supabase.from('cashbook_entries').select('id, debit, date, created_at')
        .eq('organization_id', orgId).eq('external_reference', openRef(walletId)).maybeSingle();
    return data as { id: string; debit: number; date: string; created_at: string } | null;
}

/** Sets the wallet's opening balance to `amount` (0 removes it), keeping balances and the books in step. */
async function setOpeningBalance(orgId: string, userId: string, walletId: string, walletLabel: string, amount: number) {
    const existing = await openingEntry(orgId, walletId);
    if (existing && Number(existing.debit) === amount) return;
    if (existing) {
        if (amount === 0) {
            await ledgerService.removeForCashbookEntry(existing.id, orgId);
            await supabase.from('cashbook_entries').delete().eq('id', existing.id);
        } else {
            await supabase.from('cashbook_entries').update({ debit: amount, credit: 0 }).eq('id', existing.id);
            await ledgerService.repostForCashbookEntry(existing.id);
        }
        await cashbookService.recalculateBalancesFrom(orgId, existing.date, existing.created_at, walletId);
        return;
    }
    if (amount === 0) return;
    await cashbookService.createEntry(orgId, {
        entry_type: 'OPENING_BALANCE',
        description: `Opening balance · ${walletLabel}`,
        debit: amount,
        credit: 0,
        date: today(),
        created_by: userId,
        account_type: walletId,
        account_id: await equityAccountId(orgId),
        status: 'ACCOUNTED',
        external_reference: openRef(walletId),
        skip_inflow_notification: true,
    } as any);
}

async function listAccounts(orgId: string) {
    const { data: wallets } = await supabase.from('external_wallets').select('id, name, provider_type, provider_name, qb_account_id').eq('organization_id', orgId).order('created_at');
    const out = [];
    for (const w of wallets || []) {
        const [open, balance] = await Promise.all([openingEntry(orgId, w.id), cashbookService.getCurrentBalance(orgId, w.id)]);
        const prov = PROVIDERS.find((p) => p.name === w.provider_name || p.code === w.provider_name);
        out.push({
            walletId: w.id, name: w.name, providerType: w.provider_type as ProviderType, providerCode: prov?.code ?? null,
            openingBalance: open ? Number(open.debit) : 0, balance,
        });
    }
    return out;
}

async function holdingJournal(orgId: string, accountId: string) {
    const { data } = await supabase.from('journal_entries').select('id, journal_lines(account_id, debit, credit)')
        .eq('organization_id', orgId).eq('source_type', 'MANUAL').eq('external_reference', holdRef(accountId)).maybeSingle();
    return data as { id: string; journal_lines: { account_id: string; debit: number; credit: number }[] } | null;
}

async function listHoldings(orgId: string) {
    const { data } = await supabase.from('accounts').select('id, name, type, subtype, description, code')
        .eq('organization_id', orgId).like('code', 'ONB-%').eq('is_active', true).order('created_at');
    const out = [];
    for (const a of data || []) {
        const j = await holdingJournal(orgId, a.id);
        const line = j?.journal_lines.find((l) => l.account_id === a.id);
        const meta = (() => { try { return JSON.parse(a.description || '{}'); } catch { return {}; } })();
        out.push({
            accountId: a.id, kind: meta.kind as HoldingKind, name: meta.name ?? a.name, type: a.type,
            value: line ? Number(line.debit || line.credit || 0) : 0,
            monthlyRepayment: meta.monthlyRepayment ?? null, repaymentDay: meta.repaymentDay ?? null,
        });
    }
    return out;
}

export const getPersonalMoney = async (req: any, res: Response): Promise<any> => {
    try {
        const ctx = orgContext(req, res);
        if (!ctx) return;
        const [accounts, holdings] = await Promise.all([listAccounts(ctx.orgId), listHoldings(ctx.orgId)]);
        const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
        const byType = (t: ProviderType) => sum(accounts.filter((a) => a.providerType === t).map((a) => a.balance));
        const assets = holdings.filter((h) => h.type === 'ASSET');
        const debts = holdings.filter((h) => h.type === 'LIABILITY');
        const breakdown = {
            mobileMoney: byType('MOBILE_MONEY'), bank: byType('BANK'), cash: byType('CUSTOM'),
            savingsAndInvestments: sum(assets.filter((h) => ['savings', 'investments', 'pension', 'business'].includes(h.kind)).map((h) => h.value)),
            otherAssets: sum(assets.filter((h) => !['savings', 'investments', 'pension', 'business'].includes(h.kind)).map((h) => h.value)),
            debts: sum(debts.map((h) => h.value)),
        };
        const total = sum([breakdown.mobileMoney, breakdown.bank, breakdown.cash, breakdown.savingsAndInvestments, breakdown.otherAssets]) - breakdown.debts;
        return res.json({ accounts, holdings, breakdown, total: Math.round(total * 100) / 100, providers: PROVIDERS.map(({ keys, ...p }) => p) });
    } catch (e: any) {
        console.error('[PersonalMoney] get', e);
        return res.status(500).json({ error: 'Failed to load your accounts' });
    }
};

export const savePersonalAccount = async (req: any, res: Response): Promise<any> => {
    try {
        const ctx = orgContext(req, res);
        if (!ctx) return;
        const b = req.body || {};
        const type: ProviderType = b.providerType === 'BANK' || b.providerType === 'MOBILE_MONEY' ? b.providerType : 'CUSTOM';
        const prov = type === 'CUSTOM' ? undefined : providerByCode(b.providerCode);
        if (type !== 'CUSTOM' && (!prov || prov.type !== type)) return res.status(400).json({ error: 'Choose a provider', field: 'providerCode' });
        const money = parseMoney(b.balance);
        if ('error' in money) return res.status(400).json({ error: money.error, field: 'balance' });
        const name = walletName(prov, b.nickname, b.customName);

        // Find the wallet: by id when editing, else by name (a retry after a lost response finds the one it made).
        let wallet: { id: string; name: string; qb_account_id: string | null } | null = null;
        if (typeof b.walletId === 'string') {
            const { data } = await supabase.from('external_wallets').select('id, name, qb_account_id').eq('id', b.walletId).eq('organization_id', ctx.orgId).maybeSingle();
            if (!data) return res.status(404).json({ error: 'That account no longer exists' });
            wallet = data;
            if (data.name !== name) {
                const { error } = await supabase.from('external_wallets').update({ name, provider_type: type, provider_name: prov?.name ?? null }).eq('id', data.id);
                if (error?.code === '23505') return res.status(409).json({ error: `You already have an account called “${name}”. Give this one a nickname.`, field: 'nickname' });
                if (error) throw error;
                if (data.qb_account_id) await supabase.from('accounts').update({ name }).eq('id', data.qb_account_id).eq('organization_id', ctx.orgId);
                wallet = { ...data, name };
            }
        } else {
            const { data: same } = await supabase.from('external_wallets').select('id, name, qb_account_id').eq('organization_id', ctx.orgId).eq('name', name).maybeSingle();
            if (same) {
                if (b.allowExisting !== true) return res.status(409).json({ error: `You already added “${name}”. Give this one a nickname, e.g. “${name} 2”.`, field: 'nickname', walletId: same.id });
                wallet = same;
            } else {
                const { data, error } = await supabase.from('external_wallets')
                    .insert({ organization_id: ctx.orgId, name, provider_type: type, provider_name: prov?.name ?? null })
                    .select('id, name, qb_account_id').single();
                if (error) throw error;
                wallet = data;
            }
        }
        await ensureWalletAsset(ctx.orgId, wallet!, type);
        await setOpeningBalance(ctx.orgId, ctx.userId, wallet!.id, wallet!.name, money.value);
        const balance = await cashbookService.getCurrentBalance(ctx.orgId, wallet!.id);
        return res.json({ walletId: wallet!.id, name: wallet!.name, providerType: type, providerCode: prov?.code ?? null, openingBalance: money.value, balance });
    } catch (e: any) {
        console.error('[PersonalMoney] saveAccount', e);
        return res.status(500).json({ error: 'Failed to save this account' });
    }
};

export const deletePersonalAccount = async (req: any, res: Response): Promise<any> => {
    try {
        const ctx = orgContext(req, res);
        if (!ctx) return;
        const walletId = String(req.params.walletId);
        const { data: w } = await supabase.from('external_wallets').select('id, name, qb_account_id').eq('id', walletId).eq('organization_id', ctx.orgId).maybeSingle();
        if (!w) return res.json({ removed: false });
        await setOpeningBalance(ctx.orgId, ctx.userId, walletId, w.name, 0);
        // Only remove the account itself if nothing else was ever booked to it (a capture may have landed already).
        const { count } = await supabase.from('cashbook_entries').select('id', { count: 'exact', head: true }).eq('organization_id', ctx.orgId).eq('account_type', walletId);
        if ((count ?? 0) === 0) {
            await supabase.from('external_wallets').delete().eq('id', walletId);
            if (w.qb_account_id) {
                const { count: lines } = await supabase.from('journal_lines').select('id', { count: 'exact', head: true }).eq('account_id', w.qb_account_id);
                if ((lines ?? 0) === 0) await supabase.from('accounts').delete().eq('id', w.qb_account_id).eq('organization_id', ctx.orgId);
            }
            return res.json({ removed: true });
        }
        return res.json({ removed: false, kept: 'This account already has transactions, so only its opening balance was removed.' });
    } catch (e: any) {
        console.error('[PersonalMoney] deleteAccount', e);
        return res.status(500).json({ error: 'Failed to remove this account' });
    }
};

async function deleteHoldingJournal(orgId: string, accountId: string) {
    const j = await holdingJournal(orgId, accountId);
    if (!j) return;
    await supabase.from('journal_lines').delete().eq('journal_entry_id', j.id);
    await supabase.from('journal_entries').delete().eq('id', j.id);
}

export const savePersonalHolding = async (req: any, res: Response): Promise<any> => {
    try {
        const ctx = orgContext(req, res);
        if (!ctx) return;
        const b = req.body || {};
        if (!isHoldingKind(b.kind)) return res.status(400).json({ error: 'Choose what this is', field: 'kind' });
        const kind: HoldingKind = b.kind;
        const def = HOLDING_KINDS[kind];
        const money = parseMoney(b.value);
        if ('error' in money) return res.status(400).json({ error: money.error, field: 'value' });
        if (money.value === 0) return res.status(400).json({ error: 'Enter what it is worth', field: 'value' });
        const repay = b.monthlyRepayment === undefined || b.monthlyRepayment === null || b.monthlyRepayment === '' ? null : parseMoney(b.monthlyRepayment);
        if (repay && 'error' in repay) return res.status(400).json({ error: repay.error, field: 'monthlyRepayment' });
        const day = b.repaymentDay == null || b.repaymentDay === '' ? null : Number(b.repaymentDay);
        if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) return res.status(400).json({ error: 'Pick a day from 1 to 31', field: 'repaymentDay' });

        const displayName = String(b.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || def.label;
        const accountName = holdingAccountName(kind, displayName);
        const meta = JSON.stringify({ onboarding: true, kind, name: displayName, monthlyRepayment: repay && 'value' in repay ? repay.value : null, repaymentDay: day });

        let accountId: string;
        if (typeof b.accountId === 'string') {
            const { data } = await supabase.from('accounts').select('id').eq('id', b.accountId).eq('organization_id', ctx.orgId).like('code', 'ONB-%').maybeSingle();
            if (!data) return res.status(404).json({ error: 'That item no longer exists' });
            accountId = data.id;
            await supabase.from('accounts').update({ name: accountName, type: def.type, subtype: def.subtype, description: meta }).eq('id', accountId);
        } else {
            const { data, error } = await supabase.from('accounts').insert({
                organization_id: ctx.orgId, code: `ONB-${kind.toUpperCase().slice(0, 6)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
                name: accountName, type: def.type, subtype: def.subtype, description: meta, is_active: true,
            }).select('id').single();
            if (error || !data) throw error || new Error('account insert failed');
            accountId = data.id;
        }

        await deleteHoldingJournal(ctx.orgId, accountId);
        const equity = await equityAccountId(ctx.orgId);
        const asset = def.type === 'ASSET';
        await createManualJournal(ctx.orgId, ctx.userId, {
            date: today(),
            description: `Opening balance · ${displayName}`,
            reference: holdRef(accountId),
            lines: [
                { account_id: accountId, debit: asset ? money.value : 0, credit: asset ? 0 : money.value, description: def.label },
                { account_id: equity, debit: asset ? 0 : money.value, credit: asset ? money.value : 0, description: 'Opening balance' },
            ],
        });
        return res.json({ accountId, kind, name: displayName, type: def.type, value: money.value, monthlyRepayment: repay && 'value' in repay ? repay.value : null, repaymentDay: day });
    } catch (e: any) {
        console.error('[PersonalMoney] saveHolding', e);
        return res.status(e?.httpStatus && e.httpStatus < 500 ? e.httpStatus : 500).json({ error: e?.httpStatus && e.httpStatus < 500 ? e.message : 'Failed to save this item' });
    }
};

export const deletePersonalHolding = async (req: any, res: Response): Promise<any> => {
    try {
        const ctx = orgContext(req, res);
        if (!ctx) return;
        const accountId = String(req.params.accountId);
        const { data } = await supabase.from('accounts').select('id').eq('id', accountId).eq('organization_id', ctx.orgId).like('code', 'ONB-%').maybeSingle();
        if (!data) return res.json({ removed: false });
        await deleteHoldingJournal(ctx.orgId, accountId);
        const { count } = await supabase.from('journal_lines').select('id', { count: 'exact', head: true }).eq('account_id', accountId);
        if ((count ?? 0) === 0) await supabase.from('accounts').delete().eq('id', accountId);
        else await supabase.from('accounts').update({ is_active: false }).eq('id', accountId);
        return res.json({ removed: true });
    } catch (e: any) {
        console.error('[PersonalMoney] deleteHolding', e);
        return res.status(500).json({ error: 'Failed to remove this item' });
    }
};

/** Banks, regular bills and the latest bank statement seen in the connected mailbox (last 90 days). */
export const getGmailFindings = async (req: any, res: Response): Promise<any> => {
    try {
        const ctx = orgContext(req, res);
        if (!ctx) return;
        const { data: conns } = await supabase.from('email_connections').select('id, email_address, last_synced_at, status')
            .eq('organization_id', ctx.orgId).neq('status', 'DISCONNECTED');
        if (!conns?.length) return res.json({ connected: false, providers: [], bills: [], statement: null });
        const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
        const { data: rows } = await supabase.from('inbound_emails').select('id, from_address, subject, received_at, has_attachments, attachments, intent_amount')
            .eq('organization_id', ctx.orgId).gte('received_at', since).order('received_at', { ascending: false }).limit(1000);
        const f = findingsFromEmails((rows || []) as EmailRow[]);
        return res.json({
            connected: true, mailbox: conns[0].email_address, syncedAt: conns[0].last_synced_at,
            providers: f.providers.map((c) => ({ code: c, name: providerByCode(c)?.name ?? c, type: providerByCode(c)?.type ?? 'BANK' })),
            bills: f.bills, statement: f.statement,
        });
    } catch (e: any) {
        console.error('[PersonalMoney] gmailFindings', e);
        return res.status(500).json({ error: 'Failed to read your mailbox' });
    }
};

/**
 * POST /onboarding/personal/kyc/statement-from-gmail { emailId }
 * Uses the bank statement found in the mailbox as proof of residence: downloads the PDF from Gmail, stores it with the
 * person's KYC uploads, and sets it on their KYC profile (other documents untouched). Only with a direct Google
 * connection; otherwise 409 and the app asks for an upload. The usual KYC checks run when the profile is reviewed.
 */
export const attachGmailStatementToKyc = async (req: any, res: Response): Promise<any> => {
    try {
        const ctx = orgContext(req, res);
        if (!ctx) return;
        const emailId = String(req.body?.emailId || '');
        if (!/^[0-9a-f-]{36}$/i.test(emailId)) return res.status(400).json({ error: 'Choose a statement' });
        const { downloadEmailAttachment } = await import('../services/gmail.service');
        const file = await downloadEmailAttachment(ctx.orgId, emailId);
        if (!file) return res.status(409).json({ error: 'We can’t fetch that statement automatically. Save it from Gmail and upload it instead.' });
        if (file.data.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'That statement is larger than 10MB. Upload a smaller copy.' });
        if (file.mimeType !== 'application/pdf' && !/\.pdf$/i.test(file.filename)) return res.status(400).json({ error: 'That attachment isn’t a PDF.' });
        const path = `${ctx.userId}/kyc-profile/proof_of_residence_${Date.now()}.pdf`;
        const { error: upErr } = await supabase.storage.from('investor-kyc').upload(path, file.data, { contentType: 'application/pdf', upsert: false });
        if (upErr) throw upErr;
        const { data: existing } = await supabase.from('investor_kyc_profiles').select('documents').eq('user_id', ctx.userId).maybeSingle();
        const documents = { ...((existing?.documents as Record<string, string>) || {}), proof_of_residence: path };
        const { error } = existing
            ? await supabase.from('investor_kyc_profiles').update({ documents, updated_at: new Date().toISOString() }).eq('user_id', ctx.userId)
            : await supabase.from('investor_kyc_profiles').insert({ user_id: ctx.userId, applicant: {}, documents });
        if (error) throw error;
        return res.json({ path, filename: file.filename });
    } catch (e: any) {
        console.error('[PersonalMoney] statementForKyc', e);
        return res.status(500).json({ error: 'Couldn’t use that statement. Upload it instead.' });
    }
};

/**
 * POST /onboarding/personal/wallet/check — after the person deposits the activation amount (the normal Deposit
 * screen), finds that deposit and marks the wallet activated: a COMPLETED inflow to the MoneyWise wallet of at least
 * the activation amount, made after the wallet was linked. Same rule as /onboarding/wallet/activation-confirm, without
 * the app having to carry the deposit reference around. The wallet needs an adult (18+) on the account.
 */
export const checkPersonalWalletActivation = async (req: any, res: Response): Promise<any> => {
    try {
        const ctx = orgContext(req, res);
        if (!ctx) return;
        const { data: user } = await supabase.from('users').select('date_of_birth').eq('id', ctx.userId).maybeSingle();
        if (user?.date_of_birth) {
            const { validateDateOfBirth } = await import('../services/personalOnboarding/steps');
            const v = validateDateOfBirth(user.date_of_birth);
            if ('age' in v && v.age < 18) return res.status(403).json({ error: 'The MoneyWise wallet is for people aged 18 and over.', minor: true });
        }
        const [{ data: progress }, { data: pool }, { data: setting }] = await Promise.all([
            supabase.from('onboarding_progress').select('wallet_activated').eq('organization_id', ctx.orgId).maybeSingle(),
            supabase.from('wallet_pool').select('linked_at').eq('linked_organization_id', ctx.orgId).maybeSingle(),
            supabase.from('app_settings').select('value').eq('key', 'wallet_activation_amount').maybeSingle(),
        ]);
        if (progress?.wallet_activated) return res.json({ linked: true, activated: true });
        if (!pool) return res.json({ linked: false, activated: false });
        const amount = Number((setting?.value as any)?.amount) > 0 ? Number((setting?.value as any).amount) : 50;
        const { data: dep } = await supabase.from('cashbook_entries').select('id, external_reference, reference_number, debit, created_at')
            .eq('organization_id', ctx.orgId).eq('entry_type', 'INFLOW').eq('status', 'COMPLETED').eq('account_type', 'MONEYWISE_WALLET')
            .gte('debit', amount).gte('created_at', pool.linked_at ?? new Date(0).toISOString())
            .order('created_at', { ascending: true }).limit(1).maybeSingle();
        if (!dep) return res.json({ linked: true, activated: false, amount });
        const reference = dep.external_reference || dep.reference_number || dep.id;
        const { error } = await supabase.from('onboarding_progress')
            .update({ wallet_activated: true, wallet_activation_reference: reference, updated_at: new Date().toISOString() })
            .eq('organization_id', ctx.orgId);
        if (error) throw error;
        const { markStep } = await import('./personalOnboarding.controller');
        const steps = await markStep(ctx.orgId, 'wallet', 'done');
        return res.json({ linked: true, activated: true, reference, steps });
    } catch (e: any) {
        console.error('[PersonalMoney] walletCheck', e);
        return res.status(500).json({ error: 'Couldn’t check your wallet' });
    }
};

/**
 * automation.tools.ts — Lets the assistant create and manage automations.
 *
 * These are ordinary human-gated write tools: `handler` validates and returns a
 * proposal, `execute` only runs after the user approves the card. An automation
 * that forwards money is exactly the kind of thing that must be read and
 * approved field by field, so the proposal spells out where the money will go —
 * and the recipient account is verified with the bank before the card is shown,
 * so a mistyped number fails here instead of after the first deposit.
 *
 * The assistant can set up, pause and stop automations. It cannot fire one — a
 * run is always triggered by a real deposit or by an admin pressing Run now.
 */

import { supabase } from '../../../lib/supabase';
import { LencoService } from '../../lenco.service';
import { ForwardPaymentAction, SendPopEmailAction, AutomationAction } from '../../automation.service';
import { ToolDefinition, ToolProposal } from '../types';

const kwacha = (n: number) =>
    `K${Number(n).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function propose(summary: string, preview: Array<{ label: string; value: string }>, warning?: string): ToolProposal {
    return { __proposal: true, summary, preview, warning };
}

function invalid(message: string): never {
    throw new Error(`INVALID_ARGUMENTS: ${message}`);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface VerifiedRecipient {
    accountNumber: string;
    bankCode: string;
    bankName: string;
    accountName: string;
    /** Set when the bank's name for the account doesn't resemble what the user typed. */
    nameMismatch?: string;
}

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1);

/** Confirms the account exists at the bank and returns the bank's own name for it. */
async function verifyRecipient(
    organizationId: string,
    accountNumber: string,
    bankName: string,
    claimedName?: string
): Promise<VerifiedRecipient> {
    const number = String(accountNumber ?? '').replace(/\s+/g, '');
    if (!/^\d{6,20}$/.test(number)) invalid('accountNumber must be the bank account number (digits only). Ask the user for it.');
    if (!bankName?.trim()) invalid('bankName is required (for example "FNB"). Ask the user which bank the account is with.');

    const { data: org } = await supabase
        .from('organizations')
        .select('lenco_secret_key')
        .eq('id', organizationId)
        .maybeSingle();
    const secretKey = org?.lenco_secret_key || process.env.LENCO_SECRET_KEY;

    const bankCode = await LencoService.findBankId(bankName.trim(), secretKey);

    let resolved;
    try {
        resolved = await LencoService.resolveBankAccount(number, bankCode, secretKey);
    } catch (err: any) {
        invalid(
            `The bank could not verify account ${number} at "${bankName}" (${err.message}). ` +
            'Ask the user to double-check the account number and bank — do not create the automation with an unverified account.'
        );
    }

    const accountName = resolved.accountName || claimedName || '';
    let nameMismatch: string | undefined;
    if (claimedName && resolved.accountName) {
        const want = tokens(claimedName);
        const have = new Set(tokens(resolved.accountName));
        if (want.length && !want.some(t => have.has(t))) {
            nameMismatch = `You said the account holder is "${claimedName}" but the bank returns "${resolved.accountName}".`;
        }
    }

    return {
        accountNumber: number,
        bankCode,
        bankName: resolved.bankName || bankName.trim(),
        accountName,
        nameMismatch,
    };
}

async function resolveWallet(organizationId: string, walletName?: string) {
    const { data: wallets, error } = await supabase
        .from('organization_wallets')
        .select('id, name, is_main')
        .eq('organization_id', organizationId);
    if (error) throw new Error(error.message);
    if (!wallets?.length) invalid('This organisation has no wallets yet.');

    if (!walletName?.trim()) {
        return wallets.find(w => w.is_main) ?? wallets[0];
    }
    const wanted = walletName.trim().toLowerCase();
    const match = wallets.find(w => w.name.toLowerCase() === wanted) ?? wallets.find(w => w.name.toLowerCase().includes(wanted));
    if (!match) invalid(`No wallet named "${walletName}". Wallets: ${wallets.map(w => w.name).join(', ')}.`);
    return match;
}

function describeActions(actions: AutomationAction[]): string {
    return actions.map(a => {
        if (a.type === 'FORWARD_PAYMENT') return `Forward to ${a.recipient_name} (${a.recipient_bank_name ?? a.recipient_bank_code} ${a.recipient_account})`;
        if (a.type === 'SEND_POP_EMAIL') return `Email Proof of Payment to ${a.to}`;
        return (a as any).type;
    }).join(' → ');
}

// ─── list_automations ────────────────────────────────────────────────────────

const listAutomations: ToolDefinition = {
    name: 'list_automations',
    description:
        'The automations set up for this organisation (rules that run by themselves when money arrives), ' +
        'with their status, what they do, and their most recent runs. Use before changing or pausing one.',
    effect: 'read',
    allowedRoles: ['ADMIN', 'AUTHORISER', 'ACCOUNTANT'],
    parameters: { type: 'object', properties: {} },
    handler: async ctx => {
        const { data: automations, error } = await supabase
            .from('automations')
            .select('id, name, description, status, trigger_type, trigger_config, actions, last_run_at, created_at')
            .eq('organization_id', ctx.organizationId)
            .neq('status', 'ARCHIVED')
            .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);

        const ids = (automations ?? []).map(a => a.id);
        const runsBy: Record<string, any[]> = {};
        if (ids.length) {
            const { data: runs } = await supabase
                .from('automation_runs')
                .select('automation_id, status, amount, forwarded_amount, error, started_at')
                .in('automation_id', ids)
                .order('started_at', { ascending: false })
                .limit(100);
            for (const r of runs ?? []) (runsBy[r.automation_id] ||= []).length < 5 && runsBy[r.automation_id].push(r);
        }

        const walletIds = [...new Set((automations ?? []).map(a => a.trigger_config?.wallet_id).filter(Boolean))];
        const walletNames: Record<string, string> = {};
        if (walletIds.length) {
            const { data: ws } = await supabase.from('organization_wallets').select('id, name').in('id', walletIds);
            for (const w of ws ?? []) walletNames[w.id] = w.name;
        }

        return {
            count: automations?.length ?? 0,
            automations: (automations ?? []).map(a => ({
                id: a.id,
                name: a.name,
                status: a.status,
                trigger: `Deposit into ${walletNames[a.trigger_config?.wallet_id] ?? 'a wallet'}`,
                does: describeActions(a.actions ?? []),
                last_run_at: a.last_run_at,
                recent_runs: runsBy[a.id] ?? [],
            })),
        };
    },
};

// ─── create_automation ───────────────────────────────────────────────────────

const createAutomation: ToolDefinition = {
    name: 'create_automation',
    description:
        'Set up an automation that runs by itself every time money is deposited into a wallet: it forwards the ' +
        'deposit on to a bank account and (optionally) emails a Proof of Payment once the transfer is confirmed. ' +
        'You need: a name, the bank account to forward to (account number, bank, account holder name) and which ' +
        'wallet to watch (defaults to the main wallet). Ask for anything missing — especially the account number and ' +
        'bank. The account is verified with the bank before the user is asked to approve. Only deposits made AFTER ' +
        'the automation is created are forwarded.',
    effect: 'write',
    allowedRoles: ['ADMIN'],
    parameters: {
        type: 'object',
        properties: {
            name: { type: 'string', description: 'Short name, e.g. "Forward investment deposits to Stephen".' },
            description: { type: 'string', description: 'Optional one-line note on what it is for.' },
            walletName: { type: 'string', description: 'Wallet to watch. Omit for the main wallet.' },
            accountNumber: { type: 'string', description: 'Bank account number to forward deposits to.' },
            bankName: { type: 'string', description: 'Bank, e.g. "FNB", "Zanaco", "Stanbic".' },
            accountName: { type: 'string', description: 'Account holder name as the user gave it.' },
            popEmail: { type: 'string', description: 'Email address to send a Proof of Payment to after each forward. Optional.' },
            minAmount: { type: 'number', description: 'Ignore deposits smaller than this (ZMW). Optional.' },
        },
        required: ['name', 'accountNumber', 'bankName', 'accountName'],
    },
    handler: async (ctx, args) => {
        if (!args.name?.trim()) invalid('A name is required.');
        if (args.popEmail && !EMAIL.test(args.popEmail)) invalid(`"${args.popEmail}" is not a valid email address.`);
        if (args.minAmount !== undefined && !(Number(args.minAmount) >= 0)) invalid('minAmount must be zero or more.');

        const wallet = await resolveWallet(ctx.organizationId, args.walletName);
        const recipient = await verifyRecipient(ctx.organizationId, args.accountNumber, args.bankName, args.accountName);

        return propose(
            `Create automation "${args.name.trim()}"`,
            [
                { label: 'When', value: `Money is deposited into ${wallet.name}${args.minAmount ? ` (deposits of ${kwacha(args.minAmount)} or more)` : ''}` },
                { label: 'Then', value: 'Forward the deposit immediately (a small bank transfer fee applies)' },
                { label: 'Send to', value: `${recipient.accountName} — ${recipient.bankName} ${recipient.accountNumber}` },
                { label: 'Bank check', value: 'Account verified with the bank' },
                ...(args.popEmail ? [{ label: 'Proof of Payment', value: `Emailed to ${args.popEmail} after each confirmed transfer` }] : []),
                { label: 'Starts', value: 'From now — earlier deposits are not touched' },
            ],
            recipient.nameMismatch
                ? `${recipient.nameMismatch} Check this is the right account before approving — every deposit will be paid out to it automatically.`
                : 'Once approved, real deposits will be paid out to this account automatically, without anyone clicking anything.'
        );
    },
    execute: async (ctx, args) => {
        const wallet = await resolveWallet(ctx.organizationId, args.walletName);
        const recipient = await verifyRecipient(ctx.organizationId, args.accountNumber, args.bankName, args.accountName);

        const actions: AutomationAction[] = [
            {
                type: 'FORWARD_PAYMENT',
                recipient_account: recipient.accountNumber,
                recipient_bank_code: recipient.bankCode,
                recipient_bank_name: recipient.bankName,
                recipient_name: recipient.accountName,
                payment_method: 'BANK_TRANSFER',
                fee_mode: 'AUTO',
            } satisfies ForwardPaymentAction,
        ];
        if (args.popEmail) actions.push({ type: 'SEND_POP_EMAIL', to: args.popEmail.trim() } satisfies SendPopEmailAction);

        const { data, error } = await supabase
            .from('automations')
            .insert({
                organization_id: ctx.organizationId,
                created_by: ctx.userId,
                name: args.name.trim(),
                description: args.description?.trim() || null,
                trigger_type: 'WALLET_DEPOSIT',
                trigger_config: {
                    wallet_id: wallet.id,
                    ...(args.minAmount ? { min_amount: Number(args.minAmount) } : {}),
                },
                actions,
                status: 'ACTIVE',
                watch_from: new Date().toISOString(),
            })
            .select('id, name, status')
            .single();

        if (error) throw new Error(`Could not create the automation: ${error.message}`);
        return { created: true, automation: data, link: '/intelligence' };
    },
};

// ─── update_automation ───────────────────────────────────────────────────────

const updateAutomation: ToolDefinition = {
    name: 'update_automation',
    description:
        'Change an existing automation: pause it, resume it, archive (stop) it, rename it, change the Proof of Payment ' +
        'email, the minimum deposit, or the bank account it forwards to. Find the id with list_automations first. ' +
        'Resuming only picks up deposits made from that moment on.',
    effect: 'write',
    allowedRoles: ['ADMIN'],
    parameters: {
        type: 'object',
        properties: {
            automationId: { type: 'string', description: 'UUID from list_automations.' },
            status: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'ARCHIVED'] },
            name: { type: 'string' },
            popEmail: { type: 'string', description: 'New Proof of Payment email. Pass an empty string to stop sending it.' },
            minAmount: { type: 'number', description: 'New minimum deposit (ZMW). 0 removes the minimum.' },
            accountNumber: { type: 'string', description: 'New destination account number (needs bankName and accountName too).' },
            bankName: { type: 'string' },
            accountName: { type: 'string' },
        },
        required: ['automationId'],
    },
    handler: async (ctx, args) => {
        const current = await loadOwned(ctx.organizationId, args.automationId);
        const changes: Array<{ label: string; value: string }> = [];
        let warning: string | undefined;

        if (args.status) {
            if (!['ACTIVE', 'PAUSED', 'ARCHIVED'].includes(args.status)) invalid('status must be ACTIVE, PAUSED or ARCHIVED.');
            changes.push({ label: 'Status', value: `${current.status.toLowerCase()} → ${args.status.toLowerCase()}` });
            if (args.status === 'ARCHIVED') warning = 'Archiving stops this automation for good. Its run history is kept.';
        }
        if (args.name?.trim()) changes.push({ label: 'Name', value: args.name.trim() });
        if (args.popEmail !== undefined) {
            if (args.popEmail && !EMAIL.test(args.popEmail)) invalid(`"${args.popEmail}" is not a valid email address.`);
            changes.push({ label: 'Proof of Payment email', value: args.popEmail || 'stop sending' });
        }
        if (args.minAmount !== undefined) {
            if (!(Number(args.minAmount) >= 0)) invalid('minAmount must be zero or more.');
            changes.push({ label: 'Minimum deposit', value: Number(args.minAmount) > 0 ? kwacha(args.minAmount) : 'none' });
        }
        if (args.accountNumber || args.bankName || args.accountName) {
            if (!args.accountNumber || !args.bankName || !args.accountName) {
                invalid('To change the destination account give accountNumber, bankName and accountName together.');
            }
            const r = await verifyRecipient(ctx.organizationId, args.accountNumber, args.bankName, args.accountName);
            changes.push({ label: 'Forward to', value: `${r.accountName} — ${r.bankName} ${r.accountNumber} (verified)` });
            warning = r.nameMismatch
                ? `${r.nameMismatch} Every future deposit will go to this account.`
                : 'Every future deposit will be paid to this new account.';
        }

        if (!changes.length) invalid('Nothing to change — ask the user what they want to change.');

        return propose(`Update automation "${current.name}"`, changes, warning);
    },
    execute: async (ctx, args) => {
        const current = await loadOwned(ctx.organizationId, args.automationId);
        const updates: Record<string, any> = { updated_at: new Date().toISOString() };

        if (args.status) {
            updates.status = args.status;
            if (args.status === 'ACTIVE' && current.status === 'PAUSED') updates.watch_from = new Date().toISOString();
        }
        if (args.name?.trim()) updates.name = args.name.trim();

        if (args.minAmount !== undefined) {
            const cfg = { ...(current.trigger_config ?? {}) };
            if (Number(args.minAmount) > 0) cfg.min_amount = Number(args.minAmount);
            else delete cfg.min_amount;
            updates.trigger_config = cfg;
        }

        let actions: AutomationAction[] = [...(current.actions ?? [])];
        if (args.popEmail !== undefined) {
            actions = actions.filter(a => a.type !== 'SEND_POP_EMAIL');
            if (args.popEmail) actions.push({ type: 'SEND_POP_EMAIL', to: args.popEmail.trim() });
        }
        if (args.accountNumber) {
            const r = await verifyRecipient(ctx.organizationId, args.accountNumber, args.bankName, args.accountName);
            actions = actions.map(a =>
                a.type === 'FORWARD_PAYMENT'
                    ? { ...a, recipient_account: r.accountNumber, recipient_bank_code: r.bankCode, recipient_bank_name: r.bankName, recipient_name: r.accountName }
                    : a
            );
        }
        if (args.popEmail !== undefined || args.accountNumber) updates.actions = actions;

        const { data, error } = await supabase
            .from('automations')
            .update(updates)
            .eq('id', current.id)
            .eq('organization_id', ctx.organizationId)
            .select('id, name, status')
            .single();
        if (error) throw new Error(`Could not update the automation: ${error.message}`);
        return { updated: true, automation: data, link: '/intelligence' };
    },
};

async function loadOwned(organizationId: string, id: string) {
    if (!id) invalid('automationId is required — call list_automations to find it.');
    const { data } = await supabase
        .from('automations')
        .select('*')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .neq('status', 'ARCHIVED')
        .maybeSingle();
    if (!data) invalid(`No active automation with id ${id}. Call list_automations for the current ids.`);
    return data as any;
}

export const automationTools: ToolDefinition[] = [listAutomations, createAutomation, updateAutomation];

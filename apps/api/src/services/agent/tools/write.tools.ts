/**
 * write.tools.ts — State-changing tools, all human-gated.
 *
 * Every tool here is split in two:
 *   handler()  validates the arguments and returns a ToolProposal. It performs
 *              no writes. Its job is to fail loudly on bad input *before* a
 *              human is asked to approve something that can't succeed.
 *   execute()  performs the write. The loop only ever calls this after an
 *              approval arrives carrying the matching tool-call id.
 *
 * Role checks live on the definition (`allowedRoles`) and are enforced by the
 * registry before either function runs — the model is never trusted to respect
 * permissions it was merely told about.
 *
 * Money movement (disbursements, payment links, payouts) is deliberately absent.
 */

import { supabase } from '../../../lib/supabase';
import { ledgerService } from '../../ledger.service';
import { memoryService } from '../../ai/memory.service';
import { AgentContext, ToolDefinition, ToolProposal } from '../types';

const kwacha = (n: number) =>
    `K${Number(n).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function propose(summary: string, preview: Array<{ label: string; value: string }>, warning?: string): ToolProposal {
    return { __proposal: true, summary, preview, warning };
}

/** Throws a message written for the model to read and self-correct from. */
function invalid(message: string): never {
    throw new Error(`INVALID_ARGUMENTS: ${message}`);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Requisitions ────────────────────────────────────────────────────────────

const CADENCES = ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY'];
const CATEGORIES = ['BILLS', 'SUBSCRIPTIONS', 'INVESTMENTS', 'LOAN_REPAYMENTS', 'GENERAL_EXPENSES'];

interface LineItemArg {
    description: string;
    quantity?: number;
    unitPrice: number;
}

function validateLineItems(items: LineItemArg[]): { items: LineItemArg[]; total: number } {
    if (!Array.isArray(items) || items.length === 0) {
        invalid('At least one line item is required. Ask the user what is being requested and for how much.');
    }
    const clean = items.map((li, idx) => {
        if (!li.description?.trim()) invalid(`Line item ${idx + 1} has no description.`);
        const qty = Number(li.quantity ?? 1);
        const price = Number(li.unitPrice);
        if (!Number.isFinite(price) || price <= 0) {
            invalid(`Line item ${idx + 1} ("${li.description}") needs a unit price greater than zero. Ask the user.`);
        }
        if (!Number.isFinite(qty) || qty <= 0) invalid(`Line item ${idx + 1} has an invalid quantity.`);
        return { description: li.description.trim(), quantity: qty, unitPrice: price };
    });
    return { items: clean, total: clean.reduce((s, li) => s + li.quantity! * li.unitPrice, 0) };
}

/**
 * Mirrors the "Accountability Safeguard" in requisition.controller.ts: a user
 * with an outstanding DISBURSED/EXPENSED requisition may not raise another
 * expense request. The agent must not be a way around a control that exists in
 * the UI — and catching it in the handler means the user is told why instead of
 * being shown an approval card for a write that would fail.
 */
async function assertNoAccountabilityBlock(ctx: AgentContext, type?: string): Promise<void> {
    if (type && type !== 'EXPENSE') return;

    const { data: active } = await supabase
        .from('requisitions')
        .select('id, status, description')
        .eq('requestor_id', ctx.userId)
        .eq('organization_id', ctx.organizationId)
        .in('status', ['DISBURSED', 'EXPENSED'])
        // limit(1) rather than maybeSingle(): with two outstanding requisitions
        // maybeSingle() errors, which would silently skip the block entirely.
        .limit(1)
        .maybeSingle();

    if (active) {
        invalid(
            `This user already has an outstanding requisition ("${active.description ?? active.id.slice(0, 8)}", ` +
            `status ${active.status}). MoneyWise blocks a new expense request until that cycle is completed. ` +
            `Tell the user this — do not retry.`
        );
    }
}

const createRequisition: ToolDefinition = {
    name: 'create_requisition',
    description:
        'Draft a new requisition with its line items. Before calling this, make sure you know ' +
        'what is being bought, the quantity and unit price of each item, and which department ' +
        'it belongs to — ask the user for anything missing rather than guessing. The requisition ' +
        'is created as a DRAFT for the user to review and submit; it is never auto-approved.',
    effect: 'write',
    allowedRoles: ['ADMIN', 'AUTHORISER', 'ACCOUNTANT', 'REQUESTOR'],
    parameters: {
        type: 'object',
        properties: {
            description: { type: 'string', description: 'What this requisition is for, in one line.' },
            department: { type: 'string', description: 'Department name. Use get_org_overview to see which exist.' },
            type: { type: 'string', description: 'Requisition type. Defaults to EXPENSE.' },
            lineItems: {
                type: 'array',
                description: 'Every item being requested.',
                items: {
                    type: 'object',
                    properties: {
                        description: { type: 'string' },
                        quantity: { type: 'number', description: 'Defaults to 1.' },
                        unitPrice: { type: 'number', description: 'Price per unit in ZMW.' },
                    },
                    required: ['description', 'unitPrice'],
                },
            },
        },
        required: ['description', 'lineItems'],
    },
    handler: async (ctx, args) => {
        if (!args.description?.trim()) invalid('A description is required.');
        const { items, total } = validateLineItems(args.lineItems);
        await assertNoAccountabilityBlock(ctx, args.type);

        return propose(
            `Create a draft requisition: ${args.description}`,
            [
                { label: 'Description', value: args.description },
                { label: 'Department', value: args.department || 'Unassigned' },
                { label: 'Line items', value: String(items.length) },
                ...items.map((li, i) => ({
                    label: `  ${i + 1}. ${li.description}`,
                    value: `${li.quantity} × ${kwacha(li.unitPrice)} = ${kwacha(li.quantity! * li.unitPrice)}`,
                })),
                { label: 'Estimated total', value: kwacha(total) },
                { label: 'Status on create', value: 'DRAFT — you still submit it yourself' },
            ]
        );
    },
    execute: async (ctx, args) => {
        const { items, total } = validateLineItems(args.lineItems);
        // Re-checked at commit time: an outstanding requisition may have appeared
        // between the proposal and the approval.
        await assertNoAccountabilityBlock(ctx, args.type);

        const { data: req, error } = await supabase
            .from('requisitions')
            .insert({
                organization_id: ctx.organizationId,
                requestor_id: ctx.userId,
                description: args.description.trim(),
                department: args.department || null,
                type: args.type || 'EXPENSE',
                status: 'DRAFT',
                estimated_total: Number(total.toFixed(2)),
            })
            .select('id, reference_number, description, estimated_total, status')
            .single();
        if (error) throw new Error(`Could not create requisition: ${error.message}`);

        const { error: liErr } = await supabase.from('line_items').insert(
            items.map(li => ({
                requisition_id: req.id,
                description: li.description,
                quantity: li.quantity,
                unit_price: li.unitPrice,
                estimated_amount: Number((li.quantity! * li.unitPrice).toFixed(2)),
            }))
        );
        if (liErr) {
            // A header with no items is worse than nothing — roll it back.
            await supabase.from('requisitions').delete().eq('id', req.id).eq('organization_id', ctx.organizationId);
            throw new Error(`Could not add line items, requisition was rolled back: ${liErr.message}`);
        }

        return {
            created: true,
            requisition: req,
            line_item_count: items.length,
            link: `/requisitions/${req.id}`,
        };
    },
};

const updateRequisition: ToolDefinition = {
    name: 'update_requisition',
    description:
        'Change the description, department or type of an existing DRAFT requisition. ' +
        'Requisitions that have moved past DRAFT cannot be edited here — say so instead.',
    effect: 'write',
    allowedRoles: ['ADMIN', 'AUTHORISER', 'ACCOUNTANT'],
    parameters: {
        type: 'object',
        properties: {
            requisitionId: { type: 'string', description: 'UUID from search_requisitions.' },
            description: { type: 'string' },
            department: { type: 'string' },
            type: { type: 'string' },
        },
        required: ['requisitionId'],
    },
    handler: async (ctx, args) => {
        const { data: req } = await supabase
            .from('requisitions')
            .select('id, description, department, type, status')
            .eq('id', args.requisitionId)
            .eq('organization_id', ctx.organizationId)
            .maybeSingle();

        if (!req) invalid('No requisition with that id exists in this organisation.');
        if (req.status !== 'DRAFT') {
            invalid(`This requisition is ${req.status}, not DRAFT, so it can no longer be edited. Tell the user.`);
        }

        const changes = fieldChanges(req, args, ['description', 'department', 'type']);
        if (!changes.length) invalid('No changes were specified.');

        return propose(`Update requisition "${req.description}"`, changes);
    },
    execute: async (ctx, args) => {
        const patch: Record<string, any> = { updated_at: new Date().toISOString() };
        for (const f of ['description', 'department', 'type']) {
            if (args[f] !== undefined) patch[f] = args[f];
        }

        const { data, error } = await supabase
            .from('requisitions')
            .update(patch)
            .eq('id', args.requisitionId)
            .eq('organization_id', ctx.organizationId)
            .eq('status', 'DRAFT') // re-checked at write time: status may have moved since approval
            .select('id, description, department, type, status')
            .maybeSingle();

        if (error) throw new Error(error.message);
        if (!data) throw new Error('Requisition was not updated — it may have left DRAFT since you approved this.');
        return { updated: true, requisition: data };
    },
};

function fieldChanges(current: any, args: any, fields: string[]) {
    const out: Array<{ label: string; value: string }> = [];
    for (const f of fields) {
        if (args[f] === undefined) continue;
        const before = current[f] ?? '(empty)';
        if (String(before) === String(args[f])) continue;
        out.push({ label: f.replace(/_/g, ' '), value: `${before} → ${args[f]}` });
    }
    return out;
}

// ─── Scheduled items ─────────────────────────────────────────────────────────

const createScheduledItem: ToolDefinition = {
    name: 'create_scheduled_item',
    description:
        'Add a recurring commitment to the expense schedule (a bill, subscription, loan ' +
        'repayment or investment). You need a title, an amount, a category, how often it ' +
        'recurs and when it is next due — ask for whatever is missing.',
    effect: 'write',
    allowedRoles: ['ADMIN', 'AUTHORISER', 'ACCOUNTANT'],
    parameters: {
        type: 'object',
        properties: {
            title: { type: 'string', description: 'What the payment is, e.g. "ZESCO electricity".' },
            amount: { type: 'number', description: 'Amount per occurrence, in ZMW.' },
            category: { type: 'string', enum: CATEGORIES },
            cadence: { type: 'string', enum: CADENCES, description: 'How often it recurs.' },
            nextDueDate: { type: 'string', description: 'ISO date of the next occurrence, e.g. 2026-09-01.' },
            description: { type: 'string', description: 'Optional note.' },
        },
        required: ['title', 'amount', 'category', 'cadence', 'nextDueDate'],
    },
    handler: async (ctx, args) => {
        if (!args.title?.trim()) invalid('A title is required.');
        const amount = Number(args.amount);
        if (!Number.isFinite(amount) || amount <= 0) invalid('Amount must be a number greater than zero.');
        if (!CATEGORIES.includes(args.category)) invalid(`Category must be one of: ${CATEGORIES.join(', ')}.`);
        if (!CADENCES.includes(args.cadence)) invalid(`Cadence must be one of: ${CADENCES.join(', ')}.`);
        if (!ISO_DATE.test(args.nextDueDate ?? '')) invalid('nextDueDate must be an ISO date like 2026-09-01.');
        if (args.nextDueDate < ctx.today) {
            invalid(`nextDueDate ${args.nextDueDate} is in the past (today is ${ctx.today}). Confirm the intended date with the user.`);
        }

        return propose(
            `Add "${args.title}" to the expense schedule`,
            [
                { label: 'Title', value: args.title },
                { label: 'Amount', value: `${kwacha(amount)} per occurrence` },
                { label: 'Category', value: args.category.replace(/_/g, ' ').toLowerCase() },
                { label: 'Recurs', value: args.cadence.toLowerCase() },
                { label: 'Next due', value: args.nextDueDate },
                ...(args.description ? [{ label: 'Note', value: args.description }] : []),
            ]
        );
    },
    execute: async (ctx, args) => {
        const { data, error } = await supabase
            .from('scheduled_items')
            .insert({
                organization_id: ctx.organizationId,
                created_by: ctx.userId,
                title: args.title.trim(),
                amount: Number(args.amount),
                category: args.category,
                cadence: args.cadence,
                next_due_date: args.nextDueDate,
                due_day: Number(args.nextDueDate.slice(8, 10)),
                description: args.description || null,
                status: 'ACTIVE',
            })
            .select('id, title, amount, category, cadence, next_due_date')
            .single();

        if (error) throw new Error(`Could not add scheduled item: ${error.message}`);
        return { created: true, item: data, link: '/schedules' };
    },
};

const updateScheduledItem: ToolDefinition = {
    name: 'update_scheduled_item',
    description:
        'Change the amount, cadence, next due date or category of an existing scheduled item, ' +
        'or archive it. Find the id with list_scheduled_items first.',
    effect: 'write',
    allowedRoles: ['ADMIN', 'AUTHORISER', 'ACCOUNTANT'],
    parameters: {
        type: 'object',
        properties: {
            scheduledItemId: { type: 'string', description: 'UUID from list_scheduled_items.' },
            title: { type: 'string' },
            amount: { type: 'number' },
            category: { type: 'string', enum: CATEGORIES },
            cadence: { type: 'string', enum: CADENCES },
            nextDueDate: { type: 'string', description: 'ISO date.' },
            status: { type: 'string', enum: ['ACTIVE', 'ARCHIVED'], description: 'Set ARCHIVED to stop it recurring.' },
        },
        required: ['scheduledItemId'],
    },
    handler: async (ctx, args) => {
        const { data: item } = await supabase
            .from('scheduled_items')
            .select('id, title, amount, category, cadence, next_due_date, status')
            .eq('id', args.scheduledItemId)
            .eq('organization_id', ctx.organizationId)
            .maybeSingle();

        if (!item) invalid('No scheduled item with that id exists in this organisation.');
        if (args.amount !== undefined && (!Number.isFinite(Number(args.amount)) || Number(args.amount) <= 0)) {
            invalid('Amount must be greater than zero.');
        }
        if (args.nextDueDate !== undefined && !ISO_DATE.test(args.nextDueDate)) {
            invalid('nextDueDate must be an ISO date like 2026-09-01.');
        }

        const changes: Array<{ label: string; value: string }> = [];
        if (args.title !== undefined && args.title !== item.title) changes.push({ label: 'Title', value: `${item.title} → ${args.title}` });
        if (args.amount !== undefined && Number(args.amount) !== Number(item.amount)) {
            changes.push({ label: 'Amount', value: `${kwacha(Number(item.amount))} → ${kwacha(Number(args.amount))}` });
        }
        if (args.category !== undefined && args.category !== item.category) changes.push({ label: 'Category', value: `${item.category} → ${args.category}` });
        if (args.cadence !== undefined && args.cadence !== item.cadence) changes.push({ label: 'Cadence', value: `${item.cadence} → ${args.cadence}` });
        if (args.nextDueDate !== undefined && args.nextDueDate !== item.next_due_date) {
            changes.push({ label: 'Next due', value: `${item.next_due_date} → ${args.nextDueDate}` });
        }
        if (args.status !== undefined && args.status !== item.status) changes.push({ label: 'Status', value: `${item.status} → ${args.status}` });

        if (!changes.length) invalid('Nothing would change — the values given already match the item.');

        return propose(
            args.status === 'ARCHIVED' ? `Archive "${item.title}"` : `Update scheduled item "${item.title}"`,
            changes,
            args.status === 'ARCHIVED' ? 'Archiving stops this item from recurring. Past runs are kept.' : undefined
        );
    },
    execute: async (ctx, args) => {
        const patch: Record<string, any> = { updated_at: new Date().toISOString() };
        if (args.title !== undefined) patch.title = args.title;
        if (args.amount !== undefined) patch.amount = Number(args.amount);
        if (args.category !== undefined) patch.category = args.category;
        if (args.cadence !== undefined) patch.cadence = args.cadence;
        if (args.nextDueDate !== undefined) {
            patch.next_due_date = args.nextDueDate;
            patch.due_day = Number(args.nextDueDate.slice(8, 10));
        }
        if (args.status !== undefined) patch.status = args.status;

        const { data, error } = await supabase
            .from('scheduled_items')
            .update(patch)
            .eq('id', args.scheduledItemId)
            .eq('organization_id', ctx.organizationId)
            .select('id, title, amount, category, cadence, next_due_date, status')
            .maybeSingle();

        if (error) throw new Error(error.message);
        if (!data) throw new Error('Scheduled item was not updated — it may have been deleted.');
        return { updated: true, item: data };
    },
};

// ─── Ledger ──────────────────────────────────────────────────────────────────

/**
 * Mirrors the "account it" flow the Cashbook UI uses (narrateEntry /
 * updateEntryAccount in cashbook.controller.ts): setting account_id also
 * moves status to COMPLETED, and the GL is re-posted so the entry leaves
 * Suspense immediately rather than on the next sync.
 */
const categorizeTransaction: ToolDefinition = {
    name: 'categorize_transaction',
    description:
        'Assign a chart-of-accounts account to a cashbook entry that has none yet — the same ' +
        'action as "accounting for" a transaction in the Cashbook UI. Find the entry id and ' +
        'candidate accounts with search_transactions (unaccountedOnly: true) and list_accounts ' +
        'first. This does not move money; it only classifies an entry that already exists. Only ' +
        'works for entries with no requisition attached — a requisition-driven entry is ' +
        'classified through its line items instead, and this tool will say so rather than write ' +
        'somewhere the ledger does not look.',
    effect: 'write',
    allowedRoles: ['ADMIN', 'AUTHORISER', 'ACCOUNTANT'],
    parameters: {
        type: 'object',
        properties: {
            entryId: { type: 'string', description: 'Cashbook entry UUID, from search_transactions.' },
            accountCode: { type: 'string', description: 'Account code from list_accounts, e.g. "5010".' },
        },
        required: ['entryId', 'accountCode'],
    },
    handler: async (ctx, args) => {
        const { data: entry } = await supabase
            .from('cashbook_entries')
            .select('id, date, description, debit, credit, account_id, status, requisition_id')
            .eq('id', args.entryId)
            .eq('organization_id', ctx.organizationId)
            .maybeSingle();
        if (!entry) invalid('No cashbook entry with that id exists in this organisation.');
        // The ledger resolves a requisition-linked entry's classification
        // from its line items, not from cashbook_entries.account_id — see
        // ledger.service.ts's repostForCashbookEntry, which checks
        // requisition_id *before* account_id and never falls through to it
        // when one is present. Writing here would silently do nothing to the
        // actual GL posting while telling the user it worked.
        if (entry.requisition_id) {
            invalid(
                `This entry belongs to requisition ${entry.requisition_id} and is classified through that ` +
                `requisition's line items, not directly. Call get_requisition_details with that id to see its ` +
                `line items, then use categorize_requisition_expense on the ones with accounted: false.`
            );
        }

        const { data: account } = await supabase
            .from('accounts')
            .select('id, code, name')
            .eq('organization_id', ctx.organizationId)
            .eq('code', args.accountCode)
            .maybeSingle();
        if (!account) invalid(`No active account with code "${args.accountCode}". Check list_accounts.`);

        const amount = Math.max(Number(entry.debit ?? 0), Number(entry.credit ?? 0));

        return propose(
            `Classify "${entry.description}" against ${account.name}`,
            [
                { label: 'Date', value: entry.date },
                { label: 'Amount', value: kwacha(amount) },
                { label: 'Account', value: `${account.code} — ${account.name}` },
                { label: 'Status after', value: 'COMPLETED' },
            ]
        );
    },
    execute: async (ctx, args) => {
        // Re-checked at commit time, same as the accountability block on
        // create_requisition: nothing prevents the entry from having gained
        // a requisition link between proposal and approval, and this write
        // would be silently ineffective on one either way.
        const { data: entry } = await supabase
            .from('cashbook_entries')
            .select('requisition_id')
            .eq('id', args.entryId)
            .eq('organization_id', ctx.organizationId)
            .maybeSingle();
        if (!entry) throw new Error('Entry no longer exists.');
        if (entry.requisition_id) {
            throw new Error('This entry is linked to a requisition and must be reclassified through its line items, not directly.');
        }

        const { data: account } = await supabase
            .from('accounts')
            .select('id, code, name')
            .eq('organization_id', ctx.organizationId)
            .eq('code', args.accountCode)
            .maybeSingle();
        if (!account) throw new Error(`Account "${args.accountCode}" no longer exists.`);

        const { data, error } = await supabase
            .from('cashbook_entries')
            .update({ account_id: account.id, status: 'COMPLETED' })
            .eq('id', args.entryId)
            .eq('organization_id', ctx.organizationId)
            .select('id, description, account_id, status')
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Entry was not updated — it may have been deleted.');

        // Fire-and-forget, matching the UI's own behaviour: categorization is
        // saved immediately, GL posting follows without blocking the response.
        ledgerService
            .repostForCashbookEntry(args.entryId)
            .catch(err => console.error(`[Agent] repost after categorization failed for ${args.entryId}:`, err?.message));

        return { updated: true, entry: data, account: { code: account.code, name: account.name } };
    },
};

/**
 * The requisition-linked counterpart to categorize_transaction. Mirrors the
 * Requisitions UI's single-item inline correction (requisition.controller.ts's
 * updateLineItemAccount) — with one deliberate improvement: that endpoint
 * updates line_items.account_id but never re-posts the GL, unlike its own
 * bulk-classify sibling a few functions over, which does. A line item
 * classified through this tool and left un-reposted would look accounted for
 * here while still showing Suspense in the ledger — so execute() always
 * reposts, matching what the bulk path already does correctly.
 */
const categorizeRequisitionExpense: ToolDefinition = {
    name: 'categorize_requisition_expense',
    description:
        'Assign a chart-of-accounts account to one line item of a requisition-linked expense. ' +
        'This is what categorize_transaction hands off to when an entry belongs to a ' +
        'requisition. Get the line item id and its accounted status from get_requisition_details ' +
        '— an item with accounted: false is what this classifies.',
    effect: 'write',
    allowedRoles: ['ADMIN', 'AUTHORISER', 'ACCOUNTANT'],
    parameters: {
        type: 'object',
        properties: {
            lineItemId: { type: 'string', description: 'Line item UUID, from get_requisition_details.' },
            accountCode: { type: 'string', description: 'Account code from list_accounts, e.g. "5010".' },
        },
        required: ['lineItemId', 'accountCode'],
    },
    handler: async (ctx, args) => {
        const { data: item } = await supabase
            .from('line_items')
            .select('id, description, actual_amount, estimated_amount, account_id, requisition_id, requisitions!inner(organization_id, reference_number)')
            .eq('id', args.lineItemId)
            .eq('requisitions.organization_id', ctx.organizationId)
            .maybeSingle();
        if (!item) invalid('No line item with that id exists in this organisation.');

        const { data: account } = await supabase
            .from('accounts')
            .select('id, code, name')
            .eq('organization_id', ctx.organizationId)
            .eq('code', args.accountCode)
            .maybeSingle();
        if (!account) invalid(`No active account with code "${args.accountCode}". Check list_accounts.`);

        const amount = Number(item.actual_amount ?? item.estimated_amount ?? 0);
        const reqRef = (item.requisitions as any)?.reference_number ?? item.requisition_id.slice(0, 8);

        return propose(
            `Classify "${item.description}" (requisition ${reqRef}) against ${account.name}`,
            [
                { label: 'Line item', value: item.description },
                { label: 'Requisition', value: reqRef },
                { label: 'Amount', value: kwacha(amount) },
                { label: 'Account', value: `${account.code} — ${account.name}` },
            ]
        );
    },
    execute: async (ctx, args) => {
        const { data: item } = await supabase
            .from('line_items')
            .select('id, description, requisition_id, requisitions!inner(organization_id)')
            .eq('id', args.lineItemId)
            .eq('requisitions.organization_id', ctx.organizationId)
            .maybeSingle();
        if (!item) throw new Error('Line item no longer exists.');

        const { data: account } = await supabase
            .from('accounts')
            .select('id, code, name, qb_account_id')
            .eq('organization_id', ctx.organizationId)
            .eq('code', args.accountCode)
            .maybeSingle();
        if (!account) throw new Error(`Account "${args.accountCode}" no longer exists.`);

        const { data, error } = await supabase
            .from('line_items')
            .update({ account_id: account.id, qb_account_id: account.qb_account_id || null })
            .eq('id', args.lineItemId)
            .select('id, description, account_id')
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Line item was not updated — it may have been deleted.');

        // Re-post the GL so this moves out of Suspense immediately, same as
        // the bulk-classify path — see the tool's header comment for why the
        // single-item UI endpoint this mirrors does NOT do this on its own.
        ledgerService
            .repostForRequisition(item.requisition_id)
            .catch(err => console.error(`[Agent] repost after line-item categorization failed for req ${item.requisition_id}:`, err?.message));

        // Same authoritative-correction signal the UI's inline edit sends —
        // an agent-driven classification is just as good a training example.
        if (item.description) {
            memoryService
                .learn({
                    organizationId: ctx.organizationId,
                    description: item.description,
                    accountId: account.id,
                    authoritative: true,
                    source: 'agent_correction',
                })
                .catch(err => console.error('[Agent] memory learn after categorization failed:', err?.message));
        }

        return { updated: true, lineItem: data, account: { code: account.code, name: account.name } };
    },
};

// ─── Settings ────────────────────────────────────────────────────────────────

const ORG_FIELDS = ['name', 'email', 'phone', 'address', 'website', 'tax_id'] as const;

const updateOrgSettings: ToolDefinition = {
    name: 'update_org_settings',
    description:
        'Update organisation profile settings: name, email, phone, address, website or tax id. ' +
        'Admin only. Payment credentials and integration keys cannot be changed here.',
    effect: 'write',
    allowedRoles: ['ADMIN'],
    parameters: {
        type: 'object',
        properties: {
            name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            address: { type: 'string' },
            website: { type: 'string' },
            tax_id: { type: 'string', description: 'ZRA TPIN or equivalent.' },
        },
    },
    handler: async (ctx, args) => {
        const { data: org } = await supabase
            .from('organizations')
            .select('name, email, phone, address, website, tax_id')
            .eq('id', ctx.organizationId)
            .maybeSingle();
        if (!org) invalid('Organisation not found.');

        const changes = fieldChanges(org, args, [...ORG_FIELDS]);
        if (!changes.length) invalid('No settings changes were specified.');

        return propose(
            'Update organisation settings',
            changes,
            changes.some(c => c.label === 'name')
                ? 'The organisation name appears on invoices, receipts and payment pages.'
                : undefined
        );
    },
    execute: async (ctx, args) => {
        const patch: Record<string, any> = { updated_at: new Date().toISOString() };
        for (const f of ORG_FIELDS) if (args[f] !== undefined) patch[f] = args[f];

        const { data, error } = await supabase
            .from('organizations')
            .update(patch)
            .eq('id', ctx.organizationId)
            .select('name, email, phone, address, website, tax_id')
            .maybeSingle();

        if (error) throw new Error(error.message);
        return { updated: true, organization: data };
    },
};

export const writeTools: ToolDefinition[] = [
    createRequisition,
    updateRequisition,
    createScheduledItem,
    updateScheduledItem,
    categorizeTransaction,
    categorizeRequisitionExpense,
    updateOrgSettings,
];

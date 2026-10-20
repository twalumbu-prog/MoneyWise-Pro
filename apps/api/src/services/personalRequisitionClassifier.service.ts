/**
 * personalRequisitionClassifier.service.ts — live categorisation of money SENT from a personal account.
 *
 * A business has an accountant who reviews and approves each categorisation. A personal account is one
 * person with no accountant, so nothing waits for approval: the moment a payment goes through, the AI
 * categorises it (creating a new account when nothing in the chart fits), the general ledger is posted
 * to that account, and the transaction is in the reports straight away. It only changes if the person
 * edits it — and that edit re-posts the ledger the same way (see updateLineItemAccount).
 */
import { getPreferences } from './userPreferences.service';
import { runWithCategorizationModel } from './ai/aiPrefs.context';
import { supabase } from '../lib/supabase';
import { isPersonalOrganization } from '../lib/orgType';
import { ledgerService } from './ledger.service';
import { cashbookService } from './cashbook.service';
import { RequisitionMessageService } from './requisition_message.service';
import { memoryService } from './ai/memory.service';
import { decisionRouter } from './ai/decision.router';
import { createAccountForTransaction } from './accountSuggester.service';

const MIN_CONFIDENCE = 0.5;
const SKIP_TYPES = new Set(['PAYROLL', 'LOAN', 'ADVANCE', 'INVEST', 'INVESTMENT']);
// Statuses in which the money has really left and the requisition can be closed.
const FINALIZABLE = ['RECEIVED', 'EXPENSED', 'CATEGORIZING'];
const inFlight = new Set<string>();

const isFeeLine = (d: string) => /\b(fee|fees|charge|charges|withdrawal)\b/i.test(d) && /(fee|charge)/i.test(d);

export interface AutoCategorizeResult { done: boolean; reason?: string; created?: number }

export async function autoCategorizePersonalRequisition(requisitionId: string, organizationId: string, userId?: string | null): Promise<AutoCategorizeResult> {
    if (inFlight.has(requisitionId)) return { done: false, reason: 'already running' };
    inFlight.add(requisitionId);
    try {
        const { data: req } = await supabase
            .from('requisitions')
            .select('id, organization_id, requestor_id, type, status, description, estimated_total, actual_total')
            .eq('id', requisitionId).maybeSingle();
        if (!req || req.organization_id !== organizationId) return { done: false, reason: 'not found' };
        if (SKIP_TYPES.has(String(req.type || '').toUpperCase())) return { done: false, reason: 'type skipped' };
        if (!(await isPersonalOrganization(organizationId))) return { done: false, reason: 'not personal' };
        // Money must have been paid out (or be on its way): nothing to account for before that.
        if (!['DISBURSED', 'PROCESSING', ...FINALIZABLE, 'COMPLETED', 'ACCOUNTED', 'CATEGORIZED'].includes(String(req.status))) {
            return { done: false, reason: `status ${req.status}` };
        }

        const { data: items } = await supabase.from('line_items').select('*').eq('requisition_id', requisitionId);
        const lineItems = (items || []) as any[];
        if (lineItems.length === 0) return { done: false, reason: 'no line items' };
        const needs = lineItems.filter(li => !li.account_id);
        const alreadyDone = needs.length === 0 && ['COMPLETED', 'ACCOUNTED', 'CATEGORIZED'].includes(String(req.status));
        if (alreadyDone) return { done: false, reason: 'already categorised' };

        const userForMsg = userId || req.requestor_id;
        const { data: expenseAccounts } = await supabase
            .from('accounts').select('*')
            .eq('organization_id', organizationId).eq('is_active', true).eq('type', 'EXPENSE');
        const candidates = ((expenseAccounts || []) as any[]).filter(a => !/^(SYS|SAV|INV)-?/i.test(String(a.code || '')));

        let created = 0;
        const meta: any[] = [];
        for (const li of lineItems) {
            const amount = Number(li.actual_amount ?? li.estimated_amount ?? 0);
            const description = String(li.description || req.description || 'Expense');

            if (li.account_id) {
                const acc = ((expenseAccounts || []) as any[]).find(a => a.id === li.account_id)
                    || (await supabase.from('accounts').select('*').eq('id', li.account_id).maybeSingle()).data;
                meta.push({
                    id: li.id, description, amount, account_id: li.account_id,
                    category_code: acc?.code ?? null, category_name: acc?.name ?? null,
                    reasoning: li.ai_reasoning || 'Categorised for you.', confidence: li.ai_confidence ?? 1, method: li.ai_decision_path || 'EARLY_CLASSIFICATION',
                });
                continue;
            }

            let accountId: string | null = null;
            let account: any = null;
            let reasoning = '';
            let confidence = 0;
            let method = 'AUTO';
            let createdNew = false;

            if (isFeeLine(description)) {
                const feeAcct = await cashbookService.getOrCreateTransactionChargesAccount(organizationId).catch(() => null);
                if (feeAcct) {
                    accountId = feeAcct;
                    account = (await supabase.from('accounts').select('*').eq('id', feeAcct).maybeSingle()).data;
                    reasoning = 'Payment charges go to Transaction Charges.'; confidence = 1; method = 'DETERMINISTIC_RULES';
                }
            }

            if (!accountId && candidates.length > 0) {
                const decision = await decisionRouter.classify(candidates, { description, amount, receipt_data: li.receipt_ocr_data }, organizationId).catch(() => null);
                const match = decision?.account_code
                    ? candidates.find(a => String(a.code).toLowerCase() === String(decision.account_code).toLowerCase())
                    : null;
                if (decision && match && decision.confidence >= MIN_CONFIDENCE) {
                    accountId = match.id; account = match; reasoning = decision.reasoning; confidence = decision.confidence; method = decision.decision_path || 'AI';
                }
            }

            if (!accountId) {
                // Nothing in the chart fits: have the AI reason about it and add the right account.
                const made = await createAccountForTransaction(organizationId, { description, amount, type: 'EXPENSE' });
                if (made) {
                    accountId = made.id; account = { code: made.code, name: made.name };
                    reasoning = made.created ? `New category created: ${made.reasoning}` : made.reasoning;
                    confidence = 0.8; method = made.created ? 'AI_NEW_ACCOUNT' : 'AI';
                    createdNew = made.created;
                    if (made.created) created++;
                }
            }

            if (accountId) {
                await supabase.from('line_items').update({
                    account_id: accountId,
                    qb_account_id: account?.qb_account_id || null,
                    qb_account_name: account?.name || null,
                    actual_amount: li.actual_amount ?? li.estimated_amount ?? null,
                    ai_reasoning: reasoning, ai_confidence: confidence, ai_similarity_score: confidence, ai_decision_path: method,
                }).eq('id', li.id);
            }
            meta.push({
                id: li.id, description, amount, account_id: accountId,
                category_code: account?.code ?? null, category_name: account?.name ?? null,
                reasoning, confidence, method, created_account: createdNew,
            });
        }

        // The ledger reads each line item's account: re-post so the payment leaves Suspense and shows in reports.
        await ledgerService.repostForRequisition(requisitionId).catch((e: any) =>
            console.error(`[PersonalClassifier] repost failed for ${requisitionId}:`, e?.message));
        memoryService.learnFromRequisition(requisitionId, { authoritative: false }).catch(() => undefined);

        // Close it out when the money has really left (a still-processing transfer keeps its status).
        const now = new Date().toISOString();
        const totals = lineItems.reduce((s, li) => s + Number(li.actual_amount ?? li.estimated_amount ?? 0), 0);
        const patch: any = { updated_at: now };
        let finalize = FINALIZABLE.includes(String(req.status));
        if (!finalize && req.status === 'DISBURSED') {
            // Cash has no transfer to wait for; a digital payout still DISBURSED is waiting on Lenco.
            const { data: d } = await supabase.from('disbursements').select('payment_method').eq('requisition_id', requisitionId).maybeSingle();
            finalize = !!d && ['CASH', 'CASH_PICKUP', 'OTHER'].includes(String((d as any).payment_method));
        }
        if (finalize) { patch.status = 'COMPLETED'; patch.is_auto_categorized = true; patch.auto_categorized_at = now; }
        if (!req.actual_total) patch.actual_total = totals;
        await supabase.from('requisitions').update(patch).eq('id', requisitionId);

        // One AI_REVIEW card, already applied: the person can tap a row to change it.
        const unresolved = meta.some(m => !m.account_id);
        const content = unresolved
            ? 'Some items couldn’t be categorised automatically — tap them to choose a category.'
            : created > 0
                ? 'Categorised and added to your reports. A new category was created for this payment — tap it to change.'
                : 'Categorised and added to your reports. Tap a category to change it.';
        const { data: existingMsg } = await supabase.from('requisition_messages').select('id')
            .eq('requisition_id', requisitionId).contains('metadata', { stage: 'AI_REVIEW' }).order('created_at', { ascending: false }).limit(1).maybeSingle();
        const metadata = { stage: 'AI_REVIEW', isThinking: false, autoApplied: true, items: meta };
        if (existingMsg?.id) await RequisitionMessageService.updateMessage(existingMsg.id, { content, metadata });
        else await RequisitionMessageService.createMessage({ requisitionId, userId: userForMsg, content, type: 'SYSTEM', metadata });

        // A personal payment has no receipts/change step: drop the prompt so it can't re-open the flow.
        if (finalize) {
            await supabase.from('requisition_messages').delete().eq('requisition_id', requisitionId).contains('metadata', { stage: 'EXPENSE_TRACKING' });
        }
        console.log(`[PersonalClassifier] ${requisitionId}: ${meta.length} item(s) categorised, ${created} new account(s).`);
        return { done: true, created };
    } catch (e: any) {
        console.error(`[PersonalClassifier] failed for ${requisitionId}:`, e?.message);
        return { done: false, reason: e?.message };
    } finally {
        inFlight.delete(requisitionId);
    }
}

/** Call from anywhere money-out is confirmed: no-ops unless the organization is personal. */
export async function maybeAutoCategorizePersonal(requisitionId: string, organizationId: string, userId?: string | null): Promise<AutoCategorizeResult> {
    // The owner's own model choice (Settings → Preferences → AI) applies to categorising their transactions.
    let model: string | null = null;
    try {
        const { data: r } = await supabase.from('requisitions').select('requestor_id').eq('id', requisitionId).maybeSingle();
        if (r?.requestor_id) model = (await getPreferences(r.requestor_id)).ai.categorization_model;
    } catch { /* default model */ }
    return runWithCategorizationModel(model, () => autoCategorizePersonalRequisition(requisitionId, organizationId, userId)).catch(() => ({ done: false }));
}

/** Same, when only the requisition id is at hand (background pollers). */
export async function maybeAutoCategorizePersonalById(requisitionId: string): Promise<AutoCategorizeResult> {
    const { data } = await supabase.from('requisitions').select('organization_id, requestor_id').eq('id', requisitionId).maybeSingle();
    if (!data?.organization_id) return { done: false };
    return maybeAutoCategorizePersonal(requisitionId, data.organization_id, data.requestor_id);
}

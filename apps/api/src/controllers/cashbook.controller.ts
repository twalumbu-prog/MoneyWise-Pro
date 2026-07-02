import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { cashbookService } from '../services/cashbook.service';
import { decisionRouter } from '../services/ai/decision.router';
import { supabase } from '../lib/supabase';
import { QuickBooksService } from '../services/quickbooks.service';
import { ledgerService } from '../services/ledger.service';
import { calculatePlatformFee } from '../utils/platformFee';

/**
 * Get all cashbook entries with optional filters
 */
/**
 * Helper to sanitize cashbook entries by removing the reference suffix from the description.
 * This ensures raw references used for backend deduplication are hidden from the UI.
 */
const sanitizeEntry = (entry: any) => {
    if (!entry) return entry;
    if (entry.description) {
        entry.description = entry.description.split(' | Ref:')[0];
    }
    if (entry.requisitions && entry.requisitions.description) {
        entry.requisitions.description = entry.requisitions.description.split(' | Ref:')[0];
    }
    return entry;
};

/**
 * Get all cashbook entries with optional filters
 */
export const getCashbookEntries = async (req: any, res: any): Promise<any> => {
    // ... existing entries logic ... (simplified for brevity, assume unchanged or just import updated)
    try {
        const { startDate, endDate, entryType, accountType, walletId, limit } = req.query;
        const organizationId = (req as any).user.organization_id;

        if (!organizationId) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        const entries = await cashbookService.getEntries(organizationId, {
            startDate: startDate as string,
            endDate: endDate as string,
            entryType: entryType as string,
            accountType: accountType as string,
            walletId: walletId as string,
            limit: limit ? parseInt(limit as string) : undefined
        });

        const sanitizedEntries = entries.map(sanitizeEntry);
        res.json(sanitizedEntries);
    } catch (error: any) {
        console.error('Error fetching cashbook entries:', error);
        res.status(500).json({ error: 'Failed to fetch cashbook entries', details: error.message });
    }
};

/**
 * Get current cash balance
 */
export const getCashBalance = async (req: any, res: any): Promise<any> => {
    try {
        const { accountType, walletId, organizationId } = req.query;
        const userOrgId = (req as any).user.organization_id;
        const userRole = (req as any).user.role;

        // Use requested org if provided and user is authorized (Admin/Accountant), else fallback to user's org
        let targetOrgId = userOrgId;
        if (organizationId && (userRole === 'ADMIN' || userRole === 'ACCOUNTANT' || userRole === 'CASHIER')) {
            targetOrgId = organizationId;
        }

        if (!targetOrgId) {
            return res.status(400).json({ error: 'Organization context missing' });
        }

        const balance = await cashbookService.getCurrentBalance(targetOrgId, accountType as string, walletId as string);
        res.json({ balance });
    } catch (error: any) {
        console.error('Error fetching cash balance:', error);
        res.status(500).json({ error: 'Failed to fetch cash balance', details: error.message });
    }
};

/**
 * Get cashbook summary for a date range
 */
export const getCashbookSummary = async (req: any, res: any): Promise<any> => {
    try {
        const { startDate, endDate, accountType, walletId } = req.query;
        const organizationId = (req as any).user.organization_id;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required' });
        }

        if (!organizationId) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        const summary = await cashbookService.getSummary(
            organizationId,
            startDate as string,
            endDate as string,
            accountType as string,
            walletId as string
        );

        res.json(summary);
    } catch (error: any) {
        console.error('Error fetching cashbook summary:', error);
        res.status(500).json({ error: 'Failed to fetch cashbook summary', details: error.message });
    }
};

/**
 * Reconcile cash (compare system balance vs physical count)
 */
export const reconcileCash = async (req: any, res: any): Promise<any> => {
    try {
        const { physicalCount, denominations, notes, accountType } = req.body;
        const userId = (req as any).user.id;
        const organizationId = (req as any).user.organization_id;

        if (typeof physicalCount !== 'number' || physicalCount < 0) {
            return res.status(400).json({ error: 'Valid physicalCount is required' });
        }

        if (!organizationId) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        const systemBalance = await cashbookService.getCurrentBalance(organizationId, accountType);
        const variance = physicalCount - systemBalance;

        // If there's a variance, create an adjustment entry
        if (Math.abs(variance) > 0.01) { // Allow for floating point rounding
            await cashbookService.createEntry(organizationId, {
                entry_type: 'ADJUSTMENT',
                description: `Cash reconciliation adjustment (${variance > 0 ? 'Over' : 'Short'}: K${Math.abs(variance).toFixed(2)})${notes ? ' - ' + notes : ''}`,
                debit: variance > 0 ? variance : 0,
                credit: variance < 0 ? Math.abs(variance) : 0,
                date: new Date().toISOString().split('T')[0],
                created_by: userId,
                account_type: accountType || 'CASH'
            });
        }

        res.json({
            systemBalance,
            physicalCount,
            variance,
            isBalanced: Math.abs(variance) < 0.01,
            denominations,
            notes
        });
    } catch (error: any) {
        console.error('Error reconciling cash:', error);
        res.status(500).json({ error: 'Failed to reconcile cash', details: error.message });
    }
};

/**
 * Log cash return (excess)
 */
export const returnExcessCash = async (req: any, res: any): Promise<any> => {
    try {
        const { requisitionId, amount, description } = req.body;
        const userId = (req as any).user.id;
        const organizationId = (req as any).user.organization_id;

        if (!requisitionId || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ error: 'Valid requisitionId and amount are required' });
        }

        if (!organizationId) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        // We no longer call cashbookService.logReturn to avoid duplicate entries.
        // Instead, we let the finalization logic handle the netting.
        // We just ensure the disbursement record is updated with the returned amount.
        const { error: updateError } = await supabase
            .from('disbursements')
            .update({
                actual_change_amount: amount,
                change_submission_method: 'CASH'
            })
            .eq('requisition_id', requisitionId);

        if (updateError) throw updateError;

        res.json({ message: 'Cash return recorded for netting.' });
    } catch (error: any) {
        console.error('Error logging cash return:', error);
        res.status(500).json({ error: 'Failed to log cash return', details: error.message });
    }
};

/**
 * Log cash inflow
 */
export const logCashInflow = async (req: any, res: any): Promise<any> => {
    try {
        const { personName, purpose, contactDetails, date, amount, denominations, accountType } = req.body;
        const userId = (req as any).user.id;
        const organizationId = (req as any).user.organization_id;

        if (!personName || !purpose || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ error: 'personName, purpose, and a valid amount are required' });
        }

        if (!organizationId) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        const entry = await cashbookService.logInflow(
            organizationId,
            { personName, purpose, contactDetails, date, amount, denominations, accountType },
            userId
        );

        res.json(sanitizeEntry(entry));
    } catch (error: any) {
        console.error('Error logging cash inflow:', error);
        res.status(500).json({ error: 'Failed to log cash inflow', details: error.message });
    }
};

/**
 * Record a manual (non-Lenco) product sale paid by cash / mobile money / bank.
 *
 * Unlike the Lenco POS path (which logs a PENDING intent and finalizes on webhook),
 * the money is already collected, so we post the revenue straight to the ledger:
 *  1. Insert the sale lines into product_sales (COMPLETED).
 *  2. Group the (possibly edited / partial) amount by each product's income account.
 *  3. Create one `Sale:`-prefixed INFLOW per income group against the chosen external
 *     account_type (CASH / AIRTEL_MONEY / BANK). createEntry auto-generates a REC-
 *     receipt number, recalculates the external-ledger balance, and posts the balanced
 *     GL journal (Dr asset / Cr income) — so the sale lands in Reports (revenue + net
 *     worth) and in the Inflows inbox automatically.
 */
export const recordManualSale = async (req: any, res: any): Promise<any> => {
    try {
        const { items, amount, paymentDate, accountType, methodLabel, customerName, customerPhone } = req.body;
        const userId = (req as any).user.id;
        const organizationId = (req as any).user.organization_id;

        if (!organizationId) {
            return res.status(400).json({ error: 'User organization context missing' });
        }
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'At least one sale item is required' });
        }

        const totalAmount = Number(amount);
        if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
            return res.status(400).json({ error: 'A valid payment amount is required' });
        }

        const VALID_TYPES = ['CASH', 'AIRTEL_MONEY', 'BANK'];
        const acctType = VALID_TYPES.includes(accountType) ? accountType : 'CASH';
        const saleDate = paymentDate || new Date().toISOString().split('T')[0];
        const reference = `MSALE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        // Normalise + validate cart lines. Booking (accommodation) lines carry a stay.
        const lines = items
            .map((it: any) => ({
                id: it.id,
                qty: Math.max(0, Number(it.quantity) || 0),
                unit: Math.max(0, Number(it.price) || 0),
                check_in: it.check_in || null,
                check_out: it.check_out || null
            }))
            .filter((l: any) => l.id && l.qty > 0)
            .map((l: any) => ({ ...l, lineTotal: l.qty * l.unit }));

        if (lines.length === 0) {
            return res.status(400).json({ error: 'No valid sale lines provided' });
        }

        // Resolve each product's income account + display name.
        const productIds = [...new Set(lines.map((l: any) => l.id))];
        const { data: products } = await supabase
            .from('products')
            .select('id, name, income_account_id')
            .eq('organization_id', organizationId)
            .in('id', productIds);
        const productMap = new Map((products || []).map((p: any) => [p.id, p]));

        // Booking pre-validation: a manual sale means the money is already collected, so
        // the stay is reserved immediately (CONFIRMED). Validate the dates and reject up
        // front if they overlap an existing confirmed stay — so a clash never records an
        // orphan sale or lets the same room be double-booked (e.g. via the public link).
        // Unlike the public portal, a past check-in is allowed here: a cashier may be
        // entering a walk-in/cash sale retrospectively (e.g. logging today's bookings
        // at close of day). The only hard rule is no double-booking an existing stay.
        const nightsOf = (ci: string, co: string) =>
            Math.round((Date.parse(`${co}T00:00:00Z`) - Date.parse(`${ci}T00:00:00Z`)) / 86400000);
        const bookingLines = (lines as any[]).filter(l => l.check_in && l.check_out);
        for (const b of bookingLines) {
            const ci = String(b.check_in), co = String(b.check_out);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(ci) || !/^\d{4}-\d{2}-\d{2}$/.test(co) || co <= ci) {
                return res.status(400).json({ error: 'Invalid booking dates.' });
            }
            // Half-open overlap against confirmed stays for this product.
            const { data: clashes } = await supabase
                .from('product_bookings')
                .select('id')
                .eq('product_id', b.id)
                .eq('status', 'CONFIRMED')
                .lt('check_in', co)
                .gt('check_out', ci)
                .limit(1);
            if (clashes && clashes.length > 0) {
                const prod: any = productMap.get(b.id);
                return res.status(409).json({ error: `${prod?.name || 'This room'} is already booked for those dates. Please choose different dates.` });
            }
        }

        // Pro-rate the entered amount across lines by their cart share (the cashier can
        // edit the amount for partial / rounded cash payments, so it may differ from the
        // raw subtotal). The final line absorbs any rounding remainder.
        const cartSubtotal = lines.reduce((s: number, l: any) => s + l.lineTotal, 0);
        let allocatedSoFar = 0;
        lines.forEach((l: any, i: number) => {
            if (i === lines.length - 1) {
                l.allocated = Math.round((totalAmount - allocatedSoFar) * 100) / 100;
            } else {
                const share = cartSubtotal > 0 ? l.lineTotal / cartSubtotal : 1 / lines.length;
                l.allocated = Math.round(totalAmount * share * 100) / 100;
                allocatedSoFar += l.allocated;
            }
        });

        // 1. Record the sale lines (money already collected → COMPLETED).
        const salesData = lines.map((l: any) => ({
            organization_id: organizationId,
            product_id: l.id,
            customer_name: customerName || 'Walk-in Customer',
            customer_phone: customerPhone || 'N/A',
            quantity: l.qty,
            amount_paid: l.allocated,
            reference,
            status: 'COMPLETED'
        }));
        const { error: salesError } = await supabase.from('product_sales').insert(salesData);
        if (salesError) {
            console.error('[Manual Sale] Failed to record product_sales:', salesError.message);
        }

        // 2. Group allocations by income account.
        const groups = new Map<string, { income: string | null; amount: number; names: string[] }>();
        for (const l of lines as any[]) {
            const prod: any = productMap.get(l.id);
            const income: string | null = prod?.income_account_id || null;
            const key = income || 'NULL';
            const g = groups.get(key) || { income, amount: 0, names: [] };
            g.amount += l.allocated;
            g.names.push(`${prod?.name || 'Item'} (x${l.qty})`);
            groups.set(key, g);
        }
        const groupList = [...groups.values()].sort((a, b) => b.amount - a.amount);

        // 3. One INFLOW per income group; the largest keeps the primary reference,
        //    the rest carry a `::gN` suffix (mirrors applyProductRevenueRouting).
        const created: any[] = [];
        for (let i = 0; i < groupList.length; i++) {
            const g = groupList[i];
            const desc = `Sale: ${g.names.join(', ')} | Cust: ${customerPhone || customerName || 'Walk-in'} | ${methodLabel || acctType}`;
            const entry = await cashbookService.createEntry(organizationId, {
                entry_type: 'INFLOW',
                description: desc,
                debit: g.amount,
                credit: 0,
                date: saleDate,
                created_by: userId,
                account_type: acctType,
                account_id: g.income || null,
                // Mapped income account is deterministic → ACCOUNTED so the AI sweep
                // leaves it alone; otherwise COMPLETED for later classification.
                status: g.income ? 'ACCOUNTED' : 'COMPLETED',
                external_reference: i === 0 ? reference : `${reference}::g${i + 1}`
            } as any);
            created.push(entry);
        }

        // 4. Reserve booking dates immediately (CONFIRMED — payment already received),
        //    so the room is blocked everywhere (public link, other sales) right away.
        for (const b of bookingLines as any[]) {
            const row = {
                organization_id: organizationId,
                product_id: b.id,
                reference,
                customer_name: customerName || 'Walk-in Customer',
                customer_phone: customerPhone || 'N/A',
                check_in: b.check_in,
                check_out: b.check_out,
                nights: nightsOf(String(b.check_in), String(b.check_out)),
                amount: b.allocated,
                status: 'CONFIRMED'
            };
            const { error: bookingErr } = await supabase.from('product_bookings').insert(row);
            if (!bookingErr) continue;
            // A concurrent booking slipped in between the pre-check and this insert
            // (partial GiST exclusion). Money is already taken, so don't fail the sale —
            // record the hold as CONFLICT for the merchant to resolve.
            const isOverlap = bookingErr.code === '23P01' || /exclusion|no_overlap|conflicting key/i.test(bookingErr.message || '');
            console.error(`[Manual Sale] Booking insert failed${isOverlap ? ' (overlap race)' : ''} for product ${b.id}:`, bookingErr.message);
            if (isOverlap) {
                await supabase.from('product_bookings').insert({ ...row, status: 'CONFLICT' });
            }
        }

        const primary = created[0];
        return res.json({
            reference,
            referenceNumber: primary?.reference_number || null,
            amount: totalAmount,
            entryId: primary?.id || null
        });
    } catch (error: any) {
        console.error('Error recording manual sale:', error);
        res.status(500).json({ error: 'Failed to record manual sale', details: error.message });
    }
};

/**
 * Log wallet deposit intent
 */
export const logWalletDepositIntent = async (req: any, res: any): Promise<any> => {
    try {
        const { reference, purpose, amount, walletId } = req.body;
        const organizationId = (req as any).user.organization_id;

        if (!reference || !purpose) {
            return res.status(400).json({ error: 'reference and purpose are required' });
        }

        if (!organizationId) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        const { error } = await supabase.from('cashbook_entries').insert({
            organization_id: organizationId,
            entry_type: 'INFLOW',
            account_type: 'MONEYWISE_WALLET',
            description: `PENDING_INTENT: ${purpose} | Ref: ${reference}`,
            debit: amount || 0,
            credit: 0,
            balance_after: 0,
            date: new Date().toISOString().split('T')[0],
            status: 'PENDING',
            wallet_id: walletId || null,
            // Store the merchant reference on the indexed column so the webhook and
            // periodic sync match this intent directly instead of via description LIKE.
            external_reference: reference
        });

        if (error) {
            // Unique index uniq_cashbook_inflow_per_reference: a retried initiation
            // with the same reference means the intent is already logged — idempotent.
            if (error.message?.includes('uniq_cashbook_inflow_per_reference')) {
                return res.json({ message: 'Intent already logged' });
            }
            throw error;
        }

        res.json({ message: 'Intent logged successfully' });
    } catch (error: any) {
        console.error('Error logging wallet deposit intent:', error);
        res.status(500).json({ error: 'Failed to log wallet deposit intent', details: error.message });
    }
};

/**
 * Close the cashbook
 */
export const closeBook = async (req: any, res: any): Promise<any> => {
    try {
        const { date, physicalCount, notes, accountType, walletId } = req.body;
        const userId = (req as any).user.id;
        const organizationId = (req as any).user.organization_id;

        if (!date || physicalCount === undefined) {
            return res.status(400).json({ error: 'Date and physicalCount are required' });
        }

        if (!organizationId) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        const result = await cashbookService.closeBook(
            organizationId,
            date,
            parseFloat(physicalCount),
            notes || '',
            userId,
            accountType || 'CASH',
            walletId
        );

        res.json(result);
    } catch (error: any) {
        console.error('Error closing book:', error);
        res.status(500).json({ error: 'Failed to close book', details: error.message });
    }
};

/**
 * Bulk classify transactions with Hybrid Intelligent Engine
 */
export const classifyBulk = async (req: any, res: any): Promise<any> => {
    try {
        const { requisitionIds } = req.body;
        const organizationId = (req as any).user.organization_id;

        // 1. Fetch unclassified items
        let query = supabase
            .from('line_items')
            .select(`
                id, 
                description, 
                estimated_amount, 
                requisition:requisitions!inner(id, status, type, department, organization_id)
            `)
            .is('account_id', null)
            .eq('requisition.organization_id', organizationId);

        if (requisitionIds && requisitionIds.length > 0) {
            query = query.in('requisition_id', requisitionIds);
        } else {
            query = query.eq('requisition.status', 'COMPLETED');
        }

        const { data: items, error } = await query;
        if (error) throw error;
        if (!items || items.length === 0) {
            return res.json({ message: 'No unclassified items found.', count: 0 });
        }

        // 2. Fetch Accounts
        const { data: accounts } = await supabase
            .from('accounts')
            .select('*')
            .eq('is_active', true)
            .eq('organization_id', organizationId);

        const accountByCode = new Map(accounts?.map((a: any) => [String(a.code || a.AcctNum || '').toLowerCase(), a]));

        console.log(`[Hybrid AI] Bulk processing ${items.length} items...`);

        // 3. Process each item through Decision Router (Parallelized in suggestBatch but Router handles 1-by-1)
        // Note: For extreme bulk, we'd parallelize even the Router calls
        const results = [];
        const updates = [];

        for (const item of items) {
            const decision = await decisionRouter.classify(accounts || [], {
                description: item.description,
                amount: item.estimated_amount || 0,
                department: (item.requisition as any).department
            }, organizationId);

            if (decision.account_code) {
                const account = accountByCode.get(decision.account_code.toLowerCase());

                if (account) {
                    updates.push(
                        supabase
                            .from('line_items')
                            .update({
                                account_id: (account as any).id,
                                ai_reasoning: decision.reasoning,
                                ai_rule_id: decision.rule_id,
                                ai_similarity_score: decision.similarity_score,
                                ai_decision_path: decision.decision_path,
                                ai_risk_level: decision.risk.riskLevel
                            })
                            .eq('id', item.id)
                    );

                    results.push({
                        line_item_id: item.id,
                        description: item.description,
                        account_name: (account as any).name || (account as any).Name,
                        confidence: decision.confidence,
                        risk: decision.risk.riskLevel,
                        reasoning: decision.reasoning,
                        path: decision.decision_path
                    });
                }
            }
        }

        if (updates.length > 0) {
            await Promise.all(updates);

            // Re-post the GL for each affected requisition so the new categorizations
            // move out of Suspense into the proper expense/asset accounts in real time.
            const affectedReqIds = [...new Set(items.map((i: any) => (i.requisition as any).id))];
            for (const reqId of affectedReqIds) {
                ledgerService.repostForRequisition(reqId as string)
                    .catch(err => console.error(`[Ledger] repost after bulk classify failed for req ${reqId}:`, err?.message));
            }
        }

        res.json({
            message: `Hybrid engine classified ${updates.length} items.`,
            count: updates.length,
            total: items.length,
            results
        });

    } catch (error: any) {
        console.error('[Hybrid AI] Error in classifyBulk:', error);
        res.status(500).json({ error: 'AI processing failed', details: error.message });
    }
};

/**
 * Create a QuickBooks Online account for an existing local chart-of-accounts row
 * that isn't linked yet, and save the returned QB Id back onto it.
 */
export const createQbAccount = async (req: any, res: any): Promise<any> => {
    try {
        const { accountId } = req.body;
        const organizationId = (req as any).user.organization_id;

        if (!accountId) {
            return res.status(400).json({ error: 'accountId is required' });
        }

        const result = await QuickBooksService.createAccount(organizationId, accountId);

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error: any) {
        console.error('Error creating QuickBooks account:', error);
        res.status(500).json({ error: 'Failed to create QuickBooks account', details: error.message });
    }
};

/**
 * Post a specific cashbook entry to QuickBooks
 */
export const postEntryToQuickBooks = async (req: any, res: any): Promise<any> => {
    try {
        const { entryId, accountId } = req.body;
        const organizationId = (req as any).user.organization_id;
        const userId = (req as any).user.id;

        if (!entryId || !accountId) {
            return res.status(400).json({ error: 'entryId and accountId are required' });
        }

        // Fetch entry to determine type
        const { data: entry } = await supabase
            .from('cashbook_entries')
            .select('entry_type')
            .eq('id', entryId)
            .single();

        if (!entry) return res.status(404).json({ error: 'Entry not found' });

        // Resolve QuickBooks ID for the account (Frontend sends UUID)
        const { data: account } = await supabase
            .from('accounts')
            .select('qb_account_id')
            .eq('id', accountId)
            .single();

        if (!account?.qb_account_id) {
            console.error(`[Ledger] ❌ Account ${accountId} has no linked QuickBooks ID`);
            return res.status(400).json({ 
                success: false, 
                error: 'The selected account is not linked to QuickBooks. Please map it first in Settings -> Chart of Accounts.' 
            });
        }

        let result;
        if (entry.entry_type === 'INFLOW') {
            result = await QuickBooksService.createDeposit(organizationId, entryId, account.qb_account_id, userId);
        } else {
            result = await QuickBooksService.createLedgerPurchase(organizationId, entryId, account.qb_account_id, userId);
        }

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error: any) {
        console.error('Error posting to QuickBooks:', error);
        res.status(500).json({ error: 'Failed to post to QuickBooks', details: error.message });
    }
};

/**
 * Update the account_id for a cashbook entry
 */
export const updateEntryAccount = async (req: any, res: any): Promise<any> => {
    try {
        const { entryId } = req.params;
        const { accountId } = req.body;

        if (!entryId || !accountId) {
            return res.status(400).json({ error: 'entryId and accountId are required' });
        }

        console.log(`[Ledger] Updating account for Entry ${entryId} to ${accountId}...`);
        const { data, error } = await supabase
            .from('cashbook_entries')
            .update({ account_id: accountId })
            .eq('id', entryId)
            .select();

        if (error) {
            console.error('[Ledger] ❌ Error updating entry account:', error);
            throw error;
        }

        console.log(`[Ledger] ✅ Successfully updated entry account. Data:`, data);

        // Re-post the GL so this categorization moves out of Suspense in real time.
        ledgerService.repostForCashbookEntry(entryId)
            .catch(err => console.error(`[Ledger] repost after categorization failed for ${entryId}:`, err?.message));

        res.json({ success: true, data: sanitizeEntry(data?.[0]) });
    } catch (error: any) {
        console.error('Error updating entry account:', error);
        res.status(500).json({ error: 'Failed to update entry account', details: error.message });
    }
};

/**
 * Update narration and account category for an entry (accounts it)
 */
export const narrateEntry = async (req: any, res: any): Promise<any> => {
    try {
        const { entryId } = req.params;
        const { description, accountId } = req.body;

        if (!entryId || !description) {
            return res.status(400).json({ error: 'entryId and description are required' });
        }

        console.log(`[Ledger] Accounting Entry ${entryId}: description="${description}", account=${accountId || 'none'}...`);
        
        const updateData: any = {
            description
        };
        if (accountId) {
            updateData.account_id = accountId;
            updateData.status = 'COMPLETED';
        } else {
            updateData.status = 'UNACCOUNTED';
        }

        const { data, error } = await supabase
            .from('cashbook_entries')
            .update(updateData)
            .eq('id', entryId)
            .select();

        if (error) {
            console.error('[Ledger] ❌ Error accounting entry:', error);
            throw error;
        }

        // Re-post the GL so the new categorization (or de-categorization) reflects immediately.
        ledgerService.repostForCashbookEntry(entryId)
            .catch(err => console.error(`[Ledger] repost after narrate failed for ${entryId}:`, err?.message));

        res.json({ success: true, data: sanitizeEntry(data?.[0]) });
    } catch (error: any) {
        console.error('Error accounting entry:', error);
        res.status(500).json({ error: 'Failed to update transaction details', details: error.message });
    }
};

/**
 * Get all subwallets for an organization
 */
export const getWallets = async (req: any, res: any): Promise<any> => {
    try {
        const organizationId = (req as any).user.organization_id;

        if (!organizationId) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        let { data: wallets, error } = await supabase
            .from('organization_wallets')
            .select('*')
            .eq('organization_id', organizationId)
            .order('is_main', { ascending: false })
            .order('name', { ascending: true });

        if (error) throw error;

        // If no wallets found (e.g. new organization), seed Main Wallet on the fly
        if (!wallets || wallets.length === 0) {
            const { data: newWallet, error: seedError } = await supabase
                .from('organization_wallets')
                .insert({
                    organization_id: organizationId,
                    name: 'Main Wallet',
                    is_main: true
                })
                .select()
                .single();

            if (seedError) throw seedError;
            wallets = [newWallet];
        }

        // Fetch balances for each wallet dynamically
        const walletsWithBalances = await Promise.all((wallets || []).map(async (wallet: any) => {
            const balance = await cashbookService.getCurrentBalance(organizationId, 'MONEYWISE_WALLET', wallet.id);
            return {
                ...wallet,
                balance
            };
        }));

        res.json(walletsWithBalances);
    } catch (error: any) {
        console.error('Error fetching wallets:', error);
        res.status(500).json({ error: 'Failed to fetch wallets', details: error.message });
    }
};

/**
 * Create a new subwallet
 */
export const createWallet = async (req: any, res: any): Promise<any> => {
    try {
        const { name, qbAccountId, qbAccountName } = req.body;
        const organizationId = (req as any).user.organization_id;
        const userId = (req as any).user.id;

        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Wallet name is required' });
        }

        if (!organizationId) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        // Insert wallet
        const { data: wallet, error } = await supabase
            .from('organization_wallets')
            .insert({
                organization_id: organizationId,
                name: name.trim(),
                qb_account_id: qbAccountId || null,
                qb_account_name: qbAccountName || null,
                is_main: false
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'A wallet with this name already exists' });
            }
            throw error;
        }

        // Create opening balance entry for the wallet
        await cashbookService.createEntry(organizationId, {
            entry_type: 'OPENING_BALANCE',
            description: `Opening Balance for ${wallet.name}`,
            debit: 0,
            credit: 0,
            date: new Date().toISOString().split('T')[0],
            created_by: userId,
            account_type: 'MONEYWISE_WALLET',
            wallet_id: wallet.id
        } as any);

        res.status(201).json(wallet);
    } catch (error: any) {
        console.error('Error creating wallet:', error);
        res.status(500).json({ error: 'Failed to create wallet', details: error.message });
    }
};

/**
 * Transfer funds between subwallets
 */
export const transferSubwalletFunds = async (req: any, res: any): Promise<any> => {
    try {
        const { sourceWalletId, destinationWalletId, amount, description } = req.body;
        const organizationId = (req as any).user.organization_id;
        const userId = (req as any).user.id;

        if (!sourceWalletId || !destinationWalletId || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ error: 'Source wallet, destination wallet, and a valid amount are required' });
        }

        if (sourceWalletId === destinationWalletId) {
            return res.status(400).json({ error: 'Source and destination wallets must be different' });
        }

        if (!organizationId) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        // 1. Verify source wallet has sufficient balance
        const sourceBalance = await cashbookService.getCurrentBalance(organizationId, 'MONEYWISE_WALLET', sourceWalletId);
        if (sourceBalance < amount) {
            return res.status(400).json({ error: `Insufficient funds in source wallet. Available: K${sourceBalance.toFixed(2)}` });
        }

        // 2. Fetch wallet details for descriptions
        const { data: wallets, error: fetchError } = await supabase
            .from('organization_wallets')
            .select('id, name')
            .in('id', [sourceWalletId, destinationWalletId]);

        if (fetchError || !wallets || wallets.length !== 2) {
            return res.status(404).json({ error: 'One or both wallets were not found' });
        }

        const sourceWallet = wallets.find(w => w.id === sourceWalletId)!;
        const destWallet = wallets.find(w => w.id === destinationWalletId)!;

        // 3. Log credit/debit adjustment entries
        const transferDesc = description || `Transfer: ${sourceWallet.name} ➡️ ${destWallet.name}`;

        // Debit source subwallet (reduce funds: credit = amount)
        const creditEntry = await cashbookService.createEntry(organizationId, {
            entry_type: 'ADJUSTMENT',
            description: `${transferDesc} (Outflow)`,
            debit: 0,
            credit: amount,
            date: new Date().toISOString().split('T')[0],
            created_by: userId,
            account_type: 'MONEYWISE_WALLET',
            wallet_id: sourceWalletId,
            status: 'COMPLETED'
        } as any);

        // Credit destination subwallet (increase funds: debit = amount)
        const debitEntry = await cashbookService.createEntry(organizationId, {
            entry_type: 'ADJUSTMENT',
            description: `${transferDesc} (Inflow)`,
            debit: amount,
            credit: 0,
            date: new Date().toISOString().split('T')[0],
            created_by: userId,
            account_type: 'MONEYWISE_WALLET',
            wallet_id: destinationWalletId,
            status: 'COMPLETED'
        } as any);

        res.json({
            message: 'Transfer completed successfully',
            creditEntry: sanitizeEntry(creditEntry),
            debitEntry: sanitizeEntry(debitEntry)
        });
    } catch (error: any) {
        console.error('Error transferring funds:', error);
        res.status(500).json({ error: 'Failed to transfer funds', details: error.message });
    }
};

/**
 * Compute the fee breakdown for a "Transfer to MoneyWise", working BACKWARDS from
 * the gross amount the user entered (which is the total charged / deducted):
 *
 *   net to wallet  = gross − platform fee − Lenco fee
 *   deposit charge = platform fee (tiered, calculatePlatformFee) + Lenco fee (1%)
 *
 * so net + depositCharge === gross exactly. Kept here (not just on the client) so
 * the ledger amounts are authoritative.
 */
export const computeTransferFees = (gross: number) => {
    const platformFee = calculatePlatformFee(gross);
    const lencoFee = Math.round(gross * 0.01 * 100) / 100;
    const depositCharge = Math.round((platformFee + lencoFee) * 100) / 100;
    const net = Math.round((gross - depositCharge) * 100) / 100;
    return { platformFee, lencoFee, depositCharge, net };
};

/**
 * Record the CASH-side legs of a "Transfer to MoneyWise" once the funding Lenco
 * deposit has actually cleared.
 *
 * `amount` is the GROSS the user entered = the total charged. The wallet is
 * credited the NET (gross − fees) by the real Lenco deposit, so here we only book
 * the outgo from the external account, split into two lines so it always sums to
 * the entered amount:
 *   • a transfer Outflow of `net` (the part that actually reaches the wallet)
 *   • a Deposit charge of `depositCharge` (the platform + Lenco fees), as an EXPENSE
 * Total reduction = net + depositCharge = gross. Idempotent on the deposit
 * `reference` so a retried / double-fired success callback never deducts twice.
 */
export const transferCashToWallet = async (req: any, res: any): Promise<any> => {
    try {
        const { amount, reference, sourceAccountType, walletName } = req.body;
        const organizationId = (req as any).user.organization_id;
        const userId = (req as any).user.id;

        if (!organizationId) {
            return res.status(400).json({ error: 'User organization context missing' });
        }
        if (!reference) {
            return res.status(400).json({ error: 'A deposit reference is required' });
        }

        const gross = Number(amount);
        if (!Number.isFinite(gross) || gross <= 0) {
            return res.status(400).json({ error: 'A valid transfer amount is required' });
        }

        const EXTERNAL_TYPES: Record<string, string> = { CASH: 'Cash', AIRTEL_MONEY: 'Mobile Money', BANK: 'Bank' };
        const srcType = EXTERNAL_TYPES[sourceAccountType] ? sourceAccountType : 'CASH';
        const cashOutRef = `${reference}-CASHOUT`;

        // Idempotent: only deduct once per funding deposit, even if the success
        // callback fires multiple times or the request is retried.
        const { data: existing } = await supabase
            .from('cashbook_entries')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('external_reference', cashOutRef)
            .maybeSingle();
        if (existing) {
            return res.json({ message: 'Cash transfer leg already recorded', outEntry: sanitizeEntry(existing) });
        }

        // Ensure the external account still holds enough to cover the full (gross) charge.
        const srcBalance = await cashbookService.getCurrentBalance(organizationId, srcType);
        if (srcBalance < gross) {
            return res.status(400).json({ error: `Insufficient ${EXTERNAL_TYPES[srcType]} balance. Available: K${srcBalance.toFixed(2)}` });
        }

        const { depositCharge, net } = computeTransferFees(gross);
        const today = new Date().toISOString().split('T')[0];
        const dest = (walletName || 'MoneyWise Wallet').toString().slice(0, 60);

        // 1. Transfer outflow — the net that actually reaches the wallet (matches the
        //    Lenco deposit credit). The wallet inflow itself is created by the deposit
        //    finalization, not here.
        const outEntry = await cashbookService.createEntry(organizationId, {
            entry_type: 'ADJUSTMENT',
            description: `Transfer to MoneyWise: ${EXTERNAL_TYPES[srcType]} ➡️ ${dest} (Outflow)`,
            debit: 0,
            credit: net,
            date: today,
            created_by: userId,
            account_type: srcType,
            external_reference: cashOutRef,
            status: 'COMPLETED'
        } as any);

        // 2. Deposit charge — the platform + Lenco fees, booked as an expense so the
        //    total leaving the account equals the amount the user entered.
        let chargeEntry: any = null;
        if (depositCharge > 0) {
            chargeEntry = await cashbookService.createEntry(organizationId, {
                entry_type: 'EXPENSE',
                description: `Deposit charge — Lenco + platform fees (Transfer to ${dest})`,
                debit: 0,
                credit: depositCharge,
                date: today,
                created_by: userId,
                account_type: srcType,
                external_reference: `${reference}-FEE`,
                status: 'COMPLETED'
            } as any);
        }

        res.json({
            message: 'Cash transfer legs recorded',
            net,
            depositCharge,
            outEntry: sanitizeEntry(outEntry),
            chargeEntry: chargeEntry ? sanitizeEntry(chargeEntry) : null
        });
    } catch (error: any) {
        console.error('Error recording cash transfer leg:', error);
        res.status(500).json({ error: 'Failed to record cash transfer', details: error.message });
    }
};

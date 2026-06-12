import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { cashbookService } from '../services/cashbook.service';
import { decisionRouter } from '../services/ai/decision.router';
import { supabase } from '../lib/supabase';
import { QuickBooksService } from '../services/quickbooks.service';

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

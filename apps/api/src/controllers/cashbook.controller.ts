import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { cashbookService } from '../services/cashbook.service';
import { aiService } from '../services/ai/ai.service';
import { supabase } from '../lib/supabase';

/**
 * Get all cashbook entries with optional filters
 */
export const getCashbookEntries = async (req: any, res: any): Promise<any> => {
    try {
        const { startDate, endDate, entryType, limit } = req.query;

        const entries = await cashbookService.getEntries({
            startDate: startDate as string,
            endDate: endDate as string,
            entryType: entryType as string,
            limit: limit ? parseInt(limit as string) : undefined
        });

        res.json(entries);
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
        const balance = await cashbookService.getCurrentBalance();
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
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required' });
        }

        const summary = await cashbookService.getSummary(
            startDate as string,
            endDate as string
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
        const { physicalCount, denominations, notes } = req.body;
        const userId = (req as any).user.id;

        if (typeof physicalCount !== 'number' || physicalCount < 0) {
            return res.status(400).json({ error: 'Valid physicalCount is required' });
        }

        const systemBalance = await cashbookService.getCurrentBalance();
        const variance = physicalCount - systemBalance;

        // If there's a variance, create an adjustment entry
        if (Math.abs(variance) > 0.01) { // Allow for floating point rounding
            await cashbookService.createEntry({
                entry_type: 'ADJUSTMENT',
                description: `Cash reconciliation adjustment (${variance > 0 ? 'Over' : 'Short'}: K${Math.abs(variance).toFixed(2)})${notes ? ' - ' + notes : ''}`,
                debit: variance > 0 ? variance : 0,
                credit: variance < 0 ? Math.abs(variance) : 0,
                date: new Date().toISOString().split('T')[0],
                created_by: userId
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

        if (!requisitionId || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ error: 'Valid requisitionId and amount are required' });
        }

        const entry = await cashbookService.logReturn(
            requisitionId,
            amount,
            userId,
            description
        );

        res.json(entry);
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
        const { personName, purpose, contactDetails, amount, denominations } = req.body;
        const userId = (req as any).user.id;

        if (!personName || !purpose || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ error: 'personName, purpose, and a valid amount are required' });
        }

        const entry = await cashbookService.logInflow(
            { personName, purpose, contactDetails, amount, denominations },
            userId
        );

        res.json(entry);
    } catch (error: any) {
        console.error('Error logging cash inflow:', error);
        res.status(500).json({ error: 'Failed to log cash inflow', details: error.message });
    }
};

/**
 * Close the cashbook
 */
export const closeBook = async (req: any, res: any): Promise<any> => {
    try {
        const { date, physicalCount, notes } = req.body;
        const userId = (req as any).user.id; // Correctly get user from auth middleware

        if (!date || physicalCount === undefined) {
            return res.status(400).json({ error: 'Date and physicalCount are required' });
        }

        const result = await cashbookService.closeBook(
            date,
            parseFloat(physicalCount),
            notes || '',
            userId
        );

        res.json(result);
    } catch (error: any) {
        console.error('Error closing book:', error);
        res.status(500).json({ error: 'Failed to close book', details: error.message });
    }
};

/**
 * Bulk classify transactions
 */
export const classifyBulk = async (req: any, res: any): Promise<any> => {
    try {
        const { requisitionIds } = req.body;

        // 1. Fetch unclassified items for completed requisitions
        // If requisitionIds provided, use them. Else find all unclassified completed reqs.
        let query = supabase
            .from('line_items')
            .select(`
                id, 
                description, 
                estimated_amount, 
                requisition:requisitions!inner(id, status, type)
            `)
            .is('account_id', null);

        if (requisitionIds && requisitionIds.length > 0) {
            query = query.in('requisition_id', requisitionIds);
        } else {
            // Only classified completed requisitions by default to save tokens
            query = query.eq('requisition.status', 'COMPLETED');
        }

        const { data: items, error } = await query;

        if (error) throw error;

        if (!items || items.length === 0) {
            return res.json({ message: 'No unclassified items found.', count: 0 });
        }

        // 2. Prepare for AI
        // Fetch accounts for context
        const { data: accounts } = await supabase
            .from('accounts')
            .select('*')
            .eq('is_active', true);

        const aiInput = items.map((item: any) => ({
            description: item.description,
            amount: item.estimated_amount || 0
        }));

        console.log(`[Classify Bulk] Processing ${items.length} items...`);

        // 3. Call AI Service
        const suggestions = await aiService.suggestBatch(accounts || [], aiInput);

        // 4. Update Line Items and Prepare Results
        const updates = [];
        const results = [];

        // Prepare mapping maps for robust lookup
        const accountByCode = new Map(accounts?.map((a: any) => [String(a.code || a.AcctNum || '').toLowerCase(), a]));
        const accountByName = new Map(accounts?.map((a: any) => [String(a.name || a.Name || '').toLowerCase(), a]));

        for (let i = 0; i < items.length; i++) {
            const suggestion = suggestions[i];
            const item = items[i];

            if (suggestion.account_code) {
                const searchKey = String(suggestion.account_code).toLowerCase();

                // Try matching by code first, then by name
                const account = accountByCode.get(searchKey) || accountByName.get(searchKey);

                if (account) {
                    updates.push(
                        supabase
                            .from('line_items')
                            .update({ account_id: account.id })
                            .eq('id', item.id)
                    );

                    results.push({
                        line_item_id: item.id,
                        description: item.description,
                        account_code: suggestion.account_code,
                        account_name: account.name || account.Name,
                        confidence: suggestion.confidence,
                        reasoning: suggestion.reasoning,
                        method: suggestion.method
                    });
                } else {
                    console.log(`[Classify Bulk] No account match found for suggested code/name: ${suggestion.account_code}`);
                }
            }
        }

        await Promise.all(updates);

        res.json({
            message: `Successfully classified ${updates.length} out of ${items.length} items.`,
            count: updates.length,
            total: items.length,
            results: results
        });

    } catch (error: any) {
        console.error('Error classifying bulk:', error);
        res.status(500).json({ error: 'Failed to classify items', details: error.message });
    }
};

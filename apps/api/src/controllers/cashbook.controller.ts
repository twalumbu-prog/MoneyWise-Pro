import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { cashbookService } from '../services/cashbook.service';
import { decisionRouter } from '../services/ai/decision.router';
import { supabase } from '../lib/supabase';

/**
 * Get all cashbook entries with optional filters
 */
export const getCashbookEntries = async (req: any, res: any): Promise<any> => {
    // ... existing entries logic ... (simplified for brevity, assume unchanged or just import updated)
    try {
        const { startDate, endDate, entryType, accountType, limit } = req.query;
        const organizationId = (req as any).user.organization_id;

        if (!organizationId) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        const entries = await cashbookService.getEntries(organizationId, {
            startDate: startDate as string,
            endDate: endDate as string,
            entryType: entryType as string,
            accountType: accountType as string,
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
        const { accountType } = req.query;
        const organizationId = (req as any).user.organization_id;

        if (!organizationId) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        const balance = await cashbookService.getCurrentBalance(organizationId, accountType as string);
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
        const { startDate, endDate, accountType } = req.query;
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
            accountType as string
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

        const entry = await cashbookService.logReturn(
            organizationId,
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
        const { personName, purpose, contactDetails, amount, denominations, accountType } = req.body;
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
            { personName, purpose, contactDetails, amount, denominations, accountType },
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
        const { date, physicalCount, notes, accountType } = req.body;
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
            accountType || 'CASH'
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

        // 1. Fetch unclassified items
        let query = supabase
            .from('line_items')
            .select(`
                id, 
                description, 
                estimated_amount, 
                requisition:requisitions!inner(id, status, type, department)
            `)
            .is('account_id', null);

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
            .eq('is_active', true);

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
            });

            if (decision.account_code) {
                const account = accountByCode.get(decision.account_code.toLowerCase());

                if (account) {
                    updates.push(
                        supabase
                            .from('line_items')
                            .update({
                                account_id: account.id,
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
                        account_name: account.name || account.Name,
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

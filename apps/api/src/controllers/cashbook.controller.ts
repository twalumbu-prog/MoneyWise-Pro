import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { cashbookService } from '../services/cashbook.service';

/**
 * Get all cashbook entries with optional filters
 */
export const getCashbookEntries = async (req: AuthRequest, res: Response): Promise<any> => {
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
export const getCashBalance = async (req: AuthRequest, res: Response): Promise<any> => {
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
export const getCashbookSummary = async (req: AuthRequest, res: Response): Promise<any> => {
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
export const reconcileCash = async (req: AuthRequest, res: Response): Promise<any> => {
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
export const returnExcessCash = async (req: AuthRequest, res: Response): Promise<any> => {
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

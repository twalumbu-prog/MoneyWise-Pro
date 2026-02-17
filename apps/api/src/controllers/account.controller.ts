import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { aiService } from '../services/ai/ai.service';
import pool from '../db';


export const getAccounts = async (req: AuthRequest, res: any): Promise<any> => {
    try {
        const organization_id = (req as any).user.organization_id;

        if (!organization_id) {
            return res.status(400).json({ error: 'User not in organization' });
        }

        const { data, error } = await supabase
            .from('accounts')
            .select('*')
            .eq('organization_id', organization_id) // Filter by org
            .eq('is_active', true)
            .order('code', { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        console.error('Error fetching accounts:', error);
        res.status(500).json({ error: 'Failed to fetch accounts', details: error.message });
    }
};

export const createAccount = async (req: AuthRequest, res: any): Promise<any> => {
    try {
        const { code, name, type, subtype, description } = req.body;
        const organization_id = (req as any).user.organization_id;

        if (!organization_id) {
            return res.status(400).json({ error: 'User not in organization' });
        }

        const { data, error } = await supabase
            .from('accounts')
            .insert({
                code,
                name,
                type,
                subtype, // Added subtype
                description,
                organization_id, // Link to org
                is_active: true
            })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error: any) {
        console.error('Error creating account:', error);
        res.status(500).json({ error: 'Failed to create account', details: error.message });
    }
};

export const updateAccount = async (req: AuthRequest, res: any): Promise<any> => {
    try {
        const { id } = req.params;
        const { code, name, type, subtype, description, is_active } = req.body;
        const organization_id = (req as any).user.organization_id;

        if (!organization_id) {
            return res.status(400).json({ error: 'User not in organization' });
        }

        // Ensure account belongs to same org
        const { data: account } = await supabase.from('accounts').select('organization_id').eq('id', id).single();
        if (!account || account.organization_id !== organization_id) {
            return res.status(404).json({ error: 'Account not found in organization' });
        }

        const { data, error } = await supabase
            .from('accounts')
            .update({
                code,
                name,
                type,
                subtype, // Added subtype
                description,
                is_active,
                qb_account_id: req.body.qb_account_id,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        console.error('Error updating account:', error);
        res.status(500).json({ error: 'Failed to update account', details: error.message });
    }
};

export const suggestAccount = async (req: any, res: any): Promise<any> => {
    try {
        const { description, amount, line_items, requisition_id } = req.body;

        if (!description && (!line_items || line_items.length === 0)) {
            return res.status(400).json({ error: 'Description or line_items is required' });
        }

        // Normalize input
        const items = line_items || [{ id: 'manual-1', description, amount: amount || 0 }];

        // Fetch accounts for matching
        const { data: accountsData } = await supabase
            .from('accounts')
            .select('*')
            .eq('is_active', true);

        const accounts = accountsData || [];

        console.log(`[AI Suggest] Processing ${items.length} items locally...`);

        const suggestions = await aiService.suggestBatch(accounts, items.map((it: any) => ({
            description: it.description,
            amount: it.amount || it.estimated_amount || 0
        })));

        // Map suggesting codes back to account IDs
        const accountMap = new Map(accounts.map((a: any) => [String(a.code), a.id]));

        const results = suggestions.map((s, i) => ({
            item_id: items[i].id,
            suggestion: s.account_code ? accountMap.get(s.account_code) : null,
            account_code: s.account_code,
            confidence: s.confidence,
            method: s.method,
            reasoning: s.reasoning
        }));

        const data = { results };

        console.log('[DEBUG] Local AI results:', JSON.stringify(data, null, 2));

        // If it was a single request, return just the first result to maintain compatibility
        if (!line_items) {
            const result = data.results[0];
            res.json({
                account_code: result.account_code,
                confidence: result.confidence,
                reasoning: result.reasoning,
                method: result.method
            });
        } else {
            res.json(data);
        }
    } catch (error: any) {
        console.error('Error suggesting account:', error);
        res.status(500).json({ error: 'Failed to suggest account', details: error.message });
    }
};



export const importAccounts = async (req: any, res: any): Promise<any> => {
    try {
        console.log('[Account Import] Starting import from QuickBooks...');

        const organization_id = (req as any).user.organization_id;

        if (!organization_id) {
            return res.status(400).json({ error: 'User not in organization' });
        }

        // 1. Fetch all accounts from QB
        const { QuickBooksService } = await import('../services/quickbooks.service');
        const qbAccounts = await QuickBooksService.fetchAccounts(organization_id);

        console.log(`[Account Import] Fetched ${qbAccounts.length} accounts from QB`);

        // 2. Fetch all local accounts to check existing
        const { data: localAccounts, error: localError } = await supabase
            .from('accounts')
            .select('qb_account_id, code, name')
            .eq('organization_id', organization_id); // Filter by org

        if (localError) throw localError;

        const existingQbIds = new Set(localAccounts?.map((a: any) => a.qb_account_id).filter(Boolean));
        const existingCodes = new Set(localAccounts?.map((a: any) => a.code));
        const existingNames = new Set(localAccounts?.map((a: any) => a.name));

        const typeMap: Record<string, string> = {
            'Expense': 'EXPENSE',
            'Other Expense': 'EXPENSE',
            'Cost of Goods Sold': 'EXPENSE',
            'Income': 'INCOME',
            'Other Income': 'INCOME',
            'Equity': 'EQUITY',
            'Liability': 'LIABILITY',
            'Other Current Liability': 'LIABILITY',
            'Long Term Liability': 'LIABILITY',
            'Accounts Payable': 'LIABILITY',
            'Credit Card': 'LIABILITY',
            'Bank': 'ASSET',
            'Other Asset': 'ASSET',
            'Fixed Asset': 'ASSET',
            'Other Current Asset': 'ASSET',
            'Accounts Receivable': 'ASSET'
        };

        const newAccounts = [];

        for (const qbAcc of qbAccounts) {
            if (existingQbIds.has(qbAcc.Id)) continue;
            if (existingNames.has(qbAcc.Name)) continue;

            let localType = 'EXPENSE';
            if (typeMap[qbAcc.AccountType]) {
                localType = typeMap[qbAcc.AccountType];
            } else if (typeMap[qbAcc.Classification]) {
                localType = typeMap[qbAcc.Classification];
            }

            let code = qbAcc.AcctNum;
            if (!code) {
                code = `QB-${qbAcc.Id}`;
            }

            if (existingCodes.has(code)) {
                code = `${code}-QB`;
                if (existingCodes.has(code)) continue;
            }

            newAccounts.push({
                code: code,
                name: qbAcc.Name,
                type: localType,
                description: qbAcc.Description || `Imported from QuickBooks (${qbAcc.AccountType})`,
                is_active: qbAcc.Active !== false,
                qb_account_id: qbAcc.Id,
                organization_id, // Link to org
                updated_at: new Date().toISOString()
            });

            existingCodes.add(code);
        }

        if (newAccounts.length === 0) {
            return res.json({ message: 'No new accounts to import', count: 0 });
        }

        console.log(`[Account Import] Importing ${newAccounts.length} new accounts...`);

        const { data, error } = await supabase
            .from('accounts')
            .insert(newAccounts)
            .select();

        if (error) throw error;

        res.json({ message: `Successfully imported ${data.length} accounts`, count: data.length, accounts: data });

    } catch (error: any) {
        console.error('Error importing accounts:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({ error: 'Failed to import accounts', details: error.message, stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined });
    }
};

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { aiService } from '../services/ai/ai.service';
import pool from '../db';


export const getAccounts = async (req: AuthRequest, res: Response) => {
    try {
        const { data, error } = await supabase
            .from('accounts')
            .select('*')
            .eq('is_active', true)
            .order('code', { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        console.error('Error fetching accounts:', error);
        res.status(500).json({ error: 'Failed to fetch accounts', details: error.message });
    }
};

export const createAccount = async (req: AuthRequest, res: Response) => {
    try {
        const { code, name, type, description } = req.body;

        // In a real app, we'd check if user is admin/accountant here
        // For now, allow authenticated users to create accounts for easier testing/setup

        const { data, error } = await supabase
            .from('accounts')
            .insert({
                code,
                name,
                type,
                description,
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

export const updateAccount = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { code, name, type, description, is_active } = req.body;

        const { data, error } = await supabase
            .from('accounts')
            .update({
                code,
                name,
                type,
                description,
                is_active,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Account not found' });

        res.json(data);
    } catch (error: any) {
        console.error('Error updating account:', error);
        res.status(500).json({ error: 'Failed to update account', details: error.message });
    }
};

export const suggestAccount = async (req: AuthRequest, res: Response) => {
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



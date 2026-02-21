import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { ruleEngine } from '../services/ai/rule.engine';

export const getRules = async (req: AuthRequest, res: Response) => {
    try {
        const { data, error } = await supabase
            .from('accounting_rules')
            .select('*')
            .order('priority', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createRule = async (req: AuthRequest, res: Response) => {
    try {
        const { data, error } = await supabase
            .from('accounting_rules')
            .insert([req.body])
            .select()
            .single();

        if (error) throw error;

        // Reload rule engine cache
        await ruleEngine.loadRules();

        res.status(201).json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateRule = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('accounting_rules')
            .update(req.body)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Reload rule engine cache
        await ruleEngine.loadRules();

        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteRule = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('accounting_rules')
            .delete()
            .eq('id', id);

        if (error) throw error;

        // Reload rule engine cache
        await ruleEngine.loadRules();

        res.status(204).send();
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { addDays, addWeeks, addMonths, addQuarters, format, parseISO } from 'date-fns';

// ── Helpers ────────────────────────────────────────────────────────────────────

function advanceDueDate(currentDate: string, cadence: string): string {
    const d = parseISO(currentDate);
    let next: Date;
    switch (cadence) {
        case 'DAILY':     next = addDays(d, 1);    break;
        case 'WEEKLY':    next = addWeeks(d, 1);   break;
        case 'BIWEEKLY':  next = addWeeks(d, 2);   break;
        case 'QUARTERLY': next = addQuarters(d, 1); break;
        case 'MONTHLY':
        default:          next = addMonths(d, 1);  break;
    }
    return format(next, 'yyyy-MM-dd');
}

// ── Controllers ────────────────────────────────────────────────────────────────

export async function getScheduledItems(req: Request, res: Response) {
    try {
        const { organization_id } = (req as any).user;
        const { category, status = 'ACTIVE' } = req.query as Record<string, string>;

        let query = supabase
            .from('scheduled_items')
            .select('*')
            .eq('organization_id', organization_id)
            .order('next_due_date', { ascending: true });

        if (status) query = query.eq('status', status);
        if (category && category !== 'ALL') query = query.eq('category', category);

        const { data, error } = await query;
        if (error) throw error;
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function getScheduledItemCounts(req: Request, res: Response) {
    try {
        const { organization_id } = (req as any).user;
        const { data, error } = await supabase
            .from('scheduled_items')
            .select('category')
            .eq('organization_id', organization_id)
            .eq('status', 'ACTIVE');
        if (error) throw error;

        const counts: Record<string, number> = {
            ALL: 0,
            BILLS: 0,
            SUBSCRIPTIONS: 0,
            INVESTMENTS: 0,
            LOAN_REPAYMENTS: 0,
            GENERAL_EXPENSES: 0,
        };
        for (const row of data ?? []) {
            counts.ALL++;
            if (counts[row.category] !== undefined) counts[row.category]++;
        }
        res.json(counts);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function createScheduledItem(req: Request, res: Response) {
    try {
        const { organization_id, id: created_by } = (req as any).user;
        const {
            title, amount, category, cadence,
            next_due_date, description,
            payment_method, recipient_account, recipient_bank_code, recipient_name,
        } = req.body;

        if (!title || !amount || !next_due_date) {
            return res.status(400).json({ error: 'title, amount, and next_due_date are required' });
        }

        const { data: item, error: insertErr } = await supabase
            .from('scheduled_items')
            .insert({
                organization_id, created_by, title, amount,
                category: category ?? 'GENERAL_EXPENSES',
                cadence: cadence ?? 'MONTHLY',
                next_due_date, description: description ?? null,
                payment_method: payment_method ?? null,
                recipient_account: recipient_account ?? null,
                recipient_bank_code: recipient_bank_code ?? null,
                recipient_name: recipient_name ?? null,
            })
            .select()
            .single();
        if (insertErr) throw insertErr;

        // Pre-create the first UPCOMING run
        await supabase.from('scheduled_item_runs').insert({
            scheduled_item_id: item.id,
            organization_id,
            due_date: next_due_date,
            status: 'UPCOMING',
        });

        res.status(201).json(item);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function updateScheduledItem(req: Request, res: Response) {
    try {
        const { organization_id } = (req as any).user;
        const { id } = req.params;
        const allowed = [
            'title', 'amount', 'category', 'cadence', 'next_due_date',
            'description', 'status',
            'payment_method', 'recipient_account', 'recipient_bank_code', 'recipient_name',
        ];
        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        for (const key of allowed) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }

        const { data, error } = await supabase
            .from('scheduled_items')
            .update(updates)
            .eq('id', id)
            .eq('organization_id', organization_id)
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function deleteScheduledItem(req: Request, res: Response) {
    try {
        const { organization_id } = (req as any).user;
        const { id } = req.params;
        const { error } = await supabase
            .from('scheduled_items')
            .delete()
            .eq('id', id)
            .eq('organization_id', organization_id);
        if (error) throw error;
        res.status(204).send();
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function getScheduledItemRuns(req: Request, res: Response) {
    try {
        const { organization_id } = (req as any).user;
        const { id } = req.params;
        const { data, error } = await supabase
            .from('scheduled_item_runs')
            .select('*')
            .eq('scheduled_item_id', id)
            .eq('organization_id', organization_id)
            .order('due_date', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function runScheduledItemNow(req: Request, res: Response) {
    try {
        const { organization_id, id: triggered_by } = (req as any).user;
        const { id } = req.params;

        // Fetch the scheduled item
        const { data: item, error: fetchErr } = await supabase
            .from('scheduled_items')
            .select('*')
            .eq('id', id)
            .eq('organization_id', organization_id)
            .single();
        if (fetchErr || !item) return res.status(404).json({ error: 'Scheduled item not found' });

        // Find (or create) the UPCOMING run for the current due date
        let { data: run } = await supabase
            .from('scheduled_item_runs')
            .select('*')
            .eq('scheduled_item_id', id)
            .eq('due_date', item.next_due_date)
            .maybeSingle();

        if (!run) {
            const { data: newRun, error: runErr } = await supabase
                .from('scheduled_item_runs')
                .insert({
                    scheduled_item_id: id,
                    organization_id,
                    due_date: item.next_due_date,
                    status: 'UPCOMING',
                })
                .select()
                .single();
            if (runErr) throw runErr;
            run = newRun;
        }

        const description = `Scheduled payment: ${item.title}`;

        // Build requisition insert payload with correct column names
        const reqInsertData: Record<string, any> = {
            organization_id,
            requestor_id: triggered_by,
            estimated_total: item.amount,
            status: 'PENDING_APPROVAL',
            description,
        };

        // Conditionally include payment fields (safe schema check, same pattern as createRequisition)
        if (item.payment_method) {
            const { error: schemaError } = await supabase
                .from('requisitions')
                .select('payment_method')
                .limit(1);
            if (!schemaError) {
                reqInsertData.payment_method = item.payment_method;
                reqInsertData.recipient_account = item.recipient_account ?? null;
                reqInsertData.recipient_bank_code = item.recipient_bank_code ?? null;
                reqInsertData.recipient_name = item.recipient_name ?? null;
            }
        }

        // Create requisition
        const { data: requisition, error: reqErr } = await supabase
            .from('requisitions')
            .insert(reqInsertData)
            .select()
            .single();
        if (reqErr) throw reqErr;

        // Mark the run as PROCESSING and link it to the requisition
        await supabase
            .from('scheduled_item_runs')
            .update({
                status: 'PROCESSING',
                requisition_id: requisition.id,
                triggered_at: new Date().toISOString(),
            })
            .eq('id', run.id);

        // Advance next_due_date and seed the next UPCOMING run
        const nextDueDate = advanceDueDate(item.next_due_date, item.cadence);
        await supabase
            .from('scheduled_items')
            .update({ next_due_date: nextDueDate, updated_at: new Date().toISOString() })
            .eq('id', id);

        await supabase.from('scheduled_item_runs').upsert({
            scheduled_item_id: id,
            organization_id,
            due_date: nextDueDate,
            status: 'UPCOMING',
        }, { onConflict: 'scheduled_item_id,due_date', ignoreDuplicates: true });

        res.json({ requisition, next_due_date: nextDueDate });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

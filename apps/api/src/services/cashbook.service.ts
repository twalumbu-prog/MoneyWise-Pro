import { supabase } from '../lib/supabase';

export interface CashbookEntry {
    id?: string;
    voucher_id?: string;
    date: string;
    description: string;
    debit: number;
    credit: number;
    balance_after: number;
    entry_type: 'DISBURSEMENT' | 'RETURN' | 'ADJUSTMENT' | 'OPENING_BALANCE';
    requisition_id?: string;
    created_by?: string;
    status?: 'PENDING' | 'COMPLETED';
}

export const cashbookService = {
    /**
     * Get the current cash balance
     */
    async getCurrentBalance(): Promise<number> {
        const { data, error } = await supabase
            .from('cashbook_entries')
            .select('balance_after')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error || !data) return 0;
        return parseFloat(data.balance_after);
    },

    /**
     * Create a cashbook entry (disbursement or return)
     */
    async createEntry(entry: Omit<CashbookEntry, 'id' | 'balance_after'>): Promise<CashbookEntry> {
        const currentBalance = await this.getCurrentBalance();
        const balanceAfter = currentBalance - entry.credit + entry.debit;

        const { data, error } = await supabase
            .from('cashbook_entries')
            .insert({
                ...entry,
                balance_after: balanceAfter
            })
            .select()
            .single();

        if (error) throw new Error(`Failed to create cashbook entry: ${error.message}`);
        return data;
    },

    /**
     * Log cash disbursement
     */
    async logDisbursement(
        requisitionId: string,
        amount: number,
        cashierId: string,
        description?: string
    ): Promise<CashbookEntry> {
        return this.createEntry({
            entry_type: 'DISBURSEMENT',
            description: description || `Cash disbursed for Requisition`,
            debit: 0,
            credit: amount,
            date: new Date().toISOString().split('T')[0],
            requisition_id: requisitionId,
            created_by: cashierId,
            status: 'PENDING'
        });
    },

    /**
     * Log cash return (excess)
     */
    async logReturn(
        requisitionId: string,
        amount: number,
        userId: string,
        description?: string
    ): Promise<CashbookEntry> {
        return this.createEntry({
            entry_type: 'RETURN',
            description: description || `Excess returned for Requisition`,
            debit: amount,
            credit: 0,
            date: new Date().toISOString().split('T')[0],
            requisition_id: requisitionId,
            created_by: userId
        });
    },

    /**
     * Get cashbook entries with filters
     */
    async getEntries(filters?: {
        startDate?: string;
        endDate?: string;
        entryType?: string;
        limit?: number;
    }) {
        let query = supabase
            .from('cashbook_entries')
            .select(`
                *,
                requisitions(
                    reference_number,
                    status,
                    description,
                    actual_total,
                    requestor:users!requestor_id(name),
                    line_items(*, accounts(code, name)),
                    disbursements(*)
                ),
                users:created_by(name)
            `)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false });

        if (filters?.startDate) {
            query = query.gte('date', filters.startDate);
        }
        if (filters?.endDate) {
            query = query.lte('date', filters.endDate);
        }
        if (filters?.entryType) {
            query = query.eq('entry_type', filters.entryType);
        }
        if (filters?.limit) {
            query = query.limit(filters.limit);
        }

        const { data, error } = await query;
        if (error) throw new Error(`Failed to fetch entries: ${error.message}`);
        return data;
    },

    /**
     * Get cashbook summary for a date range
     */
    async getSummary(startDate: string, endDate: string) {
        const { data, error } = await supabase
            .from('cashbook_entries')
            .select('debit, credit, balance_after')
            .gte('date', startDate)
            .lte('date', endDate)
            .order('created_at', { ascending: true });

        if (error) throw new Error(`Failed to fetch summary: ${error.message}`);

        const openingBalance = data[0]?.balance_after - data[0]?.debit + data[0]?.credit || 0;
        const totalReceipts = data.reduce((sum: number, entry: any) => sum + parseFloat(entry.debit || '0'), 0);
        const totalPayments = data.reduce((sum: number, entry: any) => sum + parseFloat(entry.credit || '0'), 0);
        const closingBalance = data[data.length - 1]?.balance_after || openingBalance;

        return {
            openingBalance,
            totalReceipts,
            totalPayments,
            closingBalance,
            netMovement: totalReceipts - totalPayments
        };
    },

    /**
     * Finalize a disbursement entry once change is confirmed.
     * Updates the original disbursement amount, links the voucher, and recalculates subsequent balances.
     */
    async finalizeDisbursement(
        requisitionId: string,
        actualExpenditure: number,
        voucherId: string,
        discrepancy: number = 0,
        voucherNumber?: string
    ) {
        // 1. Find the original disbursement entry
        const { data: originalEntry, error: findError } = await supabase
            .from('cashbook_entries')
            .select('*')
            .eq('requisition_id', requisitionId)
            .eq('entry_type', 'DISBURSEMENT')
            .order('created_at', { ascending: false }) // Take the latest if multiple
            .limit(1)
            .single();

        if (findError || !originalEntry) {
            console.warn(`Original disbursement entry not found for requisition ${requisitionId}. Creating new entry...`);

            // Reconstruct the entry since it's missing (happened before schema fix)
            const { data: req } = await supabase
                .from('requisitions')
                .select('description, requestor_id')
                .eq('id', requisitionId)
                .single();

            const newDescription = discrepancy !== 0
                ? `Voucher ${voucherNumber || ''} (Exp: K${actualExpenditure.toFixed(2)}, Disc: K${discrepancy.toFixed(2)})`
                : `Voucher ${voucherNumber || ''} (Actual for Req #${requisitionId.slice(0, 8)})`;

            await this.createEntry({
                entry_type: 'DISBURSEMENT',
                description: newDescription,
                debit: 0,
                credit: actualExpenditure + discrepancy,
                date: new Date().toISOString().split('T')[0],
                requisition_id: requisitionId,
                created_by: req?.requestor_id,
                status: 'COMPLETED',
                voucher_id: voucherId
            });
            return;
        }

        const oldCredit = parseFloat(originalEntry.credit);
        const newCredit = actualExpenditure + discrepancy;
        const totalImpact = oldCredit - newCredit;

        const newDescription = discrepancy !== 0
            ? `Voucher ${voucherNumber || ''} (Exp: K${actualExpenditure.toFixed(2)}, Disc: K${discrepancy.toFixed(2)})`
            : `Voucher ${voucherNumber || ''} (Actual for Req #${requisitionId.slice(0, 8)})`;

        // 2. Update the original entry
        const { error: updateError } = await supabase
            .from('cashbook_entries')
            .update({
                credit: newCredit,
                description: newDescription,
                balance_after: parseFloat(originalEntry.balance_after) + totalImpact,
                status: 'COMPLETED',
                voucher_id: voucherId
            })
            .eq('id', originalEntry.id);

        if (updateError) throw updateError;

        // 3. Recalculate ALL subsequent entries to keep balance consistent
        const { data: subsequentEntries, error: subError } = await supabase
            .from('cashbook_entries')
            .select('*')
            .gt('created_at', originalEntry.created_at)
            .order('created_at', { ascending: true });

        if (subError) throw subError;

        let runningBalance = parseFloat(originalEntry.balance_after) + totalImpact;

        for (const entry of subsequentEntries) {
            const newBalance = runningBalance + parseFloat(entry.debit) - parseFloat(entry.credit);
            await supabase
                .from('cashbook_entries')
                .update({ balance_after: newBalance })
                .eq('id', entry.id);
            runningBalance = newBalance;
        }
    }
};

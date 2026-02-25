import { supabase } from '../lib/supabase';

export interface CashbookEntry {
    id?: string;
    voucher_id?: string;
    date: string;
    description: string;
    debit: number;
    credit: number;
    balance_after: number;
    entry_type: 'DISBURSEMENT' | 'RETURN' | 'ADJUSTMENT' | 'OPENING_BALANCE' | 'CLOSING_BALANCE' | 'INFLOW';
    requisition_id?: string;
    requisitions?: {
        department?: string;
        [key: string]: any; // Allow other requisition fields
    };
    created_by?: string;
    status?: 'PENDING' | 'COMPLETED';
    account_type?: string;
}

export const cashbookService = {
    /**
     * Get the current cash balance
     */
    async getCurrentBalance(accountType: string = 'CASH'): Promise<number> {
        const { data, error } = await supabase
            .from('cashbook_entries')
            .select('balance_after')
            .eq('account_type', accountType)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error || !data) return 0;
        return parseFloat(data.balance_after);
    },

    async recalculateBalancesFrom(targetDate: string, targetCreatedAt: string, accountType: string = 'CASH') {
        const { data: prevEntry } = await supabase
            .from('cashbook_entries')
            .select('balance_after')
            .eq('account_type', accountType)
            .or(`date.lt.${targetDate},and(date.eq.${targetDate},created_at.lt.${targetCreatedAt})`)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        let runningBalance = prevEntry ? parseFloat(prevEntry.balance_after) : 0;

        const { data: entries } = await supabase
            .from('cashbook_entries')
            .select('*')
            .eq('account_type', accountType)
            .or(`date.gt.${targetDate},and(date.eq.${targetDate},created_at.gte.${targetCreatedAt})`)
            .order('date', { ascending: true })
            .order('created_at', { ascending: true });

        if (!entries) return;

        for (const entry of entries) {
            const newBalance = runningBalance + parseFloat(entry.debit) - parseFloat(entry.credit);
            await supabase
                .from('cashbook_entries')
                .update({ balance_after: newBalance })
                .eq('id', entry.id);
            runningBalance = newBalance;
        }
    },

    /**
     * Create a cashbook entry (disbursement, return, inflow, adjustment, or balance)
     */
    async createEntry(entry: Omit<CashbookEntry, 'id' | 'balance_after'>): Promise<CashbookEntry> {
        const accountType = entry.account_type || 'CASH';
        // 1. Insert the entry first (we'll fix balance in a moment)
        const { data, error } = await supabase
            .from('cashbook_entries')
            .insert({
                ...entry,
                account_type: accountType,
                balance_after: 0
            })
            .select()
            .single();

        if (error) throw new Error(`Failed to create cashbook entry: ${error.message}`);

        // 2. Recalculate balances starting from this entry's logical position
        await this.recalculateBalancesFrom(data.date, data.created_at, accountType);

        // 3. Fetch the updated entry
        const { data: updatedData } = await supabase
            .from('cashbook_entries')
            .select('*')
            .eq('id', data.id)
            .single();

        return updatedData || data;
    },

    /**
     * Log cash disbursement
     */
    async logDisbursement(
        requisitionId: string,
        amount: number,
        cashierId: string,
        description?: string,
        accountType: string = 'CASH'
    ): Promise<CashbookEntry> {
        return this.createEntry({
            entry_type: 'DISBURSEMENT',
            description: description || `Cash disbursed for Requisition`,
            debit: 0,
            credit: amount,
            date: new Date().toISOString().split('T')[0],
            requisition_id: requisitionId,
            created_by: cashierId,
            status: 'PENDING',
            account_type: accountType
        });
    },

    /**
     * Log cash return (excess)
     */
    async logReturn(
        requisitionId: string,
        amount: number,
        userId: string,
        description?: string,
        accountType: string = 'CASH'
    ): Promise<CashbookEntry> {
        return this.createEntry({
            entry_type: 'RETURN',
            description: description || `Excess returned for Requisition`,
            debit: amount,
            credit: 0,
            date: new Date().toISOString().split('T')[0],
            requisition_id: requisitionId,
            created_by: userId,
            account_type: accountType
        });
    },

    /**
     * Log cash inflow
     */
    async logInflow(
        data: {
            personName: string;
            purpose: string;
            contactDetails?: string;
            amount: number;
            denominations?: any;
            accountType?: string;
        },
        userId: string
    ): Promise<CashbookEntry> {
        // 1. Create cashbook entry
        const entry = await this.createEntry({
            entry_type: 'INFLOW',
            description: `Cash Inflow: ${data.personName} - ${data.purpose}`,
            debit: data.amount,
            credit: 0,
            date: new Date().toISOString().split('T')[0],
            created_by: userId,
            account_type: data.accountType || 'CASH'
        });

        // 2. Create inflow metadata
        const { error: inflowError } = await supabase
            .from('cash_inflows')
            .insert({
                cashbook_entry_id: entry.id,
                person_name: data.personName,
                purpose: data.purpose,
                contact_details: data.contactDetails,
                denominations: data.denominations
            });

        if (inflowError) {
            console.error('Failed to create inflow metadata:', inflowError);
        }

        return entry;
    },

    /**
     * Get cashbook entries with filters
     */
    async getEntries(filters?: {
        startDate?: string;
        endDate?: string;
        entryType?: string;
        accountType?: string;
        limit?: number;
    }) {
        let query = supabase
            .from('cashbook_entries')
            .select(`
                *,
                requisitions!requisition_id (
                    id, reference_number, status, description, type, department,
                    requestor:users!requestor_id(name),
                    line_items (
                        id, description, quantity, unit_price, estimated_amount, actual_amount, account_id,
                        accounts ( id, code, name, category )
                    ),
                    qb_sync_status, qb_sync_error
                ),
                users!created_by(name)
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
        if (filters?.accountType) {
            query = query.eq('account_type', filters.accountType);
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
    async getSummary(startDate: string, endDate: string, accountType: string = 'CASH') {
        const { data, error } = await supabase
            .from('cashbook_entries')
            .select('debit, credit, balance_after')
            .eq('account_type', accountType)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: true })
            .order('created_at', { ascending: true });

        if (error) throw new Error(`Failed to fetch summary: ${error.message}`);

        const openingBalance = data.length > 0 ? parseFloat(data[0].balance_after) - parseFloat(data[0].debit) + parseFloat(data[0].credit) : 0;
        const totalReceipts = data.reduce((sum: number, entry: any) => sum + parseFloat(entry.debit || '0'), 0);
        const totalPayments = data.reduce((sum: number, entry: any) => sum + parseFloat(entry.credit || '0'), 0);
        const closingBalance = data.length > 0 ? parseFloat(data[data.length - 1].balance_after) : openingBalance;

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
     * Updates the original disbursement amount and recalculates subsequent balances.
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
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (findError || !originalEntry) {
            console.warn(`Original disbursement entry not found for requisition ${requisitionId}. Creating new entry...`);

            const { data: disb } = await supabase
                .from('disbursements')
                .select('cashier_id')
                .eq('requisition_id', requisitionId)
                .single();

            const { data: req } = await supabase
                .from('requisitions')
                .select('description, requestor_id')
                .eq('id', requisitionId)
                .single();

            const createdBy = disb?.cashier_id || req?.requestor_id;

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
                created_by: createdBy,
                status: 'COMPLETED',
                voucher_id: voucherId,
                account_type: 'CASH' // Assume default if not found
            });
            return;
        }

        const newCredit = actualExpenditure + discrepancy;
        const newDescription = discrepancy !== 0
            ? `Voucher ${voucherNumber || ''} (Exp: K${actualExpenditure.toFixed(2)}, Disc: K${discrepancy.toFixed(2)})`
            : `Voucher ${voucherNumber || ''} (Actual for Req #${requisitionId.slice(0, 8)})`;

        // 2. Update the original entry
        const { error: updateError } = await supabase
            .from('cashbook_entries')
            .update({
                credit: newCredit,
                description: newDescription,
                status: 'COMPLETED',
                voucher_id: voucherId
            })
            .eq('id', originalEntry.id);

        if (updateError) throw updateError;

        // 3. Recalculate ALL subsequent entries for the specific account type
        await this.recalculateBalancesFrom(originalEntry.date, originalEntry.created_at, originalEntry.account_type || 'CASH');
    },

    /**
     * Close the cashbook for a specific date
     */
    async closeBook(
        date: string,
        physicalCount: number,
        notes: string,
        userId: string,
        accountType: string = 'CASH'
    ) {
        // 1. Calculate system balance FOR THAT SPECIFIC DATE
        // We need the balance after all transactions on that date
        const { data: lastEntryOnDate } = await supabase
            .from('cashbook_entries')
            .select('balance_after')
            .eq('date', date)
            .eq('account_type', accountType)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        // If no entries on that date, get the latest overall before this date
        let systemBalanceAtEndOfDay = 0;
        if (lastEntryOnDate) {
            systemBalanceAtEndOfDay = parseFloat(lastEntryOnDate.balance_after);
        } else {
            const { data: lastEntryBefore } = await supabase
                .from('cashbook_entries')
                .select('balance_after')
                .eq('account_type', accountType)
                .lt('date', date)
                .order('date', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            systemBalanceAtEndOfDay = lastEntryBefore ? parseFloat(lastEntryBefore.balance_after) : 0;
        }

        const variance = physicalCount - systemBalanceAtEndOfDay;

        // 2. If variance > 0.01, create ADJUSTMENT entry
        if (Math.abs(variance) > 0.01) {
            await this.createEntry({
                entry_type: 'ADJUSTMENT',
                description: `Closing Adjustment (${variance > 0 ? 'Surplus' : 'Shortage'}): ${notes}`,
                debit: variance > 0 ? variance : 0,
                credit: variance < 0 ? Math.abs(variance) : 0,
                date: date,
                created_by: userId,
                account_type: accountType
            });
        }

        // 3. Create CLOSING_BALANCE entry
        await this.createEntry({
            entry_type: 'CLOSING_BALANCE',
            description: `Closing Balance as at ${date}`,
            debit: 0,
            credit: 0,
            date: date,
            created_by: userId,
            account_type: accountType
        });

        // 4. Create OPENING_BALANCE entry for next day
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split('T')[0];

        // Check if opening balance for next day already exists
        const { data: existingOpening } = await supabase
            .from('cashbook_entries')
            .select('id')
            .eq('date', nextDayStr)
            .eq('entry_type', 'OPENING_BALANCE')
            .eq('account_type', accountType)
            .limit(1)
            .single();

        if (!existingOpening) {
            await this.createEntry({
                entry_type: 'OPENING_BALANCE',
                description: `Opening Balance`,
                debit: 0,
                credit: 0,
                date: nextDayStr,
                created_by: userId,
                account_type: accountType
            });
        }

        return { success: true, closingBalance: physicalCount };
    }
};

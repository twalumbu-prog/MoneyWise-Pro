import { supabase } from '../lib/supabase';

export interface CashbookEntry {
    id?: string;
    voucher_id?: string;
    date: string;
    description: string;
    debit: number;
    credit: number;
    balance_after: number;
    entry_type: 'DISBURSEMENT' | 'RETURN' | 'ADJUSTMENT' | 'OPENING_BALANCE' | 'CLOSING_BALANCE' | 'INFLOW' | 'EXPENSE';
    requisition_id?: string;
    requisitions?: {
        department?: string;
        [key: string]: any; // Allow other requisition fields
    };
    created_by?: string;
    status?: 'PENDING' | 'COMPLETED' | 'DISBURSED';
    account_type?: string;
    organization_id?: string;
}

export const cashbookService = {
    /**
     * Get the current cash balance
     */
    async getCurrentBalance(organizationId: string, accountType: string = 'CASH'): Promise<number> {
        const { data, error } = await supabase
            .from('cashbook_entries')
            .select('balance_after')
            .eq('organization_id', organizationId)
            .eq('account_type', accountType)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error || !data) return 0;
        return parseFloat(data.balance_after || '0');
    },

    async recalculateBalancesFrom(organizationId: string, targetDate: string, targetCreatedAt: string, accountType: string = 'CASH') {
        console.log(`[Ledger] Recalculating balances for Org ${organizationId.slice(0, 8)}, Account ${accountType} from ${targetDate} ${targetCreatedAt.slice(11, 19)}`);

        // 1. Find the entry immediately BEFORE the target (logical temporal predecessor)
        const { data: prevEntry } = await supabase
            .from('cashbook_entries')
            .select('balance_after')
            .eq('organization_id', organizationId)
            .eq('account_type', accountType)
            .or(`date.lt.${targetDate},and(date.eq.${targetDate},created_at.lt.${targetCreatedAt})`)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        let runningBalance = prevEntry ? parseFloat(prevEntry.balance_after || '0') : 0;
        console.log(`[Ledger] Previous balance found: ${runningBalance}`);

        // 2. Fetch all entries from the target point forward (inclusive of the target)
        // We use the same temporal logic: today's remaining entries + all future entries
        const { data: entries, error } = await supabase
            .from('cashbook_entries')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('account_type', accountType)
            .or(`date.gt.${targetDate},and(date.eq.${targetDate},created_at.gte.${targetCreatedAt})`)
            .order('date', { ascending: true })
            .order('created_at', { ascending: true });

        if (error) {
            console.error(`[Ledger] Error fetching entries for recalculation:`, error);
            return;
        }

        if (!entries || entries.length === 0) {
            console.warn(`[Ledger] No entries found for recalculation at or after ${targetDate} ${targetCreatedAt}`);
            return;
        }

        console.log(`[Ledger] Updating ${entries.length} entries...`);

        for (const entry of entries) {
            const debit = parseFloat(entry.debit || '0');
            const credit = parseFloat(entry.credit || '0');
            const newBalance = runningBalance + debit - credit;
            
            const { error: updateError } = await supabase
                .from('cashbook_entries')
                .update({ balance_after: newBalance })
                .eq('id', entry.id);

            if (updateError) {
                console.error(`[Ledger] Failed to update balance for entry ${entry.id}:`, updateError);
            }
            
            runningBalance = newBalance;
        }
        console.log(`[Ledger] Finished recalculating. Final balance: ${runningBalance}`);
    },

    /**
     * Create a cashbook entry (disbursement, return, inflow, adjustment, or balance)
     */
    async createEntry(organizationId: string, entry: Omit<CashbookEntry, 'id' | 'balance_after'>): Promise<CashbookEntry> {
        const accountType = entry.account_type || 'CASH';
        // 1. Insert the entry first (we'll fix balance in a moment)
        const { data, error } = await supabase
            .from('cashbook_entries')
            .insert({
                ...entry,
                organization_id: organizationId,
                account_type: accountType,
                balance_after: 0
            })
            .select()
            .single();

        if (error) throw new Error(`Failed to create cashbook entry: ${error.message}`);

        // 2. Recalculate balances starting from this entry's logical position
        await this.recalculateBalancesFrom(organizationId, data.date, data.created_at, accountType);

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
        organizationId: string,
        requisitionId: string,
        amount: number,
        cashierId: string,
        description?: string,
        accountType: string = 'CASH'
    ): Promise<CashbookEntry> {
        return this.createEntry(organizationId, {
            entry_type: 'DISBURSEMENT',
            description: description || `Cash disbursed for Requisition`,
            debit: 0,
            credit: amount,
            date: new Date().toISOString().split('T')[0],
            requisition_id: requisitionId,
            created_by: cashierId,
            status: 'DISBURSED',  // Fixed: was 'PENDING', must match duplicate guard
            account_type: accountType
        });
    },

    /**
     * Log cash return (excess)
     */
    async logReturn(
        organizationId: string,
        requisitionId: string,
        amount: number,
        userId: string,
        description?: string,
        accountType: string = 'CASH'
    ): Promise<CashbookEntry> {
        return this.createEntry(organizationId, {
            entry_type: 'RETURN',
            description: description || `Excess returned for Requisition`,
            debit: amount,
            credit: 0,
            date: new Date().toISOString().split('T')[0],
            requisition_id: requisitionId,
            created_by: userId,
            status: 'PENDING',
            account_type: accountType
        });
    },

    /**
     * Finalize the ledger for a successful Wallet disbursement (Lenco payout)
     * Handles creating the Cashbook Entry and appending the K8.5 fee to the requisition.
     */
    async finalizeWalletDisbursementLedger(requisitionId: string): Promise<void> {
        const LENCO_TRANSACTION_FEE = 8.5;

        // 1. Fetch disbursement record
        const { data: disbursement, error: disbError } = await supabase
            .from('disbursements')
            .select('*, requisitions(status, estimated_total, actual_total)')
            .eq('requisition_id', requisitionId)
            .single();

        if (disbError || !disbursement) {
            console.error(`[Ledger Finalization] Disbursement record not found for requisition ${requisitionId}`);
            return;
        }

        // 2. Prevent Double Entry
        const { data: existingLedger } = await supabase
            .from('cashbook_entries')
            .select('id')
            .eq('requisition_id', requisitionId)
            .eq('status', 'DISBURSED')
            .maybeSingle();

        if (existingLedger) {
            console.log(`[Ledger Finalization] Ledger entry already exists for ${requisitionId}, skipping.`);
            return;
        }

        console.log(`[Ledger Finalization] Finalizing ledger for ${requisitionId}...`);
        
        // A. Log Cashbook Entry
        const totalDeduction = Number(disbursement.total_prepared);
        const mainDescription = `${disbursement.payment_method} disbursed for Requisition #${requisitionId.slice(0, 8)}`;
        
        await this.logDisbursement(
            disbursement.organization_id,
            requisitionId,
            totalDeduction,
            disbursement.cashier_id,
            mainDescription,
            disbursement.payment_method
        );

        // B. Add withdrawal fee line item
        await supabase.from('line_items').insert({
            requisition_id: requisitionId,
            description: 'Withdrawal Fee (MoneyWise Wallet)',
            quantity: 1,
            unit_price: LENCO_TRANSACTION_FEE,
            estimated_amount: LENCO_TRANSACTION_FEE,
            actual_amount: LENCO_TRANSACTION_FEE,
            account_id: '0dbe62e3-2917-4e4b-9620-6394f0029c1d' // "Transaction Charges" account
        });

        // C. Update Requisition header to include the fee
        const currentEstimated = Number(disbursement.requisitions?.estimated_total || 0);
        const currentActual = disbursement.requisitions?.actual_total ? Number(disbursement.requisitions?.actual_total) : null;
        
        await supabase.from('requisitions').update({
            estimated_total: currentEstimated + LENCO_TRANSACTION_FEE,
            actual_total: currentActual ? currentActual + LENCO_TRANSACTION_FEE : null
        }).eq('id', requisitionId);

        console.log(`[Ledger Finalization] Ledger finalized for ${requisitionId}.`);
    },

    /**
     * Log cash inflow
     */
    async logInflow(
        organizationId: string,
        data: {
            personName: string;
            purpose: string;
            contactDetails?: string;
            date?: string;
            amount: number;
            denominations?: any;
            accountType?: string;
        },
        userId: string
    ): Promise<CashbookEntry> {
        // 1. Create cashbook entry
        const entry = await this.createEntry(organizationId, {
            entry_type: 'INFLOW',
            description: `Cash Inflow: ${data.personName} - ${data.purpose}`,
            debit: data.amount,
            credit: 0,
            date: data.date || new Date().toISOString().split('T')[0],
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
    async getEntries(organizationId: string, filters?: {
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
                    disbursements (
                        id, total_prepared, actual_change_amount, confirmed_change_amount, change_submission_method, confirmed_at
                    ),
                    qb_sync_status, qb_sync_error
                ),
                users!created_by(name)
            `)
            .eq('organization_id', organizationId)
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
    async getSummary(organizationId: string, startDate: string, endDate: string, accountType: string = 'CASH') {
        const { data, error } = await supabase
            .from('cashbook_entries')
            .select('debit, credit, balance_after')
            .eq('organization_id', organizationId)
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
        organizationId: string,
        requisitionId: string,
        actualExpenditure: number,
        voucherId: string,
        discrepancy: number = 0,
        voucherNumber?: string,
        changeSubmissionMethod: string = 'CASH'
    ) {
        // 1. Find the original disbursement entry
        const { data: originalEntry, error: findError } = await supabase
            .from('cashbook_entries')
            .select('*')
            .eq('organization_id', organizationId)
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

        // 1.5 Fetch disbursement to get confirmed change for the description
        const { data: disbursement } = await supabase
            .from('disbursements')
            .select('confirmed_change_amount, change_submission_method, total_prepared')
            .eq('requisition_id', requisitionId)
            .single();

        const confirmedChange = Number(disbursement?.confirmed_change_amount || 0);
        const changeMethod = disbursement?.change_submission_method || 'CASH';
        
        let newDescription = discrepancy !== 0
            ? `Voucher ${voucherNumber || ''} (Exp: K${actualExpenditure.toFixed(2)}, Disc: K${discrepancy.toFixed(2)})`
            : `Voucher ${voucherNumber || ''} (Actual for Req #${requisitionId.slice(0, 8)})`;

        if (confirmedChange > 0) {
            newDescription += ` | Net Effect - Change of K${confirmedChange.toFixed(2)} returned via ${changeMethod}`;
        }

            await this.createEntry(organizationId, {
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

        const newDescription = discrepancy !== 0
            ? `Voucher ${voucherNumber || ''} (Exp: K${actualExpenditure.toFixed(2)}, Disc: K${discrepancy.toFixed(2)})`
            : `Voucher ${voucherNumber || ''} (Actual for Req #${requisitionId.slice(0, 8)})`;

        // 2. Update the original entry
        const { error: updateError } = await supabase
            .from('cashbook_entries')
            .update({
                credit: actualExpenditure + discrepancy,
                description: newDescription,
                status: 'COMPLETED',
                voucher_id: voucherId
            })
            .eq('id', originalEntry.id);

        if (updateError) throw updateError;

        // 3. Recalculate ALL subsequent entries for the specific account type
        await this.recalculateBalancesFrom(organizationId, originalEntry.date, originalEntry.created_at, originalEntry.account_type || 'CASH');
    },

    /**
     * Update an existing disbursement amount and recalculate balances.
     * Only allowed if the entry status is still PENDING (not yet finalized/received).
     */
    async updateDisbursementAmount(
        organizationId: string,
        requisitionId: string,
        newAmount: number,
        newDenominations?: any
    ) {
        // 1. Find the PENDING disbursement entry
        const { data: entry, error: findError } = await supabase
            .from('cashbook_entries')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('requisition_id', requisitionId)
            .eq('entry_type', 'DISBURSEMENT')
            .eq('status', 'PENDING')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (findError || !entry) {
            throw new Error(`Active disbursement entry not found or already finalized`);
        }

        // 2. Update the entry
        const { error: updateError } = await supabase
            .from('cashbook_entries')
            .update({
                credit: newAmount,
                updated_at: new Date().toISOString()
            })
            .eq('id', entry.id);

        if (updateError) throw updateError;

        // 3. Update the disbursement record denominations and total
        const { error: disbUpdateError } = await supabase
            .from('disbursements')
            .update({
                total_prepared: newAmount,
                denominations: newDenominations
            })
            .eq('requisition_id', requisitionId);

        if (disbUpdateError) throw disbUpdateError;

        // 4. Recalculate subsequent balances
        await this.recalculateBalancesFrom(organizationId, entry.date, entry.created_at, entry.account_type || 'CASH');
        
        return entry;
    },

    /**
     * Close the cashbook for a specific date
     */
    async closeBook(
        organizationId: string,
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
            .eq('organization_id', organizationId)
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
                .eq('organization_id', organizationId)
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
            await this.createEntry(organizationId, {
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
        await this.createEntry(organizationId, {
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
            .eq('organization_id', organizationId)
            .eq('date', nextDayStr)
            .eq('entry_type', 'OPENING_BALANCE')
            .eq('account_type', accountType)
            .limit(1)
            .single();

        if (!existingOpening) {
            await this.createEntry(organizationId, {
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
    },

    /**
     * Updates a disbursement's confirmed change amount.
     * Used by the Lenco webhook to handle wallet-based change submissions.
     */
    async updateDisbursementForChange(
        organizationId: string,
        reqId: string,
        amount: number,
        reference: string
    ) {
        let finalReqId = reqId;
        let reqData = null;

        // If the reqId is not a full UUID (old CHG reference format had a short 8-char ID),
        // we must perform a JS-side prefix lookup because Postgres blocks `.ilike()` on UUID columns.
        if (reqId.length < 36) {
            const { data: allReqs, error: fetchError } = await supabase
                .from('requisitions')
                .select('id')
                .eq('organization_id', organizationId);

            if (fetchError || !allReqs) {
                console.error(`[Cashbook Service] Failed to fetch requisitions for shortId lookup:`, fetchError);
                return { data: null, error: fetchError || new Error('Failed to fetch requisitions') };
            }

            const matchingReq = allReqs.find(r => r.id.startsWith(reqId));
            if (matchingReq) {
                finalReqId = matchingReq.id;
                reqData = matchingReq;
            }
        } else {
            // Find the requisition by exact UUID (the new CHG reference format includes the full UUID)
            const { data: req, error: reqError } = await supabase
                .from('requisitions')
                .select('id')
                .eq('organization_id', organizationId)
                .eq('id', reqId)
                .maybeSingle();
                
            if (req) {
                 reqData = req;
            } else if (reqError) {
                 console.error(`[Cashbook Service] Requisition look-up failed for id=${reqId}:`, reqError);
                 return { data: null, error: reqError };
            }
        }

        if (!reqData) {
            console.error(`[Cashbook Service] Requisition not found for id/shortId=${reqId}`);
            return { data: null, error: new Error('Requisition not found') };
        }

        console.log(`[Cashbook Service] Updating disbursement for req ${finalReqId} with confirmedChange=${amount}`);

        // Update the disbursement for this requisition
        const { data, error } = await supabase
            .from('disbursements')
            .update({
                confirmed_change_amount: amount,
                change_external_reference: reference,
                confirmed_at: new Date().toISOString(),
                change_submission_method: 'MONEYWISE_WALLET'
            })
            .eq('requisition_id', finalReqId)
            .select();

        return { data, error };
    }
};

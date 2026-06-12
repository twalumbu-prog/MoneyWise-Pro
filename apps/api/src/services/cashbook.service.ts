import { supabase } from '../lib/supabase';
import { LencoService } from './lenco.service';
import { RequisitionMessageService } from './requisition_message.service';

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
    status?: 'PENDING' | 'COMPLETED' | 'DISBURSED' | 'UNACCOUNTED';
    account_type?: string;
    organization_id?: string;
    reference_number?: string;
    account_id?: string;
    qb_sync_status?: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
    qb_sync_error?: string;
    qb_sync_at?: string;
    qb_expense_id?: string;
    qb_deposit_id?: string;
    wallet_id?: string;
    external_reference?: string | null;
}

export const cashbookService = {
    /**
     * Get the current cash balance
     */
    async getCurrentBalance(organizationId: string, accountType: string = 'CASH', walletId?: string): Promise<number> {
        if (accountType === 'MONEYWISE_WALLET' && !walletId) {
            const { data: wallets, error: walletsError } = await supabase
                .from('organization_wallets')
                .select('id')
                .eq('organization_id', organizationId);
            
            if (walletsError || !wallets || wallets.length === 0) return 0;
            
            let totalBalance = 0;
            for (const wallet of wallets) {
                const balance = await this.getCurrentBalance(organizationId, 'MONEYWISE_WALLET', wallet.id);
                totalBalance += balance;
            }
            return totalBalance;
        }

        let query = supabase
            .from('cashbook_entries')
            .select('balance_after')
            .eq('organization_id', organizationId)
            .eq('account_type', accountType)
            .neq('status', 'PENDING');

        if (walletId) {
            query = query.eq('wallet_id', walletId);
        } else if (accountType === 'MONEYWISE_WALLET') {
            query = query.is('wallet_id', null);
        }

        const { data, error } = await query
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error || !data) return 0;
        return parseFloat(data.balance_after || '0');
    },

    async recalculateBalancesFrom(organizationId: string, targetDate: string, targetCreatedAt: string, accountType: string = 'CASH', walletId?: string) {
        console.log(`[Ledger] Recalculating balances for Org ${organizationId.slice(0, 8)}, Account ${accountType}${walletId ? `, Wallet ${walletId.slice(0, 8)}` : ''} from ${targetDate} ${targetCreatedAt.slice(11, 19)} using RPC`);

        try {
            const { error } = await supabase.rpc('recalculate_cashbook_balances', {
                p_organization_id: organizationId,
                p_target_date: targetDate,
                p_target_created_at: targetCreatedAt,
                p_account_type: accountType,
                p_wallet_id: walletId || null
            });

            if (error) {
                console.error(`[Ledger] RPC Error recalculating balances:`, error);
                throw error;
            }
            console.log(`[Ledger] Finished recalculating via RPC.`);
        } catch (err: any) {
            console.error(`[Ledger] Failed to recalculate balances:`, err.message);
        }
    },

    /**
     * Create a cashbook entry (disbursement, return, inflow, adjustment, or balance)
     */
    async createEntry(organizationId: string, entry: Omit<CashbookEntry, 'id' | 'balance_after'>): Promise<CashbookEntry> {
        const accountType = entry.account_type || 'CASH';
        const walletId = (entry as any).wallet_id || null;
        let refNum = (entry as any).reference_number || null;

        // Auto-generate reference for certain types if not provided
        if (!refNum && ['INFLOW', 'RETURN', 'ADJUSTMENT'].includes(entry.entry_type)) {
            let prefix = entry.entry_type === 'INFLOW' ? 'CR' : 
                          entry.entry_type === 'RETURN' ? 'RT' : 'ADJ';
            
            if (entry.entry_type === 'INFLOW' && entry.description && 
                (entry.description.startsWith('Sale:') || entry.description.startsWith('Revenue:'))) {
                prefix = 'REC';
            }
            
            const { data } = await supabase.rpc('generate_sequential_reference', {
                p_org_id: organizationId,
                p_entity_type: entry.entry_type,
                p_prefix: prefix
            });
            refNum = data;
        }

        // 1. Insert the entry first (we'll fix balance in a moment)
        const { data, error } = await supabase
            .from('cashbook_entries')
            .insert({
                ...entry,
                organization_id: organizationId,
                account_type: accountType,
                wallet_id: walletId,
                reference_number: refNum,
                balance_after: 0
            })
            .select()
            .single();

        if (error) throw new Error(`Failed to create cashbook entry: ${error.message}`);

        // 2. Recalculate balances starting from this entry's logical position
        await this.recalculateBalancesFrom(organizationId, data.date, data.created_at, accountType, walletId);

        // 3. Fetch the updated entry
        const { data: updatedData } = await supabase
            .from('cashbook_entries')
            .select('*')
            .eq('id', data.id)
            .single();

        return updatedData || data;
    },

    /**
     * Finalize a PENDING wallet-deposit intent IN PLACE (no delete-then-recreate).
     *
     * The legacy finalize flow deleted the intent row and inserted a fresh entry; if
     * the insert failed (unique-index collision, reference RPC hiccup) the intent was
     * already destroyed and the payment vanished from the ledger until the periodic
     * sync re-logged it as a raw, unmatched inflow. Updating the existing row is
     * atomic: on any failure the intent survives as PENDING and the next webhook
     * retry / sync cycle can try again.
     *
     * Keeps the row's original created_at so its ledger position stays stable.
     */
    async finalizePendingIntent(
        organizationId: string,
        intentId: string,
        opts: {
            description: string;
            debit: number;
            externalReference: string;
            date?: string; // payment date; defaults to the intent's own date
            // Retried on a cross-org unique-index collision (the inflow reference
            // index is global); typically the bank transaction UUID.
            fallbackExternalReference?: string;
        }
    ): Promise<CashbookEntry> {
        const { data: intent, error: intentError } = await supabase
            .from('cashbook_entries')
            .select('*')
            .eq('id', intentId)
            .eq('organization_id', organizationId)
            .single();

        if (intentError || !intent) {
            throw new Error(`Pending intent ${intentId} not found for finalization: ${intentError?.message || 'no row'}`);
        }

        if (intent.status !== 'PENDING') {
            // Already finalized by a concurrent webhook/sync run — idempotent success.
            return intent;
        }

        const prefix = (opts.description.startsWith('Sale:') || opts.description.startsWith('Revenue:')) ? 'REC' : 'CR';
        const { data: refNum, error: refError } = await supabase.rpc('generate_sequential_reference', {
            p_org_id: organizationId,
            p_entity_type: 'INFLOW',
            p_prefix: prefix
        });
        if (refError) {
            throw new Error(`Failed to generate reference number for intent ${intentId}: ${refError.message}`);
        }

        const newDate = opts.date || intent.date;

        const applyUpdate = (externalReference: string) => supabase
            .from('cashbook_entries')
            .update({
                description: opts.description,
                debit: opts.debit,
                credit: 0,
                status: 'COMPLETED',
                external_reference: externalReference,
                reference_number: refNum,
                date: newDate
            })
            .eq('id', intentId)
            .eq('status', 'PENDING') // guard against concurrent finalization
            .select()
            .maybeSingle();

        let { data: updated, error: updateError } = await applyUpdate(opts.externalReference);

        if (updateError?.message?.includes('uniq_cashbook_inflow_per_reference')) {
            // The inflow-reference index is GLOBAL across organizations.
            const { data: winner } = await supabase
                .from('cashbook_entries')
                .select('*')
                .eq('external_reference', opts.externalReference)
                .eq('entry_type', 'INFLOW')
                .neq('id', intentId)
                .limit(1)
                .maybeSingle();

            if (winner && winner.organization_id === organizationId && winner.status !== 'PENDING') {
                // Same-org finalized entry already holds this reference (webhook raced
                // the sync): this intent is a redundant twin — remove it, return winner.
                await supabase.from('cashbook_entries').delete().eq('id', intentId).eq('status', 'PENDING');
                return winner;
            }

            if (opts.fallbackExternalReference && opts.fallbackExternalReference !== opts.externalReference) {
                // Cross-org collision (e.g. a commission-sweep credit resolving to the
                // originating org's reference): keep OUR intent, retry with a reference
                // that is unique by construction.
                ({ data: updated, error: updateError } = await applyUpdate(opts.fallbackExternalReference));
            }
        }

        if (updateError) {
            throw new Error(`Failed to finalize intent ${intentId}: ${updateError.message}`);
        }

        if (!updated) {
            // Status guard hit: another process finalized it between our read and update.
            const { data: current } = await supabase
                .from('cashbook_entries')
                .select('*')
                .eq('id', intentId)
                .single();
            return current || intent;
        }

        // Recalculate from the earlier of the old/new ledger position.
        const recalcDate = newDate < intent.date ? newDate : intent.date;
        await this.recalculateBalancesFrom(
            organizationId,
            recalcDate,
            intent.created_at,
            intent.account_type || 'MONEYWISE_WALLET',
            intent.wallet_id
        );

        const { data: fresh } = await supabase
            .from('cashbook_entries')
            .select('*')
            .eq('id', intentId)
            .single();

        return fresh || updated;
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
        accountType: string = 'CASH',
        walletId?: string
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
            account_type: accountType,
            wallet_id: walletId
        } as any);
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
     * Handles creating the Cashbook Entry and appending the transaction fee to the requisition.
     */
    async finalizeWalletDisbursementLedger(requisitionId: string, actualFee?: number): Promise<void> {
        // 1. Fetch disbursement record
        const { data: disbursement, error: disbError } = await supabase
            .from('disbursements')
            .select('*, requisitions(status, estimated_total, actual_total, wallet_id)')
            .eq('requisition_id', requisitionId)
            .single();

        if (disbError || !disbursement) {
            console.error(`[Ledger Finalization] Disbursement record not found for requisition ${requisitionId}`);
            return;
        }

        // Determine fee: Use actualFee if provided, else calculate estimate based on the NET amount.
        // We use the requisition's estimated_total because it represents the amount the user 
        // intended to transfer (the net amount) before fees were added.
        const netAmount = Number(disbursement.requisitions?.estimated_total || 0);
        const feeToUse = actualFee !== undefined ? actualFee : 
                        LencoService.calculatePayoutFee(netAmount, disbursement.payment_method || 'BANK');

        const walletId = disbursement.requisitions?.wallet_id;

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

        console.log(`[Ledger Finalization] Finalizing ledger for ${requisitionId} with fee ${feeToUse}...`);
        
        // A. Log Cashbook Entry
        const totalDeduction = netAmount + feeToUse;
        const mainDescription = `${disbursement.payment_method} disbursed for Requisition #${requisitionId.slice(0, 8)}`;
        
        await this.logDisbursement(
            disbursement.organization_id,
            requisitionId,
            totalDeduction,
            disbursement.cashier_id,
            mainDescription,
            'MONEYWISE_WALLET',
            walletId
        );

        // 2. Prevent Double Entry (Line Items)
        const { data: existingFee } = await supabase
            .from('line_items')
            .select('id')
            .eq('requisition_id', requisitionId)
            .ilike('description', '%Withdrawal Fee%')
            .maybeSingle();

        if (!existingFee) {
            // B. Add withdrawal fee line item
            const chargesAccountId = await this.getOrCreateTransactionChargesAccount(disbursement.organization_id);
            
            await supabase.from('line_items').insert({
                requisition_id: requisitionId,
                description: `Withdrawal Fee (${disbursement.payment_method || 'Wallet'})`,
                quantity: 1,
                unit_price: feeToUse,
                estimated_amount: feeToUse,
                actual_amount: feeToUse,
                account_id: chargesAccountId
            });

            // C. Update Requisition header to include the fee
            const currentEstimated = Number(disbursement.requisitions?.estimated_total || 0);
            const currentActual = disbursement.requisitions?.actual_total ? Number(disbursement.requisitions?.actual_total) : null;
            
            await supabase.from('requisitions').update({
                estimated_total: currentEstimated + feeToUse,
                actual_total: currentActual ? currentActual + feeToUse : null
            }).eq('id', requisitionId);
        }

        console.log(`[Ledger Finalization] Ledger finalized for ${requisitionId}.`);
        
        // D. Trigger message repair to show DISBURSAL_SUCCESS card
        await RequisitionMessageService.repairLifecycleMessages(requisitionId).catch(err => 
            console.error(`[Ledger Finalization] Failed to repair messages for ${requisitionId}:`, err)
        );
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
    async getEntries(organizationId: string, filters: {
        startDate?: string;
        endDate?: string;
        entryType?: string;
        accountType?: string;
        walletId?: string;
        limit?: number;
    } = {}): Promise<CashbookEntry[]> {
        let query = supabase
            .from('cashbook_entries')
            .select(`
                *,
                requisitions!requisition_id (
                    id, reference_number, status, description, type, department,
                    requestor:users!requestor_id(name),
                    line_items (
                        id, description, quantity, unit_price, estimated_amount, actual_amount, account_id,
                        employee_id, employee_name, payment_method, recipient_account, recipient_bank_code, verified_name, is_valid, error_message,
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
        if (filters?.walletId) {
            query = query.eq('wallet_id', filters.walletId);
        }
        if (filters?.limit) {
            query = query.limit(filters.limit);
        }

        const { data, error } = await query;
        if (error) throw new Error(`Failed to fetch entries: ${error.message}`);
        return data || [];
    },

    /**
     * Get cashbook summary for a date range
     */
    async getSummary(organizationId: string, startDate: string, endDate: string, accountType: string = 'CASH', walletId?: string) {
        if (accountType === 'MONEYWISE_WALLET' && !walletId) {
            const { data: wallets } = await supabase
                .from('organization_wallets')
                .select('id')
                .eq('organization_id', organizationId);
            
            let openingBalance = 0;
            let totalReceipts = 0;
            let totalPayments = 0;
            let closingBalance = 0;
            
            if (wallets && wallets.length > 0) {
                for (const wallet of wallets) {
                    const s = await this.getSummary(organizationId, startDate, endDate, 'MONEYWISE_WALLET', wallet.id);
                    openingBalance += s.openingBalance;
                    totalReceipts += s.totalReceipts;
                    totalPayments += s.totalPayments;
                    closingBalance += s.closingBalance;
                }
            }
            
            return {
                openingBalance,
                totalReceipts,
                totalPayments,
                closingBalance,
                netMovement: totalReceipts - totalPayments
            };
        }

        let summaryQuery = supabase
            .from('cashbook_entries')
            .select('debit, credit, balance_after')
            .eq('organization_id', organizationId)
            .eq('account_type', accountType)
            .gte('date', startDate)
            .lte('date', endDate);

        if (walletId) {
            summaryQuery = summaryQuery.eq('wallet_id', walletId);
        } else if (accountType === 'MONEYWISE_WALLET') {
            summaryQuery = summaryQuery.is('wallet_id', null);
        }

        const { data, error } = await summaryQuery
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
            // No DISBURSEMENT cashbook entry is linked to this requisition. This happens when the
            // ledger was rebuilt from the bank source-of-truth (Lenco reconcile), where the real
            // outflow is recorded as a raw bank expense with requisition_id = null. The money has
            // ALREADY left the wallet, so creating a brand-new DISBURSEMENT here would double-count
            // it — that was the cause of the negative-balance bug (a phantom "Net Effect" outflow).
            //
            // Never fabricate an outflow. Instead try to ADOPT the matching unlinked wallet outflow
            // (matched on the gross prepared amount) and net the change into it. If none matches,
            // leave the ledger untouched and flag for manual reconciliation.
            console.warn(`[finalizeDisbursement] No linked disbursement entry for requisition ${requisitionId}; attempting to adopt an existing unlinked outflow instead of creating one.`);

            const { data: disbursement } = await supabase
                .from('disbursements')
                .select('total_prepared')
                .eq('requisition_id', requisitionId)
                .single();

            const { data: req } = await supabase
                .from('requisitions')
                .select('wallet_id')
                .eq('id', requisitionId)
                .single();

            const walletId = req?.wallet_id || null;
            const grossDisbursed = Number(disbursement?.total_prepared || 0);

            let adoptable: any = null;
            if (walletId && grossDisbursed > 0) {
                const { data } = await supabase
                    .from('cashbook_entries')
                    .select('id, date, created_at, account_type, wallet_id')
                    .eq('organization_id', organizationId)
                    .eq('wallet_id', walletId)
                    .is('requisition_id', null)
                    .in('entry_type', ['DISBURSEMENT', 'EXPENSE'])
                    .gte('credit', grossDisbursed - 0.01)
                    .lte('credit', grossDisbursed + 0.01)
                    .order('date', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                adoptable = data;
            }

            if (adoptable) {
                const newDescription = discrepancy !== 0
                    ? `Voucher ${voucherNumber || ''} (Exp: K${actualExpenditure.toFixed(2)}, Disc: K${discrepancy.toFixed(2)})`
                    : `Voucher ${voucherNumber || ''} (Actual for Req #${requisitionId.slice(0, 8)})`;

                console.warn(`[finalizeDisbursement] Adopting unlinked outflow ${adoptable.id} for requisition ${requisitionId}; netting change into it (new amount K${(actualExpenditure + discrepancy).toFixed(2)}).`);
                await supabase
                    .from('cashbook_entries')
                    .update({
                        requisition_id: requisitionId,
                        credit: actualExpenditure + discrepancy,
                        description: newDescription,
                        status: 'COMPLETED',
                        voucher_id: voucherId
                    })
                    .eq('id', adoptable.id);

                await this.recalculateBalancesFrom(organizationId, adoptable.date, adoptable.created_at, adoptable.account_type || 'CASH', adoptable.wallet_id);
            } else {
                console.error(`[finalizeDisbursement] No disbursement ledger entry found for requisition ${requisitionId} and no unlinked outflow (gross K${grossDisbursed.toFixed(2)}) to adopt. Skipping ledger write to avoid double-counting — manual reconciliation required.`);
            }
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

        // 3. Recalculate ALL subsequent entries for the specific account type and wallet
        await this.recalculateBalancesFrom(organizationId, originalEntry.date, originalEntry.created_at, originalEntry.account_type || 'CASH', originalEntry.wallet_id);
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
        await this.recalculateBalancesFrom(organizationId, entry.date, entry.created_at, entry.account_type || 'CASH', entry.wallet_id);
        
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
        accountType: string = 'CASH',
        walletId?: string
    ) {
        // 1. Calculate system balance FOR THAT SPECIFIC DATE
        // We need the balance after all transactions on that date
        let balanceQuery = supabase
            .from('cashbook_entries')
            .select('balance_after')
            .eq('organization_id', organizationId)
            .eq('date', date)
            .eq('account_type', accountType)
            .neq('status', 'PENDING');

        if (walletId) {
            balanceQuery = balanceQuery.eq('wallet_id', walletId);
        } else if (accountType === 'MONEYWISE_WALLET') {
            balanceQuery = balanceQuery.is('wallet_id', null);
        }

        const { data: lastEntryOnDate } = await balanceQuery
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        // If no entries on that date, get the latest overall before this date
        let systemBalanceAtEndOfDay = 0;
        if (lastEntryOnDate) {
            systemBalanceAtEndOfDay = parseFloat(lastEntryOnDate.balance_after);
        } else {
            let beforeQuery = supabase
                .from('cashbook_entries')
                .select('balance_after')
                .eq('organization_id', organizationId)
                .eq('account_type', accountType)
                .lt('date', date)
                .neq('status', 'PENDING');

            if (walletId) {
                beforeQuery = beforeQuery.eq('wallet_id', walletId);
            } else if (accountType === 'MONEYWISE_WALLET') {
                beforeQuery = beforeQuery.is('wallet_id', null);
            }

            const { data: lastEntryBefore } = await beforeQuery
                .order('date', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
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
                account_type: accountType,
                wallet_id: walletId
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
            account_type: accountType,
            wallet_id: walletId
        });

        // 4. Create OPENING_BALANCE entry for next day
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split('T')[0];

        // Check if opening balance for next day already exists
        let openingQuery = supabase
            .from('cashbook_entries')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('date', nextDayStr)
            .eq('entry_type', 'OPENING_BALANCE')
            .eq('account_type', accountType);

        if (walletId) {
            openingQuery = openingQuery.eq('wallet_id', walletId);
        } else if (accountType === 'MONEYWISE_WALLET') {
            openingQuery = openingQuery.is('wallet_id', null);
        }

        const { data: existingOpening } = await openingQuery
            .limit(1)
            .maybeSingle();

        if (!existingOpening) {
            await this.createEntry(organizationId, {
                entry_type: 'OPENING_BALANCE',
                description: `Opening Balance`,
                debit: 0,
                credit: 0,
                date: nextDayStr,
                created_by: userId,
                account_type: accountType,
                wallet_id: walletId
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
    },

    /**
     * Finds or creates the standard "Transaction Charges" expense account for an organization.
     */
    async getOrCreateTransactionChargesAccount(organizationId: string): Promise<string> {
        // 1. Try to find the account
        const { data: existing, error } = await supabase
            .from('accounts')
            .select('id')
            .eq('organization_id', organizationId)
            // Look for common variants
            .or('name.ilike.Transaction Charges,name.ilike.Bank charges,name.ilike.Withdrawal charges')
            .limit(1)
            .maybeSingle();

        if (existing) {
            return existing.id;
        }

        // 2. Create if missing
        console.log(`[Ledger] Creating 'Transaction Charges' account for org ${organizationId}`);
        const { data: newAccount, error: createError } = await supabase
            .from('accounts')
            .insert({
                organization_id: organizationId,
                name: 'Transaction Charges',
                type: 'EXPENSE',
                code: 'QB-28', // Standardizing on the QB-28 code the user mentioned
                description: 'Automated bank and transaction fees'
            })
            .select('id')
            .single();

        if (createError) {
            console.error(`[Ledger] FAILED to create charges account for ${organizationId}:`, createError);
            // Even if it fails, the transaction will just be uncategorized (null), handled gracefully in UI.
            return '';
        }

        return newAccount.id;
    },

    /**
     * Finds or creates the standard "Wages and salaries control" liability account for an organization.
     */
    async getOrCreateWagesAndSalariesControlAccount(organizationId: string): Promise<string> {
        // 1. Try to find the account
        const { data: existing } = await supabase
            .from('accounts')
            .select('id')
            .eq('organization_id', organizationId)
            .or('name.ilike.Wages and salaries control,code.eq.QB-48')
            .limit(1)
            .maybeSingle();

        if (existing) {
            return existing.id;
        }

        // 2. Create if missing
        console.log(`[Ledger] Creating 'Wages and salaries control' account for org ${organizationId}`);
        const { data: newAccount, error: createError } = await supabase
            .from('accounts')
            .insert({
                organization_id: organizationId,
                name: 'Wages and salaries control',
                type: 'LIABILITY',
                code: 'QB-48',
                description: 'Automated wages and salaries control account'
            })
            .select('id')
            .single();

        if (createError) {
            console.error(`[Ledger] FAILED to create wages and salaries control account for ${organizationId}:`, createError);
            return '';
        }

        return newAccount.id;
    }
};

import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';
import { triggerAIReview } from '../controllers/requisition.controller';

async function runTest() {
    console.log('='.repeat(60));
    console.log('TEST: Batch Payroll Processing & Settlement Integration Test');
    console.log('='.repeat(60));

    // 1. Resolve organization and user
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, name, organization_id, role')
        .eq('role', 'ADMIN')
        .limit(1)
        .single();

    if (userError || !user) {
        console.error('❌ Failed to fetch user for test context:', userError);
        process.exit(1);
    }

    const organizationId = user.organization_id;
    console.log(`Using User: ${user.name} (${user.id})`);
    console.log(`Using Org: ${organizationId}`);

    // Ensure org is in payment test mode for simulation
    await supabase
        .from('organizations')
        .update({ payment_test_mode: true })
        .eq('id', organizationId);

    console.log('✅ Organization set to payment_test_mode = true');

    // 2. Create PAYROLL requisition header
    const { data: requisition, error: reqError } = await supabase
        .from('requisitions')
        .insert({
            organization_id: organizationId,
            requestor_id: user.id,
            description: 'Monthly Salary Batch Payout - May 2026',
            estimated_total: 15500,
            status: 'DRAFT',
            type: 'PAYROLL',
            department: 'Finance'
        })
        .select()
        .single();

    if (reqError || !requisition) {
        console.error('❌ Failed to create payroll requisition header:', reqError);
        process.exit(1);
    }

    const reqId = requisition.id;
    console.log(`✅ Created Requisition: ${requisition.description} (ID: ${reqId})`);

    // 3. Create Line Items (1 Bank, 1 Mobile Money, 1 Invalid bank details to test correction)
    const lineItemsToInsert = [
        {
            requisition_id: reqId,
            description: 'Salary Payout - John Doe',
            quantity: 1,
            unit_price: 5000,
            estimated_amount: 5000,
            employee_id: 'EMP-001',
            employee_name: 'John Doe',
            payment_method: 'BANK',
            recipient_account: '1020304050',
            recipient_bank_code: 'ZABRZX', // Mock code
            is_valid: true
        },
        {
            requisition_id: reqId,
            description: 'Salary Payout - Jane Smith',
            quantity: 1,
            unit_price: 6000,
            estimated_amount: 6000,
            employee_id: 'EMP-002',
            employee_name: 'Jane Smith',
            payment_method: 'MOBILE_MONEY',
            recipient_account: '0977112233',
            recipient_bank_code: 'mtn',
            is_valid: true
        },
        {
            requisition_id: reqId,
            description: 'Salary Payout - Failed Guy',
            quantity: 1,
            unit_price: 4500,
            estimated_amount: 4500,
            employee_id: 'EMP-003',
            employee_name: 'Failed Guy',
            payment_method: 'BANK',
            recipient_account: '111111', // Invalid short account
            recipient_bank_code: 'INVALID_BANK_CODE',
            is_valid: false,
            error_message: 'Invalid bank account details'
        }
    ];

    const { data: insertedItems, error: itemsError } = await supabase
        .from('line_items')
        .insert(lineItemsToInsert)
        .select();

    if (itemsError || !insertedItems) {
        console.error('❌ Failed to insert line items:', itemsError);
        process.exit(1);
    }

    console.log(`✅ Inserted ${insertedItems.length} line items.`);
    console.log('--- Line Items Status ---');
    insertedItems.forEach(item => {
        console.log(`  - ${item.employee_name}: Valid=${item.is_valid}, Error=${item.error_message}, Account=${item.recipient_account}`);
    });

    // 4. Update Failed Guy's verification details inline (simulate frontend fix)
    console.log('\n--- Correcting failed verification details inline ---');
    const failedItem = insertedItems.find(item => item.employee_name === 'Failed Guy');
    if (!failedItem) throw new Error('Could not find Failed Guy');

    // Simulate calling the updateLineItemDetails endpoint
    const { data: updatedItem, error: updateError } = await supabase
        .from('line_items')
        .update({
            recipient_account: '9876543210',
            recipient_bank_code: 'BARCZX', // Corrected code
            is_valid: true,
            error_message: null,
            verified_name: 'Test Verified: Failed Guy' // Test mode simulation
        })
        .eq('id', failedItem.id)
        .select()
        .single();

    if (updateError || !updatedItem) {
        console.error('❌ Failed to update line item details:', updateError);
        process.exit(1);
    }

    console.log(`✅ Corrected Failed Guy. Valid=${updatedItem.is_valid}, Verified Name=${updatedItem.verified_name}, Account=${updatedItem.recipient_account}`);

    // Move status to AUTHORISED for disbursement
    await supabase
        .from('requisitions')
        .update({ status: 'AUTHORISED' })
        .eq('id', reqId);

    console.log('✅ Requisition status updated to AUTHORISED.');

    // 5. Execute batch payroll disbursement (simulate disbursePayrollRequisition controller logic)
    console.log('\n--- Executing batch payroll disbursement ---');

    // In simulation: we iterate through valid line items, create disbursements, and log a consolidated ledger entry.
    // Let's call the controller handler logic by simulating its database updates.
    const { data: validItems } = await supabase
        .from('line_items')
        .select('*')
        .eq('requisition_id', reqId)
        .eq('is_valid', true);

    if (!validItems || validItems.length === 0) {
        console.error('❌ No valid line items to disburse!');
        process.exit(1);
    }

    console.log(`Found ${validItems.length} valid items to disburse.`);
    
    // Simulate disbursing each item
    for (const item of validItems) {
        const amount = Number(item.estimated_amount);
        const fee = 5.0; // simulated tariff fee
        const reference = `SIM-P-${reqId.slice(0, 8)}-${item.id.slice(0, 8)}`;

        await supabase.from('disbursements').insert({
            requisition_id: reqId,
            line_item_id: item.id,
            cashier_id: user.id,
            organization_id: organizationId,
            payment_method: item.payment_method,
            total_prepared: amount,
            recipient_account: item.recipient_account,
            recipient_bank_code: item.recipient_bank_code,
            recipient_account_name: item.verified_name || item.employee_name,
            external_reference: reference,
            issued_at: new Date().toISOString()
        });

        await supabase
            .from('line_items')
            .update({ actual_amount: amount })
            .eq('id', item.id);

        console.log(`  - Payout simulated for ${item.employee_name} of K${amount}. Reference: ${reference}`);
    }

    // consolidated ledger entry
    const totalAmountPaid = validItems.reduce((sum, d) => sum + Number(d.estimated_amount), 0);
    const totalFees = validItems.length * 5.0;
    const totalDeduction = totalAmountPaid + totalFees;

    console.log(`Consolidated Payout: Amount=K${totalAmountPaid}, Fees=K${totalFees}, Total=K${totalDeduction}`);

    // Log the consolidated entry in ledger
    const ledgerDescription = `Batch Payroll payout for Requisition #${reqId.slice(0, 8)} (${validItems.length} employees)`;
    const ledgerEntry = await cashbookService.logDisbursement(
        organizationId,
        reqId,
        totalDeduction,
        user.id,
        ledgerDescription,
        'MONEYWISE_WALLET'
    );

    console.log(`✅ Consolidated ledger entry logged: ID=${ledgerEntry.id}, Credit=K${ledgerEntry.credit}, Desc="${ledgerEntry.description}"`);

    // Insert Withdrawal Fee item
    const chargesAccountId = await cashbookService.getOrCreateTransactionChargesAccount(organizationId);
    await supabase.from('line_items').insert({
        requisition_id: reqId,
        description: `Withdrawal Fee (Payroll Batch)`,
        quantity: 1,
        unit_price: totalFees,
        estimated_amount: totalFees,
        actual_amount: totalFees,
        account_id: chargesAccountId
    });

    // Update totals
    await supabase.from('requisitions').update({
        status: 'RECEIVED',
        estimated_total: totalAmountPaid + totalFees,
        actual_total: totalAmountPaid + totalFees
    }).eq('id', reqId);

    console.log('✅ Requisition status updated to RECEIVED and totals adjusted.');

    // 6. Trigger AI categorization review bypass and post deterministically
    console.log('\n--- Running deterministic categorization rules ---');
    await triggerAIReview(reqId, organizationId, user.id);

    // Verify results
    const { data: finalItems } = await supabase
        .from('line_items')
        .select('description, account_id, accounts(name, code)')
        .eq('requisition_id', reqId);

    console.log('--- Final Accounting Classifications ---');
    finalItems?.forEach(item => {
        const acc = (Array.isArray(item.accounts) ? item.accounts[0] : item.accounts) as any;
        console.log(`  - Line: "${item.description}" -> Account: ${acc?.name || 'UNMAPPED'} (Code: ${acc?.code || 'UNMAPPED'})`);
    });

    const wagesCount = finalItems?.filter(i => {
        const acc = (Array.isArray(i.accounts) ? i.accounts[0] : i.accounts) as any;
        return acc?.code === 'QB-48';
    }).length;
    const feesCount = finalItems?.filter(i => {
        const acc = (Array.isArray(i.accounts) ? i.accounts[0] : i.accounts) as any;
        return acc?.code === 'QB-28' || acc?.code === 'QB-27';
    }).length;

    if (wagesCount === 3 && feesCount === 1) {
        console.log('\n✅ SUCCESS: All line items correctly mapped (Wages Control QB-48, Transaction Charges/Bank Charges QB-28/QB-27).');
    } else {
        console.error(`\n❌ FAILED: Unexpected mapping counts. Wages Count=${wagesCount}/3, Fees Count=${feesCount}/1`);
    }

    console.log('='.repeat(60));
    console.log('TEST COMPLETE');
    console.log('='.repeat(60));
}

runTest()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Fatal test error:', err);
        process.exit(1);
    });

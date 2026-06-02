-- Migration to fix delete_organization_data RPC dependencies
CREATE OR REPLACE FUNCTION public.delete_organization_data(org_id UUID) RETURNS void AS $$
BEGIN
    -- 1. Cash inflows linked to cashbook entries of this organization
    DELETE FROM public.cash_inflows 
    WHERE cashbook_entry_id IN (
        SELECT id FROM public.cashbook_entries WHERE organization_id = org_id
    );

    -- 2. Cashbook entries (linked to organization directly, or to vouchers of the organization)
    DELETE FROM public.cashbook_entries 
    WHERE organization_id = org_id 
       OR voucher_id IN (SELECT id FROM public.vouchers WHERE organization_id = org_id);

    -- 3. Voucher lines (linked to vouchers of the organization)
    DELETE FROM public.voucher_lines 
    WHERE voucher_id IN (SELECT id FROM public.vouchers WHERE organization_id = org_id);

    -- 4. Vouchers
    DELETE FROM public.vouchers WHERE organization_id = org_id;

    -- 5. Receipts (linked to requisitions of the organization)
    DELETE FROM public.receipts 
    WHERE requisition_id IN (SELECT id FROM public.requisitions WHERE organization_id = org_id);

    -- 6. Disbursements (linked to organization, or to requisitions of the organization)
    DELETE FROM public.disbursements 
    WHERE organization_id = org_id 
       OR requisition_id IN (SELECT id FROM public.requisitions WHERE organization_id = org_id);

    -- 7. AI Classification logs (linked to requisitions of the organization)
    DELETE FROM public.ai_classification_logs 
    WHERE transaction_id IN (SELECT id FROM public.requisitions WHERE organization_id = org_id);

    -- 8. Requisition messages (linked to requisitions of the organization)
    DELETE FROM public.requisition_messages 
    WHERE requisition_id IN (SELECT id FROM public.requisitions WHERE organization_id = org_id);

    -- 9. Sync logs (linked to requisitions of the organization)
    DELETE FROM public.sync_logs 
    WHERE requisition_id IN (SELECT id FROM public.requisitions WHERE organization_id = org_id);

    -- 10. Line items (linked to requisitions of the organization)
    DELETE FROM public.line_items 
    WHERE requisition_id IN (SELECT id FROM public.requisitions WHERE organization_id = org_id);

    -- 11. Requisitions
    DELETE FROM public.requisitions WHERE organization_id = org_id;

    -- 12. Nullify references to accounts of this organization in global tables
    -- Update AI transaction memory
    UPDATE public.ai_transaction_memory 
    SET system_account_id = NULL 
    WHERE system_account_id IN (SELECT id FROM public.accounts WHERE organization_id = org_id);

    -- Update Accounting rules
    UPDATE public.accounting_rules 
    SET target_account_id = NULL 
    WHERE target_account_id IN (SELECT id FROM public.accounts WHERE organization_id = org_id);

    -- 13. Accounts
    DELETE FROM public.accounts WHERE organization_id = org_id;

    -- 14. Integrations
    DELETE FROM public.integrations WHERE organization_id = org_id;

    -- 15. Budgets
    DELETE FROM public.budgets WHERE organization_id = org_id;

    -- 16. Reference counters
    DELETE FROM public.reference_counters WHERE organization_id = org_id;

    -- 17. Organization wallets
    DELETE FROM public.organization_wallets WHERE organization_id = org_id;

    -- 18. Audit logs of the organization's users
    DELETE FROM public.audit_logs 
    WHERE user_id IN (SELECT id FROM public.users WHERE organization_id = org_id);

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

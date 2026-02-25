-- Create RPC to delete all data related to an organization
CREATE OR REPLACE FUNCTION public.delete_organization_data(org_id UUID) RETURNS void AS $$
BEGIN
    -- 1. Cashbook & Vouchers (Dependencies on Vouchers)
    DELETE FROM cashbook_entries WHERE voucher_id IN (SELECT id FROM vouchers WHERE organization_id = org_id);
    DELETE FROM voucher_lines WHERE voucher_id IN (SELECT id FROM vouchers WHERE organization_id = org_id);
    DELETE FROM vouchers WHERE organization_id = org_id;

    -- 2. Receipt Line Items & Disbursements (Dependencies on Requisitions)
    DELETE FROM receipts WHERE requisition_id IN (SELECT id FROM requisitions WHERE organization_id = org_id);
    DELETE FROM disbursements WHERE requisition_id IN (SELECT id FROM requisitions WHERE organization_id = org_id);
    DELETE FROM line_items WHERE requisition_id IN (SELECT id FROM requisitions WHERE organization_id = org_id);
    
    -- 3. Requisitions
    DELETE FROM requisitions WHERE organization_id = org_id;

    -- 4. Settings & Config
    DELETE FROM accounts WHERE organization_id = org_id;
    DELETE FROM integrations WHERE organization_id = org_id;
    
    -- 5. Audit Logs
    DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE organization_id = org_id);

    -- Note: Users and the Organization record itself will be deleted safely by the backend Admin API
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

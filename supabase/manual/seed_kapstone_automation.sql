-- Kapstone Capital: forward every deposit to Stephen Kapambwe's FNB account and
-- email a Proof of Payment to smkapambwe9@gmail.com.
--
-- Preferred route is Intelligence -> Automations -> "New automation", which
-- verifies the account with the bank first. This seeds it directly and does NOT
-- verify the account. Run after migration 20260930120000_automations.sql.
-- watch_from = now(), so only deposits made after this runs are forwarded.

INSERT INTO public.automations (
    organization_id, created_by, name, description,
    trigger_type, trigger_config, actions, status, watch_from
)
SELECT
    '0dfe477d-2ee3-4d2b-a20f-f5c3a751d951',
    '215d63dc-8f4a-4993-a6a5-100ad44b4c1d',
    'Forward investment deposits to Stephen Kapambwe (FNB)',
    'Every deposit into the Kapstone Capital wallet is forwarded to FNB 63095681243 and a Proof of Payment is emailed.',
    'WALLET_DEPOSIT',
    jsonb_build_object('wallet_id', 'b0611c26-8f6e-4ca6-b90d-28d366f59483'),
    jsonb_build_array(
        jsonb_build_object(
            'type', 'FORWARD_PAYMENT',
            'recipient_account', '63095681243',
            'recipient_bank_code', 'FNB',
            'recipient_bank_name', 'FNB',
            'recipient_name', 'Stephen Kapambwe',
            'payment_method', 'BANK_TRANSFER',
            'fee_mode', 'AUTO'
        ),
        jsonb_build_object('type', 'SEND_POP_EMAIL', 'to', 'smkapambwe9@gmail.com')
    ),
    'ACTIVE',
    now()
WHERE NOT EXISTS (
    SELECT 1 FROM public.automations
    WHERE organization_id = '0dfe477d-2ee3-4d2b-a20f-f5c3a751d951' AND status <> 'ARCHIVED'
);

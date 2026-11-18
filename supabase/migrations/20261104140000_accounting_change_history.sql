-- A history of changes to the things an accountant has to be able to explain: the chart of accounts, hand-made and imported journals,
-- changes to cashbook classifications, supplier bills, customer invoices and the period lock. Written by the database itself, so it
-- covers edits made anywhere in the app. Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.accounting_changes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    table_name      TEXT NOT NULL,
    row_id          UUID,
    op              TEXT NOT NULL CHECK (op IN ('INSERT','UPDATE','DELETE')),
    changed         JSONB NOT NULL,                   -- INSERT/DELETE: the whole row; UPDATE: { column: { from, to } } for what changed
    actor           UUID,                             -- who, where the row itself says so (updated_by or created_by)
    at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_accounting_changes_org ON public.accounting_changes (organization_id, at DESC);
ALTER TABLE public.accounting_changes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.accounting_changes TO service_role;

-- TG_ARGV[0] is the comma-separated list of columns whose changes are worth recording (empty = all but updated_at).
-- Logging must never stop real work, so any failure inside is swallowed.
CREATE OR REPLACE FUNCTION public.log_accounting_change() RETURNS trigger LANGUAGE plpgsql AS $log$
DECLARE
    o JSONB; n JSONB; org UUID; k TEXT; diff JSONB := '{}'::jsonb; watch TEXT[];
BEGIN
    IF TG_OP = 'DELETE' THEN o := to_jsonb(OLD); n := NULL; ELSIF TG_OP = 'INSERT' THEN o := NULL; n := to_jsonb(NEW); ELSE o := to_jsonb(OLD); n := to_jsonb(NEW); END IF;
    -- Entries the system posts on its own (cashbook, MasterFees) are rebuilt all the time and are not edits.
    IF TG_TABLE_NAME = 'journal_entries' AND COALESCE(n->>'source_type', o->>'source_type') IN ('CASHBOOK','MASTERFEES','LINE_ITEMS') THEN RETURN NULL; END IF;
    org := NULLIF(COALESCE(n->>'organization_id', o->>'organization_id'), '')::uuid;
    IF TG_OP = 'UPDATE' THEN
        watch := CASE WHEN COALESCE(TG_ARGV[0], '') = '' THEN NULL ELSE string_to_array(TG_ARGV[0], ',') END;
        FOR k IN SELECT jsonb_object_keys(n) LOOP
            CONTINUE WHEN k = 'updated_at';
            CONTINUE WHEN watch IS NOT NULL AND NOT (k = ANY (watch));
            IF o->k IS DISTINCT FROM n->k THEN diff := diff || jsonb_build_object(k, jsonb_build_object('from', o->k, 'to', n->k)); END IF;
        END LOOP;
        IF diff = '{}'::jsonb THEN RETURN NULL; END IF;
    ELSE
        diff := COALESCE(n, o);
    END IF;
    INSERT INTO public.accounting_changes (organization_id, table_name, row_id, op, changed, actor)
    VALUES (org, TG_TABLE_NAME, NULLIF(COALESCE(n->>'id', o->>'id'), '')::uuid, TG_OP, diff,
            NULLIF(COALESCE(n->>'updated_by', n->>'created_by', o->>'updated_by', o->>'created_by'), '')::uuid);
    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$log$;

DROP TRIGGER IF EXISTS trg_log_accounts ON public.accounts;
CREATE TRIGGER trg_log_accounts AFTER INSERT OR UPDATE OR DELETE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.log_accounting_change('code,name,type,subtype,is_active,qb_account_id,sage_account_id');
DROP TRIGGER IF EXISTS trg_log_cashbook ON public.cashbook_entries;
CREATE TRIGGER trg_log_cashbook AFTER UPDATE OR DELETE ON public.cashbook_entries FOR EACH ROW EXECUTE FUNCTION public.log_accounting_change('account_id,description,debit,credit,date');
DROP TRIGGER IF EXISTS trg_log_journals ON public.journal_entries;
CREATE TRIGGER trg_log_journals AFTER INSERT OR UPDATE OR DELETE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.log_accounting_change('entry_date,description,reference_number');
DROP TRIGGER IF EXISTS trg_log_suppliers ON public.suppliers;
CREATE TRIGGER trg_log_suppliers AFTER INSERT OR UPDATE OR DELETE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.log_accounting_change('name,tax_number,payment_terms_days,is_active,payout_method,payout_account,payout_bank_code');
DROP TRIGGER IF EXISTS trg_log_bills ON public.purchase_bills;
CREATE TRIGGER trg_log_bills AFTER INSERT OR UPDATE OR DELETE ON public.purchase_bills FOR EACH ROW EXECUTE FUNCTION public.log_accounting_change('status,total,due_date,bill_date,supplier_id');
DROP TRIGGER IF EXISTS trg_log_invoices ON public.customer_invoices;
CREATE TRIGGER trg_log_invoices AFTER UPDATE OR DELETE ON public.customer_invoices FOR EACH ROW EXECUTE FUNCTION public.log_accounting_change('status,total,voided_at,issue_date,follow_up_date,customer_id');
DROP TRIGGER IF EXISTS trg_log_settings ON public.accounting_settings;
CREATE TRIGGER trg_log_settings AFTER INSERT OR UPDATE OR DELETE ON public.accounting_settings FOR EACH ROW EXECUTE FUNCTION public.log_accounting_change('locked_through');
NOTIFY pgrst, 'reload config';

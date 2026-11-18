-- Accounting controls: lock a period so past figures can't change, and the query behind the cash flow statement.
-- Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.accounting_settings (
    organization_id UUID PRIMARY KEY,
    locked_through  DATE,                              -- no entry dated on or before this day can be added, changed or removed
    updated_by      UUID,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.accounting_settings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.accounting_settings TO service_role;

-- Enforced in the database so every way of writing to the ledger (cashbook, invoices, imports, journals) obeys it.
CREATE OR REPLACE FUNCTION public.guard_locked_period() RETURNS trigger LANGUAGE plpgsql AS $guard$
DECLARE
    lock_date DATE;
    d DATE;
BEGIN
    IF TG_TABLE_NAME = 'journal_entries' THEN
        IF TG_OP IN ('UPDATE', 'DELETE') THEN
            SELECT locked_through INTO lock_date FROM public.accounting_settings WHERE organization_id = OLD.organization_id;
            IF lock_date IS NOT NULL AND OLD.entry_date <= lock_date THEN
                RAISE EXCEPTION 'The books are locked through %. Entries on or before that date cannot be changed.', lock_date;
            END IF;
        END IF;
        IF TG_OP IN ('INSERT', 'UPDATE') THEN
            SELECT locked_through INTO lock_date FROM public.accounting_settings WHERE organization_id = NEW.organization_id;
            IF lock_date IS NOT NULL AND NEW.entry_date <= lock_date THEN
                RAISE EXCEPTION 'The books are locked through %. Entries on or before that date cannot be added.', lock_date;
            END IF;
        END IF;
    ELSE
        SELECT s.locked_through, e.entry_date INTO lock_date, d
        FROM public.journal_entries e JOIN public.accounting_settings s ON s.organization_id = e.organization_id
        WHERE e.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.journal_entry_id ELSE NEW.journal_entry_id END;
        IF lock_date IS NOT NULL AND d <= lock_date THEN
            RAISE EXCEPTION 'The books are locked through %. Entries on or before that date cannot be changed.', lock_date;
        END IF;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$guard$;

DROP TRIGGER IF EXISTS trg_guard_locked_entries ON public.journal_entries;
CREATE TRIGGER trg_guard_locked_entries BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.guard_locked_period();
DROP TRIGGER IF EXISTS trg_guard_locked_lines ON public.journal_lines;
CREATE TRIGGER trg_guard_locked_lines BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION public.guard_locked_period();

-- For each non-cash account, how much cash its entries brought in (positive) or took out (negative) over a period.
CREATE OR REPLACE FUNCTION public.accounting_cash_effects(p_org uuid, p_from date, p_to date)
RETURNS TABLE (account_id uuid, effect numeric)
LANGUAGE sql STABLE
AS $$
    SELECT l.account_id, COALESCE(SUM(l.credit - l.debit), 0)
    FROM public.journal_lines l
    JOIN public.journal_entries e ON e.id = l.journal_entry_id
    JOIN public.accounts a ON a.id = l.account_id
    WHERE e.organization_id = p_org
      AND (p_from IS NULL OR e.entry_date >= p_from)
      AND (p_to IS NULL OR e.entry_date <= p_to)
      AND NOT (a.type = 'ASSET' AND a.subtype ~* '(bank|wallet|cash|savings)')
      AND EXISTS (
          SELECT 1 FROM public.journal_lines c JOIN public.accounts ca ON ca.id = c.account_id
          WHERE c.journal_entry_id = e.id AND ca.type = 'ASSET' AND ca.subtype ~* '(bank|wallet|cash|savings)')
    GROUP BY l.account_id
$$;
REVOKE ALL ON FUNCTION public.accounting_cash_effects(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_cash_effects(uuid, date, date) TO service_role;
NOTIFY pgrst, 'reload config';

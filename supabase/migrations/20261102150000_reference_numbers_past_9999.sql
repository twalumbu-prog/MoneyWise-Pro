-- Reference numbers past 9999 were being cut to 4 digits.
--
-- generate_sequential_reference formats the counter with a 4-wide pad, and Postgres' lpad() TRUNCATES longer
-- strings: counter 10000 became CR-2026-1000, 13950 became CR-2026-1395 … numbers Twalumbu had already issued on
-- 18–19 Aug. From 31 Oct 14:12 (CR-2026-9999) almost every Twalumbu inflow — Lenco deposits, payment confirmations,
-- MasterFees — was rejected by cashbook_entries_org_reference_unique, and every retry burned another counter value.
--
-- The function itself was created outside the repo, so rather than rewrite its counter logic blind this wraps it:
-- the original (renamed *_legacy) still does the atomic increment, then the wrapper re-reads the value it just took
-- (row-locked by that increment until this transaction commits) and formats it without truncation. Below 10000 the
-- legacy result is returned unchanged, so no other org's numbering moves. Safe to re-run.

DO $migration$
DECLARE
    v_oid       oid;
    v_org_t     text;
    v_type_t    text;
    v_prefix_t  text;
    v_ret_t     text;
BEGIN
    IF to_regproc('public.generate_sequential_reference_legacy') IS NULL THEN
        ALTER FUNCTION public.generate_sequential_reference RENAME TO generate_sequential_reference_legacy;
    END IF;

    SELECT p.oid INTO v_oid FROM pg_proc p
    WHERE p.proname = 'generate_sequential_reference_legacy' AND p.pronamespace = 'public'::regnamespace;

    -- Mirror the legacy parameter/return types exactly so PostgREST callers resolve the wrapper the same way.
    SELECT format_type(t, NULL) INTO v_org_t
    FROM unnest((SELECT proargtypes::oid[] FROM pg_proc WHERE oid = v_oid)) WITH ORDINALITY u(t, i),
         unnest((SELECT proargnames FROM pg_proc WHERE oid = v_oid)) WITH ORDINALITY n(nm, j)
    WHERE i = j AND nm = 'p_org_id';
    SELECT format_type(t, NULL) INTO v_type_t
    FROM unnest((SELECT proargtypes::oid[] FROM pg_proc WHERE oid = v_oid)) WITH ORDINALITY u(t, i),
         unnest((SELECT proargnames FROM pg_proc WHERE oid = v_oid)) WITH ORDINALITY n(nm, j)
    WHERE i = j AND nm = 'p_entity_type';
    SELECT format_type(t, NULL) INTO v_prefix_t
    FROM unnest((SELECT proargtypes::oid[] FROM pg_proc WHERE oid = v_oid)) WITH ORDINALITY u(t, i),
         unnest((SELECT proargnames FROM pg_proc WHERE oid = v_oid)) WITH ORDINALITY n(nm, j)
    WHERE i = j AND nm = 'p_prefix';
    SELECT format_type(prorettype, NULL) INTO v_ret_t FROM pg_proc WHERE oid = v_oid;

    IF v_org_t IS NULL OR v_type_t IS NULL OR v_prefix_t IS NULL THEN
        RAISE EXCEPTION 'generate_sequential_reference_legacy does not have the expected p_org_id/p_entity_type/p_prefix parameters';
    END IF;

    EXECUTE format($fn$
        CREATE OR REPLACE FUNCTION public.generate_sequential_reference(p_org_id %1$s, p_entity_type %2$s, p_prefix %3$s)
        RETURNS %4$s
        LANGUAGE plpgsql
        SECURITY DEFINER  -- reference_counters is RLS-locked; the read below must see the row the increment took
        SET search_path = public
        AS $body$
        DECLARE
            v_ref   text;
            v_parts text[];
            v_last  bigint;
        BEGIN
            v_ref := public.generate_sequential_reference_legacy(
                p_org_id => p_org_id, p_entity_type => p_entity_type, p_prefix => p_prefix);

            -- <PREFIX>-<YEAR>-<NUMBER>; anything else is passed through untouched.
            v_parts := regexp_match(v_ref, '^(.+)-(\d{4})-(\d+)$');
            IF v_parts IS NULL THEN
                RETURN v_ref;
            END IF;

            SELECT rc.last_value INTO v_last
            FROM public.reference_counters rc
            WHERE rc.organization_id::text = p_org_id::text
              AND rc.entity_type::text = p_entity_type::text
              AND rc.year::text = v_parts[2];

            IF v_last IS NULL OR v_last < 10000 THEN
                RETURN v_ref;
            END IF;

            RETURN v_parts[1] || '-' || v_parts[2] || '-' || v_last::text;
        END;
        $body$
    $fn$, v_org_t, v_type_t, v_prefix_t, v_ret_t);
END
$migration$;

GRANT EXECUTE ON FUNCTION public.generate_sequential_reference_legacy TO service_role;

-- Sanity check, run by hand after applying (rolls back, so it burns no number):
--   BEGIN;
--   SELECT public.generate_sequential_reference('e359c84e-b42b-4b0a-b422-a2074d87d83a', 'INFLOW', 'CR');  -- expect CR-2026-1589x
--   ROLLBACK;

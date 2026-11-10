-- Twalumbu Education Centre: collapse duplicate income accounts and repair mis-posted wallet lines.
--
-- 1. WALLET LINES IN "Bus Fares". 2,118 CASHBOOK journal lines — every one of them the cash/wallet side of an entry, none a
--    transport sale — sat on QB-1 "Bus Fares" (INCOME) because the ledger resolver (a) trusted the fixed code QB-1 even
--    though that number is the org's Bus Fares income account, and (b) never matched external wallets whose qb_account_id
--    holds the linked account's UUID. They are moved back to the wallet's real ASSET account first; otherwise merging
--    "School Fees — Transport" into Bus Fares would pour wallet movements into transport revenue.
-- 2. DUPLICATE INCOME ACCOUNTS. Master Fees auto-created "School Fees — <category>" accounts next to the QuickBooks-imported
--    ones. Survivors (the QuickBooks names, chosen by the owner 2026-11-10):
--        Tuition Fees (QB-5)                 <- School Fees — Primary Phase, School Fees Income (generic bucket)
--        Sale of School Uniforms (QB-57)     <- School Fees — Uniforms
--        Canteen Sales Revenue (QB-1150040095) <- School Fees — Canteen, Canteen Sales (QB-1150040091, unused)
--        Bus Fares (QB-1)                    <- School Fees — Transport
--    The Master Fees category map is repointed, and genericIncomeAccountId is set so the sync never re-creates the generic
--    bucket. Everything moved is logged in account_merge_log (old account kept per row) so it can be reversed.
--
-- Run with v_dry := true first: it makes every change, then aborts with a report. Flip to false to commit.
DO $$
DECLARE
    v_dry   boolean := true;                                   -- <<< flip to false to commit
    v_org   uuid := 'e359c84e-b42b-4b0a-b422-a2074d87d83a';
    v_bus   uuid := 'de81e73d-3796-4987-8865-971155f122b1';    -- Bus Fares (QB-1)
    v_tui   uuid := 'aad4d6b3-10ab-4156-ab81-f620cce00c8f';    -- Tuition Fees (QB-5)
    v_uni   uuid := '8f7f22b8-1a04-4a3b-9dfd-b1df819e9959';    -- Sale of School Uniforms (QB-57)
    v_can   uuid := 'b61e1d73-0a68-43dc-aeb0-ad801c57d0a3';    -- Canteen Sales Revenue (QB-1150040095)
    v_can_unused uuid := '0f42a393-ad1a-4b9e-b53b-86f5088cc0fb'; -- Canteen Sales (QB-1150040091), no postings
    v_report text := '';
    v_n int;
    r record;
    m record;
    v_has_id boolean;
    v_wallet_bal numeric;
    v_cfg jsonb;
    v_map jsonb;
    k text;
BEGIN
    -- ---- guards: refuse to run against anything that is not exactly what was inspected -------------------------------
    IF (SELECT count(*) FROM accounts WHERE organization_id = v_org AND id IN (v_bus, v_tui, v_uni, v_can, v_can_unused)) <> 5 THEN
        RAISE EXCEPTION 'survivor accounts not all found in org';
    END IF;
    IF (SELECT name FROM accounts WHERE id = v_bus) <> 'Bus Fares' OR (SELECT type FROM accounts WHERE id = v_bus) <> 'INCOME' THEN
        RAISE EXCEPTION 'Bus Fares account is not what was inspected';
    END IF;

    CREATE TABLE IF NOT EXISTS public.account_merge_log (
        id          bigserial PRIMARY KEY,
        run_at      timestamptz NOT NULL DEFAULT now(),
        tbl         text NOT NULL,
        col         text NOT NULL,
        row_id      text,
        old_account uuid NOT NULL,
        new_account uuid NOT NULL,
        note        text
    );
    ALTER TABLE public.account_merge_log ENABLE ROW LEVEL SECURITY;   -- service-role only, like the rest of the ledger

    -- ---- 1. re-home the wallet lines sitting on Bus Fares ------------------------------------------------------------
    CREATE TEMP TABLE _bus_fix ON COMMIT DROP AS
    SELECT jl.id AS line_id,
           CASE
               WHEN ce.account_type = 'MONEYWISE_WALLET' THEN
                    (SELECT id FROM accounts WHERE organization_id = v_org AND type = 'ASSET' AND name = 'MoneyWise Wallet' LIMIT 1)
               ELSE (SELECT a.id FROM external_wallets ew JOIN accounts a ON a.id::text = ew.qb_account_id
                      WHERE ew.id::text = ce.account_type AND a.organization_id = v_org AND a.type = 'ASSET')
           END AS target
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = v_org AND je.source_type = 'CASHBOOK'
    JOIN cashbook_entries ce ON ce.id = je.source_id
    WHERE jl.account_id = v_bus;

    SELECT count(*) INTO v_n FROM _bus_fix;
    v_report := v_report || format(E'Bus Fares lines examined: %s\n', v_n);
    IF EXISTS (SELECT 1 FROM _bus_fix WHERE target IS NULL) THEN
        RAISE EXCEPTION 'Bus Fares lines with no resolvable wallet account: %', (SELECT count(*) FROM _bus_fix WHERE target IS NULL);
    END IF;
    -- every Bus Fares line must be one of these cash-side lines (none is real transport income)
    IF (SELECT count(*) FROM journal_lines WHERE account_id = v_bus) <> v_n THEN
        RAISE EXCEPTION 'Bus Fares has lines that are not CASHBOOK cash-side lines (% vs %)', (SELECT count(*) FROM journal_lines WHERE account_id = v_bus), v_n;
    END IF;

    INSERT INTO account_merge_log (tbl, col, row_id, old_account, new_account, note)
    SELECT 'journal_lines', 'account_id', line_id::text, v_bus, target, 'wallet line re-homed from Bus Fares' FROM _bus_fix;
    UPDATE journal_lines jl SET account_id = f.target FROM _bus_fix f WHERE jl.id = f.line_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || format(E'  re-homed to wallet accounts: %s\n', v_n);

    -- ---- 2. merge duplicate income accounts --------------------------------------------------------------------------
    CREATE TEMP TABLE _merge (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;
    INSERT INTO _merge
    SELECT a.id, s.new_id
    FROM (VALUES
        ('QB-MF-INC-B18B3CA752FC4F8284D38B8D', v_tui),   -- Primary Phase
        ('QB-MF-INC-GENERAL',                  v_tui),   -- generic School Fees Income
        ('QB-MF-INC-0C3000CDAFE44F9283917796', v_uni),   -- Uniforms
        ('QB-MF-INC-C80F4B847A0A4D4999859C62', v_can),   -- Canteen
        ('QB-MF-INC-449F877CA41043AFA99DB685', v_bus)    -- Transport
    ) AS s(code, new_id)
    JOIN accounts a ON a.organization_id = v_org AND a.code = s.code AND a.type = 'INCOME';
    IF (SELECT count(*) FROM _merge) <> 5 THEN RAISE EXCEPTION 'expected 5 duplicate accounts, found %', (SELECT count(*) FROM _merge); END IF;
    INSERT INTO _merge VALUES (v_can_unused, v_can);

    -- every column that references accounts(id), plus cashbook_entries.account_id (not always an enforced FK)
    FOR r IN
        SELECT DISTINCT c.conrelid::regclass::text AS tbl, a.attname::text AS col
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.contype = 'f' AND c.confrelid = 'public.accounts'::regclass
        UNION
        SELECT 'cashbook_entries', 'account_id'
    LOOP
        SELECT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = regexp_replace(r.tbl, '^public\.', '') AND column_name = 'id') INTO v_has_id;
        EXECUTE format(
            'INSERT INTO account_merge_log (tbl, col, row_id, old_account, new_account, note)
             SELECT %L, %L, %s, t.%I, m.new_id, ''merge'' FROM %s t JOIN _merge m ON m.old_id = t.%I',
            r.tbl, r.col, CASE WHEN v_has_id THEN 't.id::text' ELSE 'NULL' END, r.col, r.tbl, r.col);
        EXECUTE format('UPDATE %s t SET %I = m.new_id FROM _merge m WHERE t.%I = m.old_id', r.tbl, r.col, r.col);
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n > 0 THEN v_report := v_report || format(E'  repointed %s.%s: %s rows\n', r.tbl, r.col, v_n); END IF;
    END LOOP;

    -- ---- 3. Master Fees integration: category map + generic bucket ---------------------------------------------------
    SELECT id, config INTO m FROM integrations WHERE organization_id = v_org AND provider = 'MASTERFEES';
    IF m.id IS NULL THEN RAISE EXCEPTION 'no MASTERFEES integration for org'; END IF;
    v_cfg := m.config;
    v_map := coalesce(v_cfg -> 'categoryMap', '{}'::jsonb);
    FOR k IN SELECT jsonb_object_keys(v_map) LOOP
        IF EXISTS (SELECT 1 FROM _merge WHERE old_id::text = v_map -> k ->> 'accountId') THEN
            v_map := jsonb_set(v_map, ARRAY[k, 'accountId'],
                     to_jsonb((SELECT new_id::text FROM _merge WHERE old_id::text = v_map -> k ->> 'accountId')));
        END IF;
    END LOOP;
    v_cfg := jsonb_set(jsonb_set(v_cfg, '{categoryMap}', v_map), '{genericIncomeAccountId}', to_jsonb(v_tui::text));
    UPDATE integrations SET config = v_cfg, updated_at = now() WHERE id = m.id;
    v_report := v_report || E'  Master Fees categoryMap repointed, genericIncomeAccountId set\n';

    -- ---- 4. remove the now-empty duplicates --------------------------------------------------------------------------
    -- Master Fees-created accounts (no QuickBooks id) are deleted; the QuickBooks-imported unused "Canteen Sales" is only
    -- deactivated so a later "Import from QuickBooks" cannot bring it back.
    FOR r IN SELECT old_id FROM _merge WHERE old_id <> v_can_unused LOOP
        DELETE FROM accounts WHERE id = r.old_id AND organization_id = v_org AND qb_account_id IS NULL;   -- FK blocks it if anything still points here
    END LOOP;
    UPDATE accounts SET is_active = false, description = 'Merged into Canteen Sales Revenue (duplicate) 2026-11-10' WHERE id = v_can_unused;
    v_report := v_report || E'  deleted 5 Master Fees duplicate accounts, deactivated QB "Canteen Sales"\n';

    -- ---- report: survivors' totals + nothing left behind ------------------------------------------------------------
    FOR r IN
        SELECT a.name, count(jl.id) AS lines, coalesce(sum(jl.credit - jl.debit), 0)::numeric(14,2) AS net_cr
        FROM accounts a LEFT JOIN journal_lines jl ON jl.account_id = a.id
        WHERE a.id IN (v_bus, v_tui, v_uni, v_can) GROUP BY a.name ORDER BY a.name
    LOOP
        v_report := v_report || format(E'  %s: %s lines, net credit %s\n', r.name, r.lines, r.net_cr);
    END LOOP;
    SELECT coalesce(sum(jl.debit - jl.credit), 0) INTO v_wallet_bal FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id
     WHERE a.organization_id = v_org AND a.name = 'MoneyWise Wallet';
    v_report := v_report || format(E'  MoneyWise Wallet ledger balance now: %s\n', v_wallet_bal);

    IF v_dry THEN
        RAISE EXCEPTION E'DRY RUN (rolled back):\n%', v_report;
    END IF;
    RAISE NOTICE E'APPLIED:\n%', v_report;
END $$;

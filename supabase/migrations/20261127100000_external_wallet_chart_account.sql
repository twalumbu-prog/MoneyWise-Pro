-- An external wallet (a bank, Airtel Money, Cash …) must always have its own ASSET account in the chart of accounts:
-- that account is what its money is posted to and what Reports / Net worth read. Wallets created without one used to have
-- their entries fall into "Uncategorised Asset" and never appear in Net worth.
--
-- This puts the guarantee in the database, so it holds however a wallet is created (the API, onboarding, a script, SQL).

create or replace function public.ensure_wallet_account(p_wallet uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
    w record;
    acc uuid;
    linked_ok boolean := false;
    new_code text;
begin
    select * into w from public.external_wallets where id = p_wallet;
    if not found then return null; end if;

    -- 1) already linked to one of this organisation's ASSET accounts (by its id, or its QuickBooks number)
    if w.qb_account_id is not null then
        select a.id into acc from public.accounts a
        where a.organization_id = w.organization_id and a.type = 'ASSET'
          and (a.id::text = w.qb_account_id or a.qb_account_id = w.qb_account_id)
        limit 1;
        if acc is not null then linked_ok := true; end if;
    end if;

    -- 2) an ASSET account with the same name, whatever its capitalisation
    if acc is null then
        select a.id into acc from public.accounts a
        where a.organization_id = w.organization_id and a.type = 'ASSET' and lower(a.name) = lower(btrim(w.name))
        limit 1;
    end if;

    -- 3) none: make one
    if acc is null then
        new_code := 'EXT-' || upper(left(w.id::text, 8));
        insert into public.accounts (organization_id, code, name, type, subtype, is_active, description)
        values (w.organization_id, new_code, btrim(w.name), 'ASSET', case when w.provider_type = 'BANK' then 'Bank' else 'Other Asset' end, true, 'Money in ' || btrim(w.name))
        on conflict (code, organization_id) do nothing
        returning id into acc;
        if acc is null then
            select a.id into acc from public.accounts a where a.organization_id = w.organization_id and a.code = new_code;
        end if;
    end if;

    if acc is not null and not linked_ok then
        update public.external_wallets set qb_account_id = acc::text where id = w.id;
    end if;
    return acc;
end;
$$;

create or replace function public.trg_external_wallet_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    begin
        perform public.ensure_wallet_account(new.id);
    exception when others then
        -- Never block creating the wallet; the ledger makes the account on first posting as a second safety net.
        raise warning 'ensure_wallet_account(%) failed: %', new.id, sqlerrm;
    end;
    return new;
end;
$$;

drop trigger if exists external_wallet_chart_account on public.external_wallets;
create trigger external_wallet_chart_account after insert on public.external_wallets
    for each row execute function public.trg_external_wallet_account();

-- Existing wallets that have none yet.
do $$
declare w record;
begin
    for w in select id from public.external_wallets loop
        perform public.ensure_wallet_account(w.id);
    end loop;
end $$;

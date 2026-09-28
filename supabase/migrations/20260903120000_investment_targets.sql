-- Real investment targets shown in the app's Invest feature. Each row links
-- a real organization + wallet that can receive real deposits (mobile money
-- or internal MoneyWise wallet transfer), as opposed to the static demo
-- providers still rendered alongside them.
create table if not exists investment_targets (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    wallet_id uuid not null references organization_wallets(id) on delete cascade,
    display_name text not null,
    category text,
    description text,
    logo_url text,
    priority integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id)
);

-- RLS on, no policies: default-deny for anon/authenticated, service_role
-- bypasses RLS entirely (same pattern organization_wallets settled on after
-- 20260901120000_rls_close_cross_tenant_gaps.sql dropped its leaky policy).
-- The API is the only reader/writer, always via the service-role key.
alter table investment_targets enable row level security;

update organizations
set name = 'Kapstone Capital'
where id = '0dfe477d-2ee3-4d2b-a20f-f5c3a751d951';

insert into investment_targets (organization_id, wallet_id, display_name, category, description, priority, is_active)
values (
    '0dfe477d-2ee3-4d2b-a20f-f5c3a751d951',
    'b0611c26-8f6e-4ca6-b90d-28d366f59483',
    'Kapstone Capital',
    'Capital & Investment',
    'Deposit directly into Kapstone Capital''s MoneyWise account via mobile money or an internal wallet transfer.',
    0,
    true
)
on conflict (organization_id) do update set
    display_name = excluded.display_name,
    wallet_id = excluded.wallet_id,
    is_active = true,
    updated_at = now();

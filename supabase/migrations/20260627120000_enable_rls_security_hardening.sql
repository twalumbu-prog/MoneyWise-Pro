-- Security hardening: enable RLS on the tables that had it disabled.
--
-- Access model: the web app reads only `users` (own profile) and `organizations`
-- (own org) directly via the anon/authenticated key; the public payment portal and
-- every other table go through the API on the SERVICE-ROLE key, which BYPASSES RLS.
-- So enabling RLS with no policy locks a table to server-side (API) access only, with
-- zero impact on the app. Applied 2026-06-27 (alongside the reconciliation admin tool).

-- Helper: the current user's active organization. SECURITY DEFINER bypasses RLS so the
-- organizations policy can reference users without recursion.
create or replace function public.current_user_org_id() returns uuid
  language sql stable security definer set search_path = public
  as $$ select organization_id from public.users where id = auth.uid() $$;

alter table public.users enable row level security;
alter table public.requisitions enable row level security;
alter table public.line_items enable row level security;
alter table public.disbursements enable row level security;
alter table public.receipts enable row level security;
alter table public.vouchers enable row level security;
alter table public.voucher_lines enable row level security;
alter table public.cashbook_entries enable row level security;
alter table public.audit_logs enable row level security;
alter table public.chart_of_accounts enable row level security;
alter table public.accounts enable row level security;
alter table public.ai_transaction_memory enable row level security;
alter table public.ai_classification_logs enable row level security;
alter table public.cash_inflows enable row level security;
alter table public.organizations enable row level security;
alter table public.sync_logs enable row level security;
alter table public.accounting_rules enable row level security;
alter table public.ai_metrics enable row level security;
alter table public.requisition_messages enable row level security;
alter table public.reference_counters enable row level security;
alter table public.twalumbu_recon_backup_20260615 enable row level security;
alter table public.twalumbu_dup_disb_backup_20260619 enable row level security;
alter table public.blueopus_recon_backup_20260619b enable row level security;
alter table public.lubangi_recon_backup_20260626 enable row level security;
alter table public.lubangi_xfer_backup_20260626 enable row level security;

-- AuthContext: a user reads their own profile row.
drop policy if exists users_self_select on public.users;
create policy users_self_select on public.users
  for select to authenticated using (id = auth.uid());

-- AuthContext embed + CashierDashboard: a user reads their own (active) organization.
drop policy if exists org_self_select on public.organizations;
create policy org_self_select on public.organizations
  for select to authenticated using (id = public.current_user_org_id());

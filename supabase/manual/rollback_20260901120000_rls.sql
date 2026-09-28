-- ROLLBACK for 20260901120000_rls_close_cross_tenant_gaps.sql
-- Recreates the exact policies that migration dropped. Restores the
-- cross-tenant exposure; use only to unblock an outage, then fix forward.

BEGIN;
CREATE POLICY "Admins can manage AI settings" ON public.ai_model_settings AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Manage departments of own organization" ON public.departments AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated users access to organization external walle" ON public.external_wallets AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated users to manage integrations" ON public.integrations AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated users to view integrations" ON public.integrations AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "sub_org_read" ON public.organization_subscriptions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage wallets of own organization" ON public.organization_wallets AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Manage payment links of own organization" ON public.payment_links AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_payroll_documents" ON public.payroll_documents AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "service_role_all_payroll_run_items" ON public.payroll_run_items AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "service_role_all_payroll_runs" ON public.payroll_runs AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "service_role_all_payroll_staff" ON public.payroll_staff AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "Manage product bookings of own organization" ON public.product_bookings AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Manage product sales of own organization" ON public.product_sales AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Manage products of own organization" ON public.products AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_scheduled_item_runs" ON public.scheduled_item_runs AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_scheduled_items" ON public.scheduled_items AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "sub_credits_org_read" ON public.subscription_fee_credits AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "sub_invoices_org_read" ON public.subscription_invoices AS PERMISSIVE FOR SELECT TO authenticated USING (true);
COMMIT;

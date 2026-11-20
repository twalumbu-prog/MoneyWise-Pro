-- Stock that was lost (damaged, lost, stolen, expired, miscounted) and who was in charge of it.
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS loss_kind TEXT;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS in_charge_name TEXT;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS in_charge_staff_id UUID;
CREATE INDEX IF NOT EXISTS idx_stock_movements_loss ON public.stock_movements (organization_id, created_at DESC) WHERE loss_kind IS NOT NULL;
NOTIFY pgrst, 'reload schema';

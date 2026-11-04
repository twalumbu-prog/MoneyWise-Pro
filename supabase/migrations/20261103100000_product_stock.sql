-- Stock for products: how many are left, and optionally which colours and sizes they come in, each with its own count.
-- Marketplace orders take stock off when they are paid for and put it back if the payment fails.
-- Keep in step with the inline migration in apps/api/src/index.ts.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS track_stock BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER CHECK (stock_quantity IS NULL OR stock_quantity >= 0);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0);
-- [{ "id": "…", "name": "Black / 128GB", "color": "Black", "size": "128GB", "stock": 12 }]
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS variants JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Which option was bought, and whether the order is holding stock (so a failed payment gives it back).
ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS stock_reserved BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS variant_id TEXT;
ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS variant_label TEXT;

-- Takes `p_qty` off the stock of a product (or of one of its variants) if there is enough. Returns false when there is not, and true
-- when the product doesn't track stock. The row is locked so two buyers can't take the last one at the same time.
CREATE OR REPLACE FUNCTION public.reserve_stock(p_product UUID, p_variant TEXT, p_qty INTEGER) RETURNS BOOLEAN
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    p RECORD;
    idx INTEGER;
BEGIN
    SELECT track_stock, stock_quantity, variants INTO p FROM public.products WHERE id = p_product FOR UPDATE;
    IF NOT FOUND THEN RETURN FALSE; END IF;
    IF NOT p.track_stock THEN RETURN TRUE; END IF;
    IF jsonb_array_length(p.variants) > 0 THEN
        SELECT (ord - 1)::INT INTO idx FROM jsonb_array_elements(p.variants) WITH ORDINALITY AS t(v, ord) WHERE v->>'id' = p_variant;
        IF idx IS NULL THEN RETURN FALSE; END IF;
        IF COALESCE((p.variants->idx->>'stock')::INT, 0) < p_qty THEN RETURN FALSE; END IF;
        UPDATE public.products SET variants = jsonb_set(variants, ARRAY[idx::TEXT, 'stock'], to_jsonb(COALESCE((variants->idx->>'stock')::INT, 0) - p_qty)) WHERE id = p_product;
        RETURN TRUE;
    END IF;
    IF COALESCE(p.stock_quantity, 0) < p_qty THEN RETURN FALSE; END IF;
    UPDATE public.products SET stock_quantity = stock_quantity - p_qty WHERE id = p_product;
    RETURN TRUE;
END;
$$;

-- Puts stock back (a payment that failed).
CREATE OR REPLACE FUNCTION public.release_stock(p_product UUID, p_variant TEXT, p_qty INTEGER) RETURNS VOID
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    p RECORD;
    idx INTEGER;
BEGIN
    SELECT track_stock, stock_quantity, variants INTO p FROM public.products WHERE id = p_product FOR UPDATE;
    IF NOT FOUND OR NOT p.track_stock THEN RETURN; END IF;
    IF jsonb_array_length(p.variants) > 0 THEN
        SELECT (ord - 1)::INT INTO idx FROM jsonb_array_elements(p.variants) WITH ORDINALITY AS t(v, ord) WHERE v->>'id' = p_variant;
        IF idx IS NULL THEN RETURN; END IF;
        UPDATE public.products SET variants = jsonb_set(variants, ARRAY[idx::TEXT, 'stock'], to_jsonb(COALESCE((variants->idx->>'stock')::INT, 0) + p_qty)) WHERE id = p_product;
    ELSE
        UPDATE public.products SET stock_quantity = COALESCE(stock_quantity, 0) + p_qty WHERE id = p_product;
    END IF;
END;
$$;

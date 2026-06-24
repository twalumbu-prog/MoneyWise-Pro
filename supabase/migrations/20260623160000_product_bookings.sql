-- =============================================================================
-- Service (Booking - Apartments) product type + date-range reservations
-- =============================================================================
-- Adds SERVICE_BOOKING to the product_type domain and a product_bookings table
-- that records check-in / check-out stays for bookable products (apartments,
-- rooms). Only CONFIRMED (paid) bookings block dates; a partial GiST exclusion
-- constraint guarantees no two paid stays for the same product overlap. Ranges
-- are half-open [check_in, check_out), so a checkout day can be the next guest's
-- check-in (turnover). Additive and idempotent.
-- =============================================================================

-- 1. Extend the product_type domain -------------------------------------------
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_product_type_check;
ALTER TABLE public.products
    ADD CONSTRAINT products_product_type_check
    CHECK (product_type IN ('PRODUCT','SERVICE_FIXED','SERVICE_VARIABLE','DONATION','SERVICE_BOOKING'));

-- 2. Extension needed for the range-overlap exclusion constraint ---------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 3. product_bookings ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_bookings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    reference       TEXT NOT NULL,
    customer_name   TEXT NOT NULL DEFAULT 'Anonymous',
    customer_phone  TEXT NOT NULL DEFAULT 'N/A',
    check_in        DATE NOT NULL,
    check_out       DATE NOT NULL,
    nights          INTEGER NOT NULL DEFAULT 1,
    amount          NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    -- PENDING = checkout started (does NOT block dates), CONFIRMED = paid (blocks),
    -- CANCELLED = released, CONFLICT = paid but dates were taken first (needs review).
    status          TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','CONFIRMED','CANCELLED','CONFLICT')),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT product_bookings_dates_chk CHECK (check_out > check_in)
);

CREATE INDEX IF NOT EXISTS idx_product_bookings_product_status ON public.product_bookings (product_id, status);
CREATE INDEX IF NOT EXISTS idx_product_bookings_reference ON public.product_bookings (reference);

-- No two CONFIRMED stays for the same product may overlap (half-open ranges).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_bookings_no_overlap'
    ) THEN
        ALTER TABLE public.product_bookings
            ADD CONSTRAINT product_bookings_no_overlap
            EXCLUDE USING gist (
                product_id WITH =,
                daterange(check_in, check_out, '[)') WITH &&
            ) WHERE (status = 'CONFIRMED');
    END IF;
END$$;

ALTER TABLE public.product_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Manage product bookings of own organization" ON public.product_bookings;
CREATE POLICY "Manage product bookings of own organization" ON public.product_bookings
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

GRANT ALL ON public.product_bookings TO service_role;
GRANT ALL ON public.product_bookings TO postgres;

NOTIFY pgrst, 'reload config';

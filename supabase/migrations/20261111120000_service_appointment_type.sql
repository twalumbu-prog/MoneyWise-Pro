-- =============================================================================
-- Service (Appointment) product type — day + time-slot bookings (salons, clinics…)
-- =============================================================================
-- Customers pick a day on a calendar, then a time slot, then pay. Each product
-- carries its own opening hours / slot rules in `appointment_config`; paid slots
-- live in `product_appointments`. As with date-range bookings, only CONFIRMED
-- (paid) appointments hold a slot. `confirm_product_appointment` takes a per-
-- product advisory lock so two simultaneous payers can never both get the last
-- slot (the loser is flagged CONFLICT — money already cleared, never rejected).
-- Additive and idempotent.
-- =============================================================================

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_product_type_check;
ALTER TABLE public.products
    ADD CONSTRAINT products_product_type_check
    CHECK (product_type IN ('PRODUCT','SERVICE_FIXED','SERVICE_VARIABLE','DONATION','SERVICE_BOOKING','SERVICE_BOOKING_DAILY','DIGITAL','SERVICE_APPOINTMENT'));

-- {
--   duration_minutes: 60, slot_interval_minutes: 30, capacity: 1,
--   min_notice_hours: 2, max_advance_days: 60, timezone: 'Africa/Lusaka',
--   hours: { "1": {"start":"09:00","end":"17:00"}, ... }   -- 0=Sun … 6=Sat, missing = closed
--   closed_dates: ["2026-12-25"]
-- }
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS appointment_config JSONB;

CREATE TABLE IF NOT EXISTS public.product_appointments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    product_id       UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    reference        TEXT NOT NULL,
    customer_name    TEXT NOT NULL DEFAULT 'Anonymous',
    customer_phone   TEXT NOT NULL DEFAULT 'N/A',
    appointment_date DATE NOT NULL,
    start_time       TIME NOT NULL,
    end_time         TIME NOT NULL,
    amount           NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    -- PENDING = checkout started (holds nothing), CONFIRMED = paid (holds the slot),
    -- CANCELLED = released, CONFLICT = paid but the slot was taken first.
    status           TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING','CONFIRMED','CANCELLED','CONFLICT')),
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT product_appointments_time_chk CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_product_appointments_product_date
    ON public.product_appointments (product_id, appointment_date, status);
CREATE INDEX IF NOT EXISTS idx_product_appointments_reference
    ON public.product_appointments (reference);

-- RLS: API/service-role only (see rls-security-model) — no policies for clients.
ALTER TABLE public.product_appointments ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.product_appointments TO service_role;
GRANT ALL ON public.product_appointments TO postgres;

-- Atomically confirm one appointment: CONFIRMED if the number of overlapping
-- confirmed appointments is still below the product's capacity, else CONFLICT.
-- Returns the resulting status (NULL when the row isn't PENDING).
CREATE OR REPLACE FUNCTION public.confirm_product_appointment(p_appointment_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    a RECORD;
    cap INTEGER;
    taken INTEGER;
    result TEXT;
BEGIN
    SELECT * INTO a FROM product_appointments WHERE id = p_appointment_id AND status = 'PENDING';
    IF NOT FOUND THEN RETURN NULL; END IF;

    PERFORM pg_advisory_xact_lock(hashtext('appt:' || a.product_id::text));

    SELECT GREATEST(1, COALESCE((appointment_config->>'capacity')::int, 1)) INTO cap
      FROM products WHERE id = a.product_id;

    SELECT COUNT(*) INTO taken FROM product_appointments
     WHERE product_id = a.product_id AND status = 'CONFIRMED'
       AND appointment_date = a.appointment_date
       AND start_time < a.end_time AND end_time > a.start_time;

    result := CASE WHEN taken < COALESCE(cap, 1) THEN 'CONFIRMED' ELSE 'CONFLICT' END;
    UPDATE product_appointments SET status = result, updated_at = NOW() WHERE id = a.id;
    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_product_appointment(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_product_appointment(UUID) TO service_role;

NOTIFY pgrst, 'reload config';

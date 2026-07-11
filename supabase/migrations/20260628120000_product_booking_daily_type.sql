-- =============================================================================
-- Service (Booking - Daily Rental) product type
-- =============================================================================
-- Sibling of SERVICE_BOOKING (apartments): same product_bookings table, same
-- half-open date-range mechanics, same availability/double-booking guards.
-- Only the customer-facing terminology differs (Pickup/Drop-off + "per day"
-- instead of Check-in/Check-out + "per night") — that's a client-side concern,
-- so no other schema changes are needed. Additive and idempotent.
-- =============================================================================

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_product_type_check;
ALTER TABLE public.products
    ADD CONSTRAINT products_product_type_check
    CHECK (product_type IN ('PRODUCT','SERVICE_FIXED','SERVICE_VARIABLE','DONATION','SERVICE_BOOKING','SERVICE_BOOKING_DAILY'));

NOTIFY pgrst, 'reload config';

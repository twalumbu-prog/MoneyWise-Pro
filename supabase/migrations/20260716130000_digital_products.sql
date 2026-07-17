-- =============================================================================
-- Digital Product type — sell a downloadable file, delivered by email on payment
-- =============================================================================
-- Adds a DIGITAL product type. The admin uploads the file(s) when creating the
-- product (stored in the new PRIVATE `product-assets` bucket); once a buyer pays
-- on either checkout surface (open catalogue portal or one-time OTP invoice
-- link), the confirmation email carries the file — attached when small, or as a
-- time-limited signed download link when large. Additive and idempotent.
-- =============================================================================

-- 1. Allow the DIGITAL product_type ------------------------------------------
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_product_type_check;
ALTER TABLE public.products
    ADD CONSTRAINT products_product_type_check
    CHECK (product_type IN ('PRODUCT','SERVICE_FIXED','SERVICE_VARIABLE','DONATION','SERVICE_BOOKING','SERVICE_BOOKING_DAILY','DIGITAL'));

-- 2. Snapshot of the uploaded asset(s) on the product ------------------------
-- Shape: [{ name, path, size, content_type }] where `path` is the object key in
-- the private product-assets bucket. Kept as a JSONB snapshot so delivery never
-- depends on a live join to storage metadata.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS digital_assets JSONB;

-- 3. Buyer email on public catalogue sales -----------------------------------
-- The open portal historically only captured name + phone; digital delivery
-- needs somewhere to send the file, so record the buyer's email per sale row.
-- (The OTP invoice path already carries customer_email on payment_links.)
ALTER TABLE public.product_sales ADD COLUMN IF NOT EXISTS customer_email TEXT;

-- 4. PRIVATE storage bucket for the digital assets ---------------------------
-- Unlike product-images (public thumbnails), paid content must never sit at a
-- public, guessable URL — the bucket is private and delivery is done server-side
-- with the service role (attach) or via a short-lived signed URL (large files).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('product-assets', 'product-assets', false, 524288000)  -- 500MB per-object ceiling
ON CONFLICT (id) DO NOTHING;

-- Authenticated admins may upload + manage their assets. NO public SELECT policy
-- is created, so objects are unreadable except through the service role / signed URLs.
DROP POLICY IF EXISTS "Allow authenticated uploads to product-assets" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to product-assets" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-assets');

DROP POLICY IF EXISTS "Allow authenticated management of product-assets" ON storage.objects;
CREATE POLICY "Allow authenticated management of product-assets" ON storage.objects
    FOR ALL TO authenticated USING (bucket_id = 'product-assets') WITH CHECK (bucket_id = 'product-assets');

NOTIFY pgrst, 'reload config';

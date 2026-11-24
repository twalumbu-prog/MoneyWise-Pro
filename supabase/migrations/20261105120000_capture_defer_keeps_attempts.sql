-- claim_capture_jobs adds 1 to attempts on every claim, so a deferral must give that attempt back. Without this,
-- a job deferred 3 times stays PENDING with attempts = 3, which claim_capture_jobs never picks up again.
-- Must run after 20261104120000_transaction_capture_phase0.sql.
CREATE OR REPLACE FUNCTION public.defer_capture_job(
    p_job_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    UPDATE public.capture_jobs
    SET
        status = 'PENDING',
        attempts = GREATEST(attempts - 1, 0),
        available_at = now() + interval '5 minutes',
        locked_at = NULL,
        updated_at = now()
    WHERE id = p_job_id
      AND status = 'PROCESSING';

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.defer_capture_job(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.defer_capture_job(UUID) TO service_role;

-- Release jobs already stuck by the old function. Only a deferral can leave PENDING at 3 attempts:
-- fail_capture_job and the lease-recovery step both move those jobs to FAILED.
UPDATE public.capture_jobs
SET attempts = 2, updated_at = now()
WHERE status = 'PENDING' AND attempts >= 3;

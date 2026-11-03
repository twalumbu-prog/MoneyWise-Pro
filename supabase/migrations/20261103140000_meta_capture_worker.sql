-- Atomic job claiming, completion, retries and failure logging
-- for the Meta messaging capture worker.

-- 1. Claim available jobs safely.
CREATE OR REPLACE FUNCTION public.claim_capture_jobs(
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    job_id UUID,
    message_id UUID,
    organization_id UUID,
    attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_limit INTEGER;
BEGIN
    v_limit := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 10);

    -- Recover jobs abandoned by a crashed or terminated worker.
    WITH expired AS (
        UPDATE public.capture_jobs AS job
        SET
            status = CASE
                WHEN job.attempts >= 3 THEN 'FAILED'
                ELSE 'PENDING'
            END,
            available_at = CASE
                WHEN job.attempts >= 3 THEN job.available_at
                WHEN job.attempts = 1 THEN now() + interval '30 seconds'
                WHEN job.attempts = 2 THEN now() + interval '120 seconds'
                ELSE now() + interval '300 seconds'
            END,
            locked_at = NULL,
            last_error = 'Worker lease expired before job completion',
            updated_at = now()
        WHERE job.status = 'PROCESSING'
          AND job.locked_at < now() - interval '2 minutes'
        RETURNING
            job.id,
            job.message_id,
            job.organization_id,
            job.attempts,
            job.status,
            job.last_error
    )
    INSERT INTO public.audit_logs (
        entity_type,
        entity_id,
        action,
        changes
    )
    SELECT
        'CAPTURE_JOB',
        expired.organization_id,
        'CAPTURE_JOB_FAILED',
        jsonb_build_object(
            'job_id', expired.id,
            'message_id', expired.message_id,
            'attempts', expired.attempts,
            'error', expired.last_error,
            'reason', 'Processing lease expired after maximum attempts'
        )
    FROM expired
    WHERE expired.status = 'FAILED';

    -- Claim pending jobs without allowing concurrent workers
    -- to claim the same row.
    RETURN QUERY
    WITH candidates AS (
        SELECT job.id
        FROM public.capture_jobs AS job
        WHERE job.status = 'PENDING'
          AND job.available_at <= now()
          AND job.attempts < 3
        ORDER BY job.available_at, job.created_at
        LIMIT v_limit
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.capture_jobs AS job
    SET
        status = 'PROCESSING',
        attempts = job.attempts + 1,
        locked_at = now(),
        updated_at = now()
    FROM candidates
    WHERE job.id = candidates.id
    RETURNING
        job.id,
        job.message_id,
        job.organization_id,
        job.attempts;
END;
$$;


-- 2. Mark a successfully processed job as completed.
CREATE OR REPLACE FUNCTION public.complete_capture_job(
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
        status = 'COMPLETED',
        locked_at = NULL,
        last_error = NULL,
        updated_at = now()
    WHERE id = p_job_id
      AND status = 'PROCESSING';

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    RETURN v_updated = 1;
END;
$$;


-- 3. Retry failed jobs with backoff, or permanently fail after attempt 3.
CREATE OR REPLACE FUNCTION public.fail_capture_job(
    p_job_id UUID,
    p_error TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_status TEXT;
    v_organization_id UUID;
    v_message_id UUID;
    v_attempts INTEGER;
    v_error TEXT;
BEGIN
    v_error := LEFT(
        COALESCE(NULLIF(TRIM(p_error), ''), 'Unknown processing error'),
        2000
    );

    UPDATE public.capture_jobs AS job
    SET
        status = CASE
            WHEN job.attempts >= 3 THEN 'FAILED'
            ELSE 'PENDING'
        END,
        available_at = CASE
            WHEN job.attempts >= 3 THEN job.available_at
            WHEN job.attempts = 1 THEN now() + interval '30 seconds'
            WHEN job.attempts = 2 THEN now() + interval '120 seconds'
            ELSE now() + interval '300 seconds'
        END,
        locked_at = NULL,
        last_error = v_error,
        updated_at = now()
    WHERE job.id = p_job_id
      AND job.status = 'PROCESSING'
    RETURNING
        job.status,
        job.organization_id,
        job.message_id,
        job.attempts
    INTO
        v_status,
        v_organization_id,
        v_message_id,
        v_attempts;

    IF NOT FOUND THEN
        RETURN 'NOT_PROCESSING';
    END IF;

    IF v_status = 'FAILED' THEN
        INSERT INTO public.audit_logs (
            entity_type,
            entity_id,
            action,
            changes
        )
        VALUES (
            'CAPTURE_JOB',
            v_organization_id,
            'CAPTURE_JOB_FAILED',
            jsonb_build_object(
                'job_id', p_job_id,
                'message_id', v_message_id,
                'attempts', v_attempts,
                'error', v_error
            )
        );
    END IF;

    RETURN CASE
        WHEN v_status = 'FAILED' THEN 'FAILED'
        ELSE 'RETRY'
    END;
END;
$$;


-- 4. Restrict these operations to the API's service role.
REVOKE ALL ON FUNCTION public.claim_capture_jobs(INTEGER)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.complete_capture_job(UUID)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.fail_capture_job(UUID, TEXT)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_capture_jobs(INTEGER)
TO service_role;

GRANT EXECUTE ON FUNCTION public.complete_capture_job(UUID)
TO service_role;

GRANT EXECUTE ON FUNCTION public.fail_capture_job(UUID, TEXT)
TO service_role;
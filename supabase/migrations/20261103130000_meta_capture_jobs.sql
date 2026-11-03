
-- Meta message processing queue.
-- Each newly received message gets one processing job.

CREATE TABLE IF NOT EXISTS public.capture_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    message_id UUID NOT NULL
        REFERENCES public.messaging_messages(id) ON DELETE CASCADE,

    organization_id UUID NOT NULL
        REFERENCES public.organizations(id) ON DELETE CASCADE,

    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),

    attempts INTEGER NOT NULL DEFAULT 0
        CHECK (attempts >= 0 AND attempts <= 3),

    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- When a worker claims the job.
    -- Used to recover jobs abandoned by crashed workers.
    locked_at TIMESTAMPTZ,

    last_error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One processing job per incoming message.
    CONSTRAINT capture_jobs_message_id_unique UNIQUE (message_id)
);

-- Efficiently find jobs that are ready for processing.
CREATE INDEX IF NOT EXISTS capture_jobs_pending_idx
    ON public.capture_jobs (available_at, created_at)
    WHERE status = 'PENDING';

-- Efficiently retrieve jobs belonging to an organisation.
CREATE INDEX IF NOT EXISTS capture_jobs_org_idx
    ON public.capture_jobs (organization_id);

-- Efficiently identify abandoned processing jobs.
CREATE INDEX IF NOT EXISTS capture_jobs_processing_idx
    ON public.capture_jobs (locked_at)
    WHERE status = 'PROCESSING';


-- Only the backend service role can access the queue.
ALTER TABLE public.capture_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.capture_jobs
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.capture_jobs
TO service_role;


-- Atomically resolve the Meta connection, insert a message,
-- and enqueue its processing job.

CREATE OR REPLACE FUNCTION public.ingest_meta_message(
    p_platform TEXT,
    p_external_account_id TEXT,
    p_external_message_id TEXT,
    p_contact_id TEXT,
    p_contact_name TEXT DEFAULT NULL,
    p_contact_phone TEXT DEFAULT NULL,
    p_message_type TEXT DEFAULT 'text',
    p_body TEXT DEFAULT NULL,
    p_sent_at TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_connection_id UUID;
    v_organization_id UUID;
    v_message_id UUID;
BEGIN
    -- 1. Find the organisation's Meta connection.
    SELECT id, organization_id
    INTO v_connection_id, v_organization_id
    FROM public.messaging_connections
    WHERE platform = p_platform
      AND external_id = p_external_account_id
      AND status NOT IN ('DISCONNECTED', 'EXPIRED')
    LIMIT 1;

    -- Unknown or unavailable external account.
    IF v_connection_id IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'unknown_connection'
        );
    END IF;

    -- 2. Insert the incoming message.
    -- Duplicate Meta message IDs are ignored.
    INSERT INTO public.messaging_messages (
        organization_id,
        connection_id,
        platform,
        direction,
        external_message_id,
        contact_id,
        contact_name,
        contact_phone,
        message_type,
        body,
        sent_at
    )
    VALUES (
        v_organization_id,
        v_connection_id,
        p_platform,
        'IN',
        p_external_message_id,
        p_contact_id,
        p_contact_name,
        p_contact_phone,
        p_message_type,
        p_body,
        COALESCE(p_sent_at, now())
    )
    ON CONFLICT (connection_id, external_message_id)
    DO NOTHING
    RETURNING id INTO v_message_id;

    -- 3. If this message already exists, don't create another job.
    IF v_message_id IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'duplicate'
        );
    END IF;

    -- 4. Create its processing job.
    INSERT INTO public.capture_jobs (
        message_id,
        organization_id
    )
    VALUES (
        v_message_id,
        v_organization_id
    );

    -- 5. Update the connection's last-message timestamp.
    UPDATE public.messaging_connections
    SET last_message_at = now(),
        updated_at = now()
    WHERE id = v_connection_id;

    RETURN jsonb_build_object(
        'status', 'inserted',
        'message_id', v_message_id,
        'organization_id', v_organization_id
    );
END;
$$;


-- Restrict function execution to the backend service role.
REVOKE ALL ON FUNCTION public.ingest_meta_message(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ingest_meta_message(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) TO service_role;

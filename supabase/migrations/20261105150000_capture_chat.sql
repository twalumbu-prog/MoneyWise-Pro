-- Chat capture: conversations group messages so "I'll take 2" and "sent K450" form one capture, and inbound media is
-- recorded so the worker can download it. Must run after 20261104120000_transaction_capture_phase0.sql.
-- messaging_messages keeps its legacy intent/match columns (decision D1).

CREATE TABLE IF NOT EXISTS public.capture_conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    connection_id   UUID NOT NULL REFERENCES public.messaging_connections(id) ON DELETE CASCADE,
    contact_id      TEXT NOT NULL,
    opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    crm_contact_id  UUID
);
CREATE INDEX IF NOT EXISTS capture_conversations_lookup_idx
    ON public.capture_conversations (organization_id, connection_id, contact_id, last_message_at DESC);

ALTER TABLE public.capture_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.capture_conversations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.capture_conversations TO service_role;

ALTER TABLE public.messaging_messages ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.capture_conversations(id) ON DELETE SET NULL;
ALTER TABLE public.messaging_messages ADD COLUMN IF NOT EXISTS media_ref TEXT;    -- WhatsApp media id, or a Messenger/Instagram attachment URL
ALTER TABLE public.messaging_messages ADD COLUMN IF NOT EXISTS media_mime TEXT;
CREATE INDEX IF NOT EXISTS messaging_messages_conversation_idx ON public.messaging_messages (conversation_id, sent_at);

ALTER TABLE public.transaction_captures ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.capture_conversations(id) ON DELETE SET NULL;

-- ingest_meta_message gains the two media arguments.
DROP FUNCTION IF EXISTS public.ingest_meta_message(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ);
CREATE FUNCTION public.ingest_meta_message(
    p_platform TEXT,
    p_external_account_id TEXT,
    p_external_message_id TEXT,
    p_contact_id TEXT,
    p_contact_name TEXT DEFAULT NULL,
    p_contact_phone TEXT DEFAULT NULL,
    p_message_type TEXT DEFAULT 'text',
    p_body TEXT DEFAULT NULL,
    p_sent_at TIMESTAMPTZ DEFAULT now(),
    p_media_ref TEXT DEFAULT NULL,
    p_media_mime TEXT DEFAULT NULL
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
    SELECT id, organization_id INTO v_connection_id, v_organization_id
    FROM public.messaging_connections
    WHERE platform = p_platform AND external_id = p_external_account_id AND status NOT IN ('DISCONNECTED', 'EXPIRED')
    LIMIT 1;

    IF v_connection_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unknown_connection');
    END IF;

    INSERT INTO public.messaging_messages (
        organization_id, connection_id, platform, direction, external_message_id, contact_id, contact_name, contact_phone,
        message_type, body, sent_at, media_ref, media_mime
    )
    VALUES (
        v_organization_id, v_connection_id, p_platform, 'IN', p_external_message_id, p_contact_id, p_contact_name, p_contact_phone,
        p_message_type, p_body, COALESCE(p_sent_at, now()), p_media_ref, p_media_mime
    )
    ON CONFLICT (connection_id, external_message_id) DO NOTHING
    RETURNING id INTO v_message_id;

    IF v_message_id IS NULL THEN
        RETURN jsonb_build_object('status', 'duplicate');
    END IF;

    INSERT INTO public.capture_jobs (message_id, organization_id) VALUES (v_message_id, v_organization_id);

    UPDATE public.messaging_connections SET last_message_at = now(), updated_at = now() WHERE id = v_connection_id;

    RETURN jsonb_build_object('status', 'inserted', 'message_id', v_message_id, 'organization_id', v_organization_id);
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_meta_message(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_meta_message(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) TO service_role;

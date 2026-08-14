-- Assistant persistence + write audit trail.
--
-- agent_threads      one conversation
-- agent_messages     what the user and assistant said, plus rendered widgets
-- agent_runs         the raw loop state, so an approval arriving later can resume
-- agent_tool_calls   every state-changing call the agent proposed and its outcome
--
-- The last table is the point of the whole migration: once an assistant can
-- write to financial records, "who approved what, and what did it change" has
-- to be answerable without reading application logs.

CREATE TABLE IF NOT EXISTS public.agent_threads (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID        NOT NULL,
    user_id         UUID        NOT NULL,
    title           TEXT        NOT NULL DEFAULT 'New conversation',
    model           TEXT,
    archived        BOOLEAN     NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_messages (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    thread_id       UUID        NOT NULL REFERENCES public.agent_threads(id) ON DELETE CASCADE,
    organization_id UUID        NOT NULL,
    role            TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT        NOT NULL DEFAULT '',
    -- Rendered charts/tables/KPIs, so reopening a thread shows what was shown.
    widgets         JSONB       NOT NULL DEFAULT '[]'::jsonb,
    -- Tool activity timeline for this message.
    steps           JSONB       NOT NULL DEFAULT '[]'::jsonb,
    model           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Opaque provider-format message array. Kept separate from agent_messages
-- because it is loop state, not display content, and is rewritten each turn.
CREATE TABLE IF NOT EXISTS public.agent_runs (
    thread_id       UUID        PRIMARY KEY REFERENCES public.agent_threads(id) ON DELETE CASCADE,
    organization_id UUID        NOT NULL,
    state           JSONB       NOT NULL DEFAULT '[]'::jsonb,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_tool_calls (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    thread_id       UUID        NOT NULL REFERENCES public.agent_threads(id) ON DELETE CASCADE,
    organization_id UUID        NOT NULL,
    -- Provider-assigned id for the call; how an approval is matched to its proposal.
    call_id         TEXT        NOT NULL,
    tool_name       TEXT        NOT NULL,
    arguments       JSONB       NOT NULL DEFAULT '{}'::jsonb,
    proposal        JSONB,
    status          TEXT        NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'DECLINED', 'EXECUTED', 'FAILED', 'EXPIRED')),
    result          JSONB,
    error           TEXT,
    -- Who pressed the button. Not the same as who started the conversation.
    decided_by      UUID,
    decided_at      TIMESTAMPTZ,
    executed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (thread_id, call_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_threads_org_user
    ON public.agent_threads (organization_id, user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_thread
    ON public.agent_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_org
    ON public.agent_tool_calls (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_pending
    ON public.agent_tool_calls (thread_id, status) WHERE status = 'PENDING';

-- RLS on, service-role only: the web client never reads these tables directly,
-- it goes through the API, which already scopes every query by organization_id.
ALTER TABLE public.agent_threads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tool_calls ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['agent_threads', 'agent_messages', 'agent_runs', 'agent_tool_calls'] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t AND policyname = 'service_role_only'
        ) THEN
            EXECUTE format(
                'CREATE POLICY service_role_only ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
                t
            );
        END IF;
    END LOOP;
END $$;

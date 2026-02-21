-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Accounting Rules Table
CREATE TABLE IF NOT EXISTS public.accounting_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    pattern TEXT NOT NULL,
    priority INT DEFAULT 0,
    confidence_score NUMERIC(3, 2) DEFAULT 0.92,
    target_account_id UUID REFERENCES accounts(id),
    conditions_json JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounting_rules_priority ON public.accounting_rules (priority DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_rules_is_active ON public.accounting_rules (is_active);

-- 2. Add Vector Embedding to Transaction Memory
ALTER TABLE public.ai_transaction_memory 
ADD COLUMN IF NOT EXISTS embedding vector(1536); -- 1536 for OpenAI embeddings, adjust if using Gemini

-- 3. Extend Line Items with Explainability and Risk
ALTER TABLE public.line_items 
ADD COLUMN IF NOT EXISTS ai_reasoning TEXT,
ADD COLUMN IF NOT EXISTS ai_rule_id UUID REFERENCES accounting_rules(id),
ADD COLUMN IF NOT EXISTS ai_similarity_score NUMERIC(5, 4),
ADD COLUMN IF NOT EXISTS ai_decision_path TEXT,
ADD COLUMN IF NOT EXISTS ai_risk_level VARCHAR(20) DEFAULT 'LOW' CHECK (ai_risk_level IN ('LOW', 'MEDIUM', 'HIGH'));

-- 4. AI Metrics for Observability
CREATE TABLE IF NOT EXISTS public.ai_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE UNIQUE DEFAULT CURRENT_DATE,
    prediction_count INT DEFAULT 0,
    override_count INT DEFAULT 0,
    rule_hits INT DEFAULT 0,
    ai_hits INT DEFAULT 0,
    memory_hits INT DEFAULT 0,
    low_confidence_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Helper function for usage_count increment
CREATE OR REPLACE FUNCTION increment_memory_usage(signature TEXT, acc_id UUID, intent_data JSONB, conf NUMERIC)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.ai_transaction_memory (description_signature, system_account_id, intent, confidence, usage_count)
    VALUES (signature, acc_id, intent_data, conf, 1)
    ON CONFLICT (description_signature)
    DO UPDATE SET 
        usage_count = ai_transaction_memory.usage_count + 1,
        last_used_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 6. Vector Similarity Search Function
CREATE OR REPLACE FUNCTION match_ai_memory (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  system_account_id uuid,
  confidence float,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ai_transaction_memory.id,
    ai_transaction_memory.system_account_id,
    ai_transaction_memory.confidence,
    1 - (ai_transaction_memory.embedding <=> query_embedding) AS similarity
  FROM ai_transaction_memory
  WHERE 1 - (ai_transaction_memory.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- 7. Metric Increment Function
CREATE OR REPLACE FUNCTION increment_daily_metric (
  metric_column text,
  target_date date
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format(
    'INSERT INTO public.ai_metrics (date, %I)
     VALUES ($1, 1)
     ON CONFLICT (date)
     DO UPDATE SET %I = public.ai_metrics.%I + 1',
    metric_column, metric_column, metric_column
  ) USING target_date;
END;
$$;

-- 8. AI Classification Logs for Detailed Auditing
CREATE TABLE IF NOT EXISTS public.ai_classification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL, -- Requisition ID
    line_item_index INT DEFAULT 0,
    suggested_account_id UUID REFERENCES accounts(id),
    final_account_id UUID REFERENCES accounts(id),
    was_overridden BOOLEAN DEFAULT false,
    prediction_confidence NUMERIC(5, 4),
    prediction_method TEXT, -- RULE, MEMORY, AI
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_classification_logs_transaction_id ON public.ai_classification_logs (transaction_id);
CREATE INDEX IF NOT EXISTS idx_ai_classification_logs_was_overridden ON public.ai_classification_logs (was_overridden);

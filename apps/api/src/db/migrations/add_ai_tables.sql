-- AI Similarity Cache
CREATE TABLE IF NOT EXISTS public.ai_transaction_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description_signature TEXT UNIQUE NOT NULL,
  intent JSONB NOT NULL,
  system_account_id UUID REFERENCES accounts(id),
  confidence NUMERIC(3, 2),
  usage_count INT DEFAULT 1,
  accuracy_score NUMERIC(3, 2) DEFAULT 1.0,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Classification Log (Audit)
CREATE TABLE IF NOT EXISTS public.ai_classification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES requisitions(id),
  line_item_index INT,
  ai_intent JSONB,
  suggested_account_id UUID REFERENCES accounts(id),
  final_account_id UUID REFERENCES accounts(id),
  was_overridden BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

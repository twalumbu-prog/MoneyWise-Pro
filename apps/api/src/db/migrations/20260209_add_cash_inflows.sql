-- Create cash_inflows table
CREATE TABLE IF NOT EXISTS public.cash_inflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashbook_entry_id UUID NOT NULL REFERENCES public.cashbook_entries(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  contact_details TEXT,
  denominations JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Who stock was bought from, kept on its own (it used to be inside the note), so shoppers can see where businesses buy, only for businesses that opted in.
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS supplier_name TEXT;
NOTIFY pgrst, 'reload schema';

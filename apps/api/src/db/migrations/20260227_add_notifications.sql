-- Add has_unread_updates column to requisitions
ALTER TABLE public.requisitions 
ADD COLUMN IF NOT EXISTS has_unread_updates BOOLEAN DEFAULT false;

-- Create a function to set has_unread_updates to true
CREATE OR REPLACE FUNCTION set_unread_updates()
RETURNS TRIGGER AS $$
BEGIN
    -- Only set to true if the status has actually changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        NEW.has_unread_updates = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS trigger_set_unread_updates ON public.requisitions;

-- Create the trigger on the requisitions table
CREATE TRIGGER trigger_set_unread_updates
BEFORE UPDATE ON public.requisitions
FOR EACH ROW
EXECUTE FUNCTION set_unread_updates();

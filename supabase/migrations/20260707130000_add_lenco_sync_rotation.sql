-- Tracks when each organization was last processed by the periodic Lenco sync
-- (syncAllLencoTransactions). The sync loop now orders orgs by this column
-- (oldest/never-synced first) and bails out gracefully if it's running low on
-- time, instead of processing orgs in an unspecified order and letting Vercel's
-- maxDuration kill the function mid-loop. Without a stable rotation, whichever
-- orgs happened to sort last never got synced once total processing time grew
-- past the function's time budget — that's how Blue Opus Software's inflows
-- went unrecorded for days despite the "every 5 minutes" cron running fine.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS last_lenco_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_organizations_last_lenco_synced_at
    ON organizations (last_lenco_synced_at)
    WHERE lenco_subaccount_id IS NOT NULL;

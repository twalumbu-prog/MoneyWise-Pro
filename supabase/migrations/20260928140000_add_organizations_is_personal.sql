-- Personal-vs-business accounts were being inferred at runtime from a
-- substring match on the org's own display name ("workspace"/"personal"/
-- "individual"/"private"), used to decide things like auto-approving every
-- requisition and whether to purge a chart of accounts. That heuristic is
-- unsafe for two reasons: the org name is user-supplied at signup, and
-- "Private" is a standard Zambian company suffix ("X (Private) Limited"), so
-- an ordinary registered business could be misclassified as personal.
--
-- This gives personal accounts a real, non-inferred column. Existing personal
-- workspaces (created via ensurePersonalWorkspace, whose name is always
-- "<name>'s Personal Account") are backfilled; "private" is deliberately
-- excluded from the backfill match since it would misclassify real
-- businesses named "... (Private) Limited".
ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS is_personal boolean NOT NULL DEFAULT false;

UPDATE organizations
SET is_personal = true
WHERE is_personal = false
  AND (
      lower(name) LIKE '%workspace%'
      OR lower(name) LIKE '%personal account%'
      OR lower(name) LIKE '%individual%'
  );

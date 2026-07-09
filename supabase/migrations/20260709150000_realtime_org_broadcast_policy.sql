-- Authorize org-scoped private Broadcast channels ("org:<organization_id>").
--
-- The API publishes small cache-invalidation events after writes (see
-- apps/api/src/lib/realtimeBroadcast.ts); the web app subscribes on
-- `org:<their org id>` (private) and invalidates the matching React Query
-- caches. This policy lets an authenticated user receive messages ONLY for
-- their own organization's topic — cross-tenant subscriptions get nothing.
--
-- Sends come from the API's service-role key (bypasses RLS), so no INSERT
-- policy is needed.

drop policy if exists org_members_receive_org_broadcasts on realtime.messages;

create policy org_members_receive_org_broadcasts
on realtime.messages
for select
to authenticated
using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() = 'org:' || (
        select organization_id::text
        from public.users
        where id = (select auth.uid())
    )
);

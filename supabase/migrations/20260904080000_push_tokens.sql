-- Push notification device tokens, one row per (user, device). A user can
-- have several rows (phone + tablet, or a reinstalled app before the old
-- token expires) so this is its own table rather than a users column.
create table if not exists push_tokens (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    token text not null unique,
    platform text not null check (platform in ('ios', 'android')),
    created_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx on push_tokens (user_id);

-- RLS on, no policies: service-role only, same convention as every other
-- table besides users/organizations (see RLS security model). The API is
-- the only writer/reader — it registers tokens on login and reads them
-- when fanning out a push.
alter table push_tokens enable row level security;

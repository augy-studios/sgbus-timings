-- Navigate's short share links (main-site/api/_lib/share-links.js).
-- Run once in the Supabase SQL editor. Never edited after: later changes go in a new file.
--
--   kind 'place'       /go/<id>    How to get to one place.
--   kind 'directions'  /trip/<id>  Both ends of a nav, its time, and the way that was open.
--   kind 'eta'         /eta/<id>   Live progress on a trip, updated as it goes.
--
-- Only the site's Vercel Functions read or write it, with the service role (or secret) key.
-- Row level security is on with no policies, so the public anon key gets nothing.

create table if not exists public.share_links (
    id          text primary key check (id ~ '^[a-z0-9]{10}$'),
    kind        text not null check (kind in ('place', 'directions', 'eta')),
    data        jsonb not null,
    -- A place or directions link: a hash of what's shared, so sharing the same thing again
    -- gives the same link. Null for an ETA link, which is new every time.
    dedupe_key  text unique,
    -- An ETA link: a SHA-256 hash of the secret the sharing app updates it with.
    secret_hash text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    -- An ETA link: gone after this. Null for place and directions links, which last.
    expires_at  timestamptz
);

create index if not exists share_links_expires_at_idx
    on public.share_links (expires_at)
    where expires_at is not null;

alter table public.share_links enable row level security;

revoke all on public.share_links from anon, authenticated;
grant select, insert, update, delete on public.share_links to service_role;

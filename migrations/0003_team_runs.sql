-- Team runs: the feats done as a team (main-site/js/team.js, main-site/api/team.js,
-- main-site/api/_lib/team-runs.js). Run once in the Supabase SQL editor, after 0002. Never
-- edited after.
--
--   team_runs     A team: its name, and when it goes (TEAM_TTL after its last ride or trip).
--   team_members  Who's in it: a name each, and a hash of the secret their phone writes with.
--   team_events   What each member's phone sends: a ride judged real there ('ride'), or a
--                 trip it arrived at with one ('trip'). Each phone works the team's feats out
--                 from all of them. `eid` is the phone's own id for one, so sending it again
--                 (after no answer) adds nothing.
--
-- Only the site's Vercel Functions read or write them, with the service role (or secret) key.
-- Row level security is on with no policies, so the public anon key gets nothing.

create table if not exists public.team_runs (
    id          text primary key check (id ~ '^[a-z0-9]{10}$'),
    name        text not null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    expires_at  timestamptz not null
);

create index if not exists team_runs_expires_at_idx on public.team_runs (expires_at);

create table if not exists public.team_members (
    team_id     text not null references public.team_runs (id) on delete cascade,
    member_id   text not null check (member_id ~ '^[a-z0-9]{10}$'),
    name        text not null,
    secret_hash text not null,
    joined_at   timestamptz not null default now(),
    -- Left: no longer listed or writing, but what they rode still counts.
    left_at     timestamptz,
    primary key (team_id, member_id)
);

create table if not exists public.team_events (
    id          bigint generated always as identity primary key,
    team_id     text not null references public.team_runs (id) on delete cascade,
    member_id   text not null,
    eid         text not null check (eid ~ '^[a-z0-9-]{8,40}$'),
    kind        text not null check (kind in ('ride', 'trip')),
    data        jsonb not null,
    created_at  timestamptz not null default now(),
    unique (team_id, eid)
);

create index if not exists team_events_team_idx on public.team_events (team_id, id);

alter table public.team_runs enable row level security;
alter table public.team_members enable row level security;
alter table public.team_events enable row level security;

revoke all on public.team_runs, public.team_members, public.team_events from anon, authenticated;
grant select, insert, update, delete on public.team_runs, public.team_members, public.team_events to service_role;

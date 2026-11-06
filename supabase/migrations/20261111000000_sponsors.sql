-- Automatic ad spot: one paid sponsor card at a time, 7 days each, queued in order of activation.
-- Rows are written only by api/ad.js (service_role) after the Gumroad key and the safety checks pass.
-- The public only ever sees the live card's text through the API; nothing about the buyer is stored
-- beyond what they typed for the card and a hash of their key.
create table if not exists public.sponsors (
  id          bigint generated always as identity primary key,
  key_hash    text        not null unique,
  brand       text        not null check (length(brand) between 2 and 24),
  kind        text        not null check (length(kind) between 2 and 30),
  website     text        not null check (website ~ '^https://'),
  tagline     text        check (length(tagline) <= 60),
  instagram   text        check (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  status      text        not null default 'queued' check (status in ('queued', 'held', 'live', 'done', 'removed')),
  reason      text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists sponsors_status_starts on public.sponsors (status, starts_at);
alter table public.sponsors enable row level security;
revoke all on public.sponsors from anon, authenticated;
grant all on public.sponsors to service_role;

-- Where the card shows, from the Gumroad option bought: a wagon on the left truck or a plane flyby on the right.
alter table public.sponsors add column if not exists placement text not null default 'wagon'
  check (placement in ('wagon', 'plane', 'both'));

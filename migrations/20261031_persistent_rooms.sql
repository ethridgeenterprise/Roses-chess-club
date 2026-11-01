begin;
create table if not exists public.club_room_snapshots (
  room_code text primary key check (room_code ~ '^[A-Z0-9]{6}$'),
  game_id uuid not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.club_room_snapshots
  add column if not exists store_id text not null default 'legacy',
  add column if not exists revision bigint not null default 0;
alter table public.club_room_snapshots drop constraint if exists club_room_snapshots_pkey;
alter table public.club_room_snapshots add primary key (store_id,room_code);
alter table public.club_room_snapshots enable row level security;
revoke all on table public.club_room_snapshots from public,anon,authenticated;
grant select,insert,update,delete on table public.club_room_snapshots to service_role;
notify pgrst,'reload schema';
commit;

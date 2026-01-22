create extension if not exists "pgcrypto";

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  home_team text not null,
  away_team text not null,
  home_score int not null default 0,
  away_score int not null default 0,
  minute int not null default 0,
  status text not null,
  starts_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  minute int not null,
  type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists match_events_match_created_idx on match_events (match_id, created_at);
create index if not exists match_events_match_minute_idx on match_events (match_id, minute);

create table if not exists match_stats (
  match_id uuid primary key references matches(id) on delete cascade,
  possession_home int default 50,
  possession_away int default 50,
  shots_home int default 0,
  shots_away int default 0,
  fouls_home int default 0,
  fouls_away int default 0,
  corners_home int default 0,
  corners_away int default 0,
  updated_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  user_id text not null,
  user_name text not null,
  message text not null,
  created_at timestamptz not null default now()
);

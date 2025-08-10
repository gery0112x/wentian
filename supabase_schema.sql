
-- WenTian minimal schema (text-only audit; no screenshots)
create table if not exists sessions(
  id uuid primary key default gen_random_uuid(),
  user_id text,
  style_id text,
  voice_id text,
  project_id text,
  created_at timestamptz default now(),
  last_active_at timestamptz default now()
);
create table if not exists messages(
  id bigserial primary key,
  session_id uuid references sessions(id),
  role text,
  content text,
  model text,
  tokens_in int,
  tokens_out int,
  cost_usd numeric,
  created_at timestamptz default now()
);
create table if not exists memory_facts(
  id bigserial primary key,
  scope text check (scope in ('global','project','session')),
  key text, value text, weight numeric default 1.0,
  source text, created_at timestamptz default now()
);
create table if not exists memory_summaries(
  id bigserial primary key,
  session_id uuid references sessions(id),
  summary_text text,
  turn_count int,
  created_at timestamptz default now()
);
create table if not exists routing_events(
  id bigserial primary key,
  session_id uuid,
  level text,
  route_model text,
  estimate_usd numeric,
  reason text,
  created_at timestamptz default now()
);
create table if not exists grey_cards(
  id text primary key,
  kind text,
  content text,
  source_hash text,
  risk_level text,
  tags text[],
  ttl int,
  created_at timestamptz default now(),
  fingerprint text
);
create table if not exists module_metrics(
  id bigserial primary key,
  module text,
  cost_per_ans numeric,
  tokens_per_ans numeric,
  hit_rate numeric,
  p95_ms int,
  drift_fix_count int,
  window_start timestamptz,
  window_end timestamptz
);

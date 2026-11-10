-- Apply after schema.sql. Server-only control plane; browsers never access these rows.
create table if not exists public.vast_deployments (
  id uuid primary key,
  user_id uuid references public.users(id) on delete restrict,
  model text not null check (model in ('kz-vast-qwen','kz-vast-coder','kz-vast-llama')),
  instance_id bigint unique,
  state text not null check (state in ('creating','starting','ready','unknown','deleting','terminated','failed')),
  hourly_usd numeric(12,6) not null check (hourly_usd > 0),
  gpu_name text not null,
  tls_cert text not null,
  host text,
  port integer check (port between 1 and 65535),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now()
);
alter table public.vast_deployments add column if not exists last_checked_at timestamptz not null default now();
create unique index if not exists vast_one_live_deployment_per_user
  on public.vast_deployments(user_id)
  where state not in ('terminated','failed');
create index if not exists vast_live_expiry on public.vast_deployments(expires_at)
  where state not in ('terminated','failed');
alter table public.vast_deployments enable row level security;
revoke all on public.vast_deployments from anon, authenticated;
grant all on public.vast_deployments to service_role;
comment on table public.vast_deployments is
  'GPU lease metadata and public TLS cert only. No prompts, private keys or access tokens.';

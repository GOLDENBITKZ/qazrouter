-- ============================================================
-- QazRouter: схема Supabase/PostgreSQL
-- Выполните файл целиком в Supabase SQL Editor.
-- Перед production-запуском проверьте политики с вашим security-аудитором.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. Профили пользователей
-- ------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  balance_kzt numeric(14, 4) not null default 0 check (balance_kzt >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is
  'Профиль пользователя. Баланс изменяется только доверенными RPC-функциями.';

-- ------------------------------------------------------------
-- 2. API-ключи
-- Сырой ключ НЕ хранится. Хранится HMAC-SHA256-хеш с серверным pepper.
-- ------------------------------------------------------------
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null default 'Default key',
  key_prefix text not null,
  key_last_four text not null,
  key_hash text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint api_keys_last_four_format check (key_last_four ~ '^[A-Za-z0-9_-]{4}$')
);

create index if not exists api_keys_user_id_idx
  on public.api_keys(user_id);

create index if not exists api_keys_hash_active_idx
  on public.api_keys(key_hash)
  where is_active = true;

-- ------------------------------------------------------------
-- 3. Детальный журнал потребления
-- ------------------------------------------------------------
create table if not exists public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  api_key_id uuid references public.api_keys(id) on delete set null,
  request_id text not null unique,
  model text not null,
  provider text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  cached_input_tokens integer not null default 0
    check (cached_input_tokens >= 0),
  input_price_per_million numeric(12, 4) not null,
  output_price_per_million numeric(12, 4) not null,
  cost_kzt numeric(14, 4) not null check (cost_kzt >= 0),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  masked_entities jsonb not null default '{"iin":0,"phone":0,"card":0}'::jsonb,
  masked_total integer not null default 0 check (masked_total >= 0),
  pii_engine text not null default 'regex-fallback-v1',
  pii_policy_version text not null default 'kz-pii-v2',
  pii_risk numeric(5, 4) not null default 0
    check (pii_risk >= 0 and pii_risk <= 1),
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

-- Совместимость с базой, созданной по первой версии схемы.
alter table public.usage_logs
  add column if not exists masked_total integer not null default 0;
alter table public.usage_logs
  add column if not exists pii_engine text not null default 'regex-fallback-v1';
alter table public.usage_logs
  add column if not exists pii_policy_version text not null default 'kz-pii-v2';
alter table public.usage_logs
  add column if not exists pii_risk numeric(5, 4) not null default 0;

create index if not exists usage_logs_user_created_idx
  on public.usage_logs(user_id, created_at desc);

create index if not exists usage_logs_api_key_created_idx
  on public.usage_logs(api_key_id, created_at desc);

-- ------------------------------------------------------------
-- 4. Заявки на пополнение Kaspi
-- Это заявки, а не автоматическое подтверждение платежа.
-- ------------------------------------------------------------
create table if not exists public.topup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount_kzt numeric(14, 2) not null
    check (amount_kzt > 0 and amount_kzt <= 1000000),
  kaspi_transaction_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (user_id, kaspi_transaction_id)
);

create index if not exists topup_requests_user_created_idx
  on public.topup_requests(user_id, created_at desc);

create index if not exists topup_requests_status_created_idx
  on public.topup_requests(status, created_at);

-- ------------------------------------------------------------
-- 5. Автоматическое создание профиля после GitHub OAuth
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'user_name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.users.full_name, excluded.full_name),
        avatar_url = coalesce(public.users.avatar_url, excluded.avatar_url),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- 6. Обновление updated_at
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;

create trigger users_set_updated_at
  before update on public.users
  for each row execute procedure public.set_updated_at();

-- ------------------------------------------------------------
-- 7. Атомарное списание и запись usage_logs
-- Вызывается только service_role из API-маршрута.
-- ------------------------------------------------------------
drop function if exists public.charge_usage(
  uuid, uuid, text, text, text, integer, integer, integer, integer,
  numeric, numeric, numeric, integer, jsonb
);
drop function if exists public.charge_usage(
  uuid, uuid, text, text, text, integer, integer, integer, integer,
  numeric, numeric, numeric, integer, jsonb, integer, text, numeric
);

create or replace function public.charge_usage(
  p_user_id uuid,
  p_api_key_id uuid,
  p_request_id text,
  p_model text,
  p_provider text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_total_tokens integer,
  p_cached_input_tokens integer,
  p_input_price_per_million numeric,
  p_output_price_per_million numeric,
  p_cost_kzt numeric,
  p_latency_ms integer,
  p_masked_entities jsonb,
  p_masked_total integer,
  p_pii_engine text,
  p_pii_policy_version text,
  p_pii_risk numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric(14, 4);
  v_new_balance numeric(14, 4);
  v_rounded_cost numeric(14, 4);
begin
  if p_cost_kzt < 0 then
    raise exception 'cost_kzt cannot be negative';
  end if;

  v_rounded_cost := round(p_cost_kzt, 4);

  -- Блокировка строки сериализует параллельные списания пользователя.
  select balance_kzt
    into v_balance
    from public.users
    where id = p_user_id
    for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'reason', 'user_not_found'
    );
  end if;

  if v_balance < v_rounded_cost then
    return jsonb_build_object(
      'success', false,
      'reason', 'insufficient_balance',
      'balance_kzt', v_balance
    );
  end if;

  v_new_balance := v_balance - v_rounded_cost;

  update public.users
    set balance_kzt = v_new_balance,
        updated_at = now()
    where id = p_user_id;

  insert into public.usage_logs (
    user_id,
    api_key_id,
    request_id,
    model,
    provider,
    input_tokens,
    output_tokens,
    total_tokens,
    cached_input_tokens,
    input_price_per_million,
    output_price_per_million,
    cost_kzt,
    latency_ms,
    masked_entities,
    masked_total,
    pii_engine,
    pii_policy_version,
    pii_risk,
    status
  ) values (
    p_user_id,
    p_api_key_id,
    p_request_id,
    p_model,
    p_provider,
    greatest(p_input_tokens, 0),
    greatest(p_output_tokens, 0),
    greatest(p_total_tokens, p_input_tokens + p_output_tokens),
    greatest(p_cached_input_tokens, 0),
    p_input_price_per_million,
    p_output_price_per_million,
    v_rounded_cost,
    greatest(p_latency_ms, 0),
    coalesce(p_masked_entities, '{"iin":0,"phone":0,"card":0}'::jsonb),
    greatest(p_masked_total, 0),
    left(coalesce(p_pii_engine, 'unknown'), 80),
    left(coalesce(p_pii_policy_version, 'unknown'), 80),
    least(greatest(coalesce(p_pii_risk, 0), 0), 1),
    'completed'
  );

  update public.api_keys
    set last_used_at = now()
    where id = p_api_key_id;

  return jsonb_build_object(
    'success', true,
    'balance_kzt', v_new_balance
  );
end;
$$;

revoke all on function public.charge_usage(
  uuid, uuid, text, text, text, integer, integer, integer, integer,
  numeric, numeric, numeric, integer, jsonb, integer, text, text, numeric
) from public, anon, authenticated;

grant execute on function public.charge_usage(
  uuid, uuid, text, text, text, integer, integer, integer, integer,
  numeric, numeric, numeric, integer, jsonb, integer, text, text, numeric
) to service_role;

-- ------------------------------------------------------------
-- 8. Сводные метрики текущего пользователя
-- SECURITY INVOKER сохраняет действие RLS текущей сессии.
-- ------------------------------------------------------------
create or replace function public.get_my_dashboard_metrics()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'total_spent_kzt', coalesce((
      select sum(cost_kzt)
      from public.usage_logs
      where user_id = auth.uid()
    ), 0),
    'month_spent_kzt', coalesce((
      select sum(cost_kzt)
      from public.usage_logs
      where user_id = auth.uid()
        and created_at >= date_trunc('month', now())
    ), 0),
    'total_requests', coalesce((
      select count(*)
      from public.usage_logs
      where user_id = auth.uid()
    ), 0),
    'total_tokens', coalesce((
      select sum(total_tokens)
      from public.usage_logs
      where user_id = auth.uid()
    ), 0),
    'masked_iin', coalesce((
      select sum((masked_entities ->> 'iin')::bigint)
      from public.usage_logs
      where user_id = auth.uid()
    ), 0),
    'masked_phone', coalesce((
      select sum((masked_entities ->> 'phone')::bigint)
      from public.usage_logs
      where user_id = auth.uid()
    ), 0),
    'masked_card', coalesce((
      select sum((masked_entities ->> 'card')::bigint)
      from public.usage_logs
      where user_id = auth.uid()
    ), 0),
    'masked_total', coalesce((
      select sum(masked_total)
      from public.usage_logs
      where user_id = auth.uid()
    ), 0),
    'pending_topups', coalesce((
      select count(*)
      from public.topup_requests
      where user_id = auth.uid()
        and status = 'pending'
    ), 0)
  );
$$;

revoke all on function public.get_my_dashboard_metrics() from public, anon;
grant execute on function public.get_my_dashboard_metrics()
  to authenticated, service_role;

-- ------------------------------------------------------------
-- 9. Ручное подтверждение Kaspi-пополнения
-- Вызовите через Supabase service_role / внутреннюю админ-панель.
-- ------------------------------------------------------------
create or replace function public.approve_topup(
  p_topup_id uuid,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.topup_requests%rowtype;
  v_new_balance numeric(14, 4);
begin
  select *
    into v_request
    from public.topup_requests
    where id = p_topup_id
    for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  if v_request.status <> 'pending' then
    return jsonb_build_object(
      'success', false,
      'reason', 'already_reviewed',
      'status', v_request.status
    );
  end if;

  update public.users
    set balance_kzt = balance_kzt + v_request.amount_kzt
    where id = v_request.user_id
    returning balance_kzt into v_new_balance;

  update public.topup_requests
    set status = 'approved',
        admin_note = p_admin_note,
        reviewed_at = now()
    where id = p_topup_id;

  return jsonb_build_object(
    'success', true,
    'balance_kzt', v_new_balance
  );
end;
$$;

revoke all on function public.approve_topup(uuid, text)
  from public, anon, authenticated;
grant execute on function public.approve_topup(uuid, text)
  to service_role;

-- ------------------------------------------------------------
-- 10. Row Level Security
-- ------------------------------------------------------------
alter table public.users enable row level security;
alter table public.api_keys enable row level security;
alter table public.usage_logs enable row level security;
alter table public.topup_requests enable row level security;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
  on public.users for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "api_keys_select_own" on public.api_keys;
create policy "api_keys_select_own"
  on public.api_keys for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "usage_logs_select_own" on public.usage_logs;
create policy "usage_logs_select_own"
  on public.usage_logs for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "topup_requests_select_own" on public.topup_requests;
create policy "topup_requests_select_own"
  on public.topup_requests for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "topup_requests_insert_own" on public.topup_requests;
create policy "topup_requests_insert_own"
  on public.topup_requests for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and reviewed_at is null
    and admin_note is null
  );

-- Запросы на UPDATE/DELETE намеренно не созданы для клиентских ролей.
-- Изменение баланса и ключей выполняется только через service_role.

-- ------------------------------------------------------------
-- 11. Права доступа
-- ------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select on public.users, public.api_keys, public.usage_logs,
  public.topup_requests to authenticated;
grant insert on public.topup_requests to authenticated;

-- service_role обходит RLS и используется только сервером.
grant all on public.users, public.api_keys, public.usage_logs,
  public.topup_requests to service_role;

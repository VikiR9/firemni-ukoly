-- Reproducible schema for the internal LIMMIT application and encrypted client offers.
-- The internal app currently uses its own browser session, not Supabase Auth. The
-- broad anon policies below preserve the existing behaviour; published offers are
-- stored only as ciphertext and can be read only while active.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  assignee text,
  priority text not null default 'Low',
  due date,
  status text not null default 'PENDING_ACCEPT',
  lane text,
  accepted_at timestamptz,
  completed_at timestamptz,
  owner_verified_at timestamptz,
  completion_note text,
  owner_review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  username text primary key,
  lanes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calculations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by text not null,
  client_data jsonb not null default '{}'::jsonb,
  module_types jsonb not null default '[]'::jsonb,
  offers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.property_calculations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by text not null,
  schema_version integer not null default 1 check (schema_version > 0),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.published_offers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[A-Za-z0-9_-]{12,32}$'),
  product_type text not null check (product_type in ('property')),
  schema_version integer not null default 1 check (schema_version > 0),
  encrypted_payload text not null check (length(encrypted_payload) between 1 and 200000),
  revoke_hash text not null check (revoke_hash ~ '^[a-f0-9]{64}$'),
  created_by text not null default 'internal' check (length(created_by) between 1 and 120),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (expires_at <= created_at + interval '90 days')
);

create index tasks_assignee_status_idx on public.tasks (assignee, status);
create index tasks_updated_at_idx on public.tasks (updated_at desc);
create index calculations_created_by_updated_at_idx on public.calculations (created_by, updated_at desc);
create index property_calculations_created_by_updated_at_idx on public.property_calculations (created_by, updated_at desc);
create index published_offers_expires_at_idx on public.published_offers (expires_at) where revoked_at is null;

create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create trigger user_preferences_set_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

create trigger calculations_set_updated_at
before update on public.calculations
for each row execute function public.set_updated_at();

create trigger property_calculations_set_updated_at
before update on public.property_calculations
for each row execute function public.set_updated_at();

create trigger published_offers_set_updated_at
before update on public.published_offers
for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;
alter table public.user_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.calculations enable row level security;
alter table public.property_calculations enable row level security;
alter table public.published_offers enable row level security;

-- Compatibility policies for the existing internal application. A future auth
-- migration should replace these with owner-scoped authenticated policies.
create policy internal_tasks_access
on public.tasks for all to anon, authenticated
using (true) with check (true);

create policy internal_preferences_access
on public.user_preferences for all to anon, authenticated
using (true) with check (true);

create policy internal_push_subscriptions_access
on public.push_subscriptions for all to anon, authenticated
using (true) with check (true);

create policy internal_calculations_access
on public.calculations for all to anon, authenticated
using (true) with check (true);

create policy internal_property_calculations_access
on public.property_calculations for all to anon, authenticated
using (true) with check (true);

-- Public links expose ciphertext only. The AES key remains in the URL fragment,
-- which browsers do not send to the server.
create policy read_active_encrypted_offers
on public.published_offers for select to anon, authenticated
using (revoked_at is null and expires_at > now());

create policy publish_encrypted_offers
on public.published_offers for insert to anon, authenticated
with check (
  revoked_at is null
  and expires_at > now()
  and expires_at <= now() + interval '90 days'
);

create or replace function public.revoke_published_offer(
  p_slug text,
  p_revoke_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  update public.published_offers
  set revoked_at = now()
  where slug = p_slug
    and revoked_at is null
    and revoke_hash = encode(extensions.digest(p_revoke_token, 'sha256'), 'hex');

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

revoke all on table public.tasks from anon, authenticated;
revoke all on table public.user_preferences from anon, authenticated;
revoke all on table public.push_subscriptions from anon, authenticated;
revoke all on table public.calculations from anon, authenticated;
revoke all on table public.property_calculations from anon, authenticated;
revoke all on table public.published_offers from anon, authenticated;

grant select, insert, update, delete on table public.tasks to anon, authenticated;
grant select, insert, update, delete on table public.user_preferences to anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to anon, authenticated;
grant select, insert, update, delete on table public.calculations to anon, authenticated;
grant select, insert, update, delete on table public.property_calculations to anon, authenticated;
grant select, insert on table public.published_offers to anon, authenticated;

grant all on table public.tasks to service_role;
grant all on table public.user_preferences to service_role;
grant all on table public.push_subscriptions to service_role;
grant all on table public.calculations to service_role;
grant all on table public.property_calculations to service_role;
grant all on table public.published_offers to service_role;

revoke all on function public.set_updated_at() from public;
revoke all on function public.revoke_published_offer(text, text) from public;
grant execute on function public.revoke_published_offer(text, text) to anon, authenticated;
grant execute on function public.revoke_published_offer(text, text) to service_role;

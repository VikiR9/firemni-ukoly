-- Protect encrypted working copies with a browser-held capability token.
-- The database stores only SHA-256(token); direct anonymous table access is
-- removed so encrypted rows cannot be enumerated, overwritten or deleted.

alter table public.property_calculations
add column access_hash text;

alter table public.property_calculations
add constraint property_calculations_access_hash_check
check (access_hash is null or access_hash ~ '^[a-f0-9]{64}$');

create index property_calculations_access_hash_updated_at_idx
on public.property_calculations (access_hash, updated_at desc)
where access_hash is not null;

drop policy if exists internal_property_calculations_access
on public.property_calculations;

revoke select, insert, update, delete
on table public.property_calculations
from anon, authenticated;

create or replace function public.list_property_calculations(
  p_access_token text
)
returns table (
  id uuid,
  name text,
  payload jsonb,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_access_token is null
    or p_access_token !~ '^[A-Za-z0-9_-]{43}$'
  then
    return;
  end if;

  return query
  select calculation.id,
         calculation.name,
         calculation.payload,
         calculation.updated_at
  from public.property_calculations as calculation
  where calculation.access_hash = encode(
    extensions.digest(p_access_token, 'sha256'),
    'hex'
  )
  order by calculation.updated_at desc
  limit 100;
end;
$$;

create or replace function public.save_property_calculation(
  p_id uuid,
  p_name text,
  p_payload jsonb,
  p_created_by text,
  p_access_token text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_hash text;
  saved_id uuid;
begin
  if p_access_token is null
    or p_access_token !~ '^[A-Za-z0-9_-]{43}$'
  then
    raise exception 'invalid access token';
  end if;

  if p_name <> 'Šifrovaná majetková nabídka'
    or p_created_by is null
    or p_created_by !~ '^[A-Z]{2,32}$'
  then
    raise exception 'invalid calculation metadata';
  end if;

  if p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
    or p_payload ->> 'version' <> '1'
    or p_payload ->> 'algorithm' <> 'A256GCM'
    or jsonb_typeof(p_payload -> 'iv') <> 'string'
    or jsonb_typeof(p_payload -> 'ciphertext') <> 'string'
    or length(p_payload::text) > 300000
  then
    raise exception 'invalid encrypted payload';
  end if;

  token_hash := encode(
    extensions.digest(p_access_token, 'sha256'),
    'hex'
  );

  if p_id is null then
    if (
      select count(*)
      from public.property_calculations
      where access_hash = token_hash
        and created_at > now() - interval '1 hour'
    ) >= 100 then
      raise exception 'calculation rate limit reached';
    end if;

    insert into public.property_calculations (
      name,
      created_by,
      schema_version,
      payload,
      access_hash
    ) values (
      p_name,
      p_created_by,
      1,
      p_payload,
      token_hash
    )
    returning id into saved_id;
  else
    update public.property_calculations
    set name = p_name,
        created_by = p_created_by,
        schema_version = 1,
        payload = p_payload
    where id = p_id
      and access_hash = token_hash
    returning id into saved_id;

    if saved_id is null then
      raise exception 'calculation not found';
    end if;
  end if;

  return saved_id;
end;
$$;

revoke all on function public.list_property_calculations(text) from public;
revoke all on function public.save_property_calculation(uuid, text, jsonb, text, text) from public;

grant execute on function public.list_property_calculations(text)
to anon, authenticated, service_role;
grant execute on function public.save_property_calculation(uuid, text, jsonb, text, text)
to anon, authenticated, service_role;

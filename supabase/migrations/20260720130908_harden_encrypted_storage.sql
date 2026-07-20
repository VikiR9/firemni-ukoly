-- Limit public offer access to exact-slug RPC calls and enforce encrypted
-- storage for the new property module. Legacy shared internal tables remain
-- under their compatibility policies until Supabase Auth is introduced.

drop policy if exists read_active_encrypted_offers on public.published_offers;
drop policy if exists publish_encrypted_offers on public.published_offers;

revoke select, insert on table public.published_offers from anon, authenticated;

create index if not exists published_offers_created_at_idx
on public.published_offers (created_at desc);

create or replace function public.get_published_offer(p_slug text)
returns table (
  encrypted_payload text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_slug is null or p_slug !~ '^[A-Za-z0-9_-]{12,32}$' then
    return;
  end if;

  return query
  select offer.encrypted_payload, offer.expires_at
  from public.published_offers as offer
  where offer.slug = p_slug
    and offer.revoked_at is null
    and offer.expires_at > now()
  limit 1;
end;
$$;

create or replace function public.publish_encrypted_offer(
  p_slug text,
  p_product_type text,
  p_schema_version integer,
  p_encrypted_payload text,
  p_revoke_hash text,
  p_created_by text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_slug is null or p_slug !~ '^[A-Za-z0-9_-]{12,32}$' then
    raise exception 'invalid slug';
  end if;
  if p_product_type <> 'property' or p_schema_version <> 1 then
    raise exception 'unsupported offer type';
  end if;
  if p_encrypted_payload is null or length(p_encrypted_payload) not between 1 and 200000 then
    raise exception 'invalid encrypted payload';
  end if;
  if p_revoke_hash is null or p_revoke_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid revoke hash';
  end if;
  if p_created_by is null or p_created_by !~ '^[A-Z]{2,32}$' then
    raise exception 'invalid creator';
  end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '90 days' then
    raise exception 'invalid expiry';
  end if;

  -- Bound anonymous storage consumption even if somebody calls the public RPC
  -- outside the application. Normal advisor usage stays far below this limit.
  if (
    select count(*)
    from public.published_offers
    where created_at > now() - interval '1 hour'
  ) >= 100 then
    raise exception 'publication rate limit reached';
  end if;

  delete from public.published_offers
  where expires_at < now() - interval '7 days';

  insert into public.published_offers (
    slug,
    product_type,
    schema_version,
    encrypted_payload,
    revoke_hash,
    created_by,
    expires_at
  ) values (
    p_slug,
    p_product_type,
    p_schema_version,
    p_encrypted_payload,
    p_revoke_hash,
    p_created_by,
    p_expires_at
  );

  return true;
end;
$$;

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
  if p_slug is null
    or p_slug !~ '^[A-Za-z0-9_-]{12,32}$'
    or p_revoke_token is null
    or p_revoke_token !~ '^[A-Za-z0-9_-]{43}$'
  then
    return false;
  end if;

  update public.published_offers
  set revoked_at = now()
  where slug = p_slug
    and revoked_at is null
    and revoke_hash = encode(extensions.digest(p_revoke_token, 'sha256'), 'hex');

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

revoke all on function public.get_published_offer(text) from public;
revoke all on function public.publish_encrypted_offer(text, text, integer, text, text, text, timestamptz) from public;
revoke all on function public.revoke_published_offer(text, text) from public;

grant execute on function public.get_published_offer(text) to anon, authenticated;
grant execute on function public.publish_encrypted_offer(text, text, integer, text, text, text, timestamptz) to anon, authenticated;
grant execute on function public.revoke_published_offer(text, text) to anon, authenticated;

grant execute on function public.get_published_offer(text) to service_role;
grant execute on function public.publish_encrypted_offer(text, text, integer, text, text, text, timestamptz) to service_role;
grant execute on function public.revoke_published_offer(text, text) to service_role;

drop policy if exists internal_push_subscriptions_access on public.push_subscriptions;
revoke all on table public.push_subscriptions from anon, authenticated;

alter table public.property_calculations
add constraint property_calculations_encrypted_payload_check
check (
  jsonb_typeof(payload) = 'object'
  and payload ->> 'version' = '1'
  and payload ->> 'algorithm' = 'A256GCM'
  and jsonb_typeof(payload -> 'iv') = 'string'
  and jsonb_typeof(payload -> 'ciphertext') = 'string'
);

alter table public.property_calculations
add constraint property_calculations_generic_name_check
check (name = 'Šifrovaná majetková nabídka');

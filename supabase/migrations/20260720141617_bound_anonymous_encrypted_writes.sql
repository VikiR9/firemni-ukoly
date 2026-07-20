-- Anonymous encrypted writes are required by the current browser-only app, but
-- they must not provide an unbounded storage primitive. Serialize create paths,
-- keep payloads small, remove stale ciphertext, and enforce global hard caps.

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
  if p_encrypted_payload is null
    or length(p_encrypted_payload) not between 1 and 100000
  then
    raise exception 'invalid encrypted payload';
  end if;
  if p_revoke_hash is null or p_revoke_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid revoke hash';
  end if;
  if p_created_by is null or p_created_by !~ '^[A-Z]{2,32}$' then
    raise exception 'invalid creator';
  end if;
  if p_expires_at is null
    or p_expires_at <= now()
    or p_expires_at > now() + interval '90 days'
  then
    raise exception 'invalid expiry';
  end if;

  -- The transaction lock makes cleanup, counts and insert one atomic quota step.
  perform pg_catalog.pg_advisory_xact_lock(75964163320331::bigint);

  delete from public.published_offers
  where expires_at <= now()
     or (revoked_at is not null and revoked_at < now() - interval '1 day');

  if (
    select count(*)
    from public.published_offers
    where created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'publication rate limit reached';
  end if;

  if (select count(*) from public.published_offers) >= 250 then
    raise exception 'publication storage limit reached';
  end if;

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
    or length(p_payload::text) > 100000
  then
    raise exception 'invalid encrypted payload';
  end if;

  token_hash := encode(
    extensions.digest(p_access_token, 'sha256'),
    'hex'
  );

  if p_id is null then
    -- A global lock prevents concurrent callers from racing past the quotas.
    perform pg_catalog.pg_advisory_xact_lock(75964163320332::bigint);

    delete from public.property_calculations
    where updated_at < now() - interval '180 days';

    if (
      select count(*)
      from public.property_calculations
      where created_at > now() - interval '1 hour'
    ) >= 20 then
      raise exception 'calculation rate limit reached';
    end if;

    if (select count(*) from public.property_calculations) >= 250 then
      raise exception 'calculation storage limit reached';
    end if;

    if (
      select count(*)
      from public.property_calculations
      where access_hash = token_hash
    ) >= 50 then
      raise exception 'browser calculation limit reached';
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

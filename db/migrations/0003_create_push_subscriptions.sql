-- Migration: create push_subscriptions table
-- Run this in Supabase SQL editor

create table if not exists public.push_subscriptions (
  id uuid not null default gen_random_uuid(),
  username text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz null default now(),
  updated_at timestamptz null default now(),
  constraint push_subscriptions_pkey primary key (id),
  constraint push_subscriptions_endpoint_key unique (endpoint)
);

-- Add trigger to auto-update updated_at
create trigger trg_push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row execute function set_updated_at();

-- Index for fast username lookups
create index if not exists idx_push_subscriptions_username on public.push_subscriptions(username);

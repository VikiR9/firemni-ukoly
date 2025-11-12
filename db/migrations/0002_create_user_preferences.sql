-- Migration: create user_preferences table for storing lane preferences
-- Run this in Supabase SQL editor

create table if not exists public.user_preferences (
  username text not null,
  lanes jsonb null default '[]'::jsonb,
  created_at timestamptz null default now(),
  updated_at timestamptz null default now(),
  constraint user_preferences_pkey primary key (username)
);

-- Add trigger to auto-update updated_at
create trigger trg_user_preferences_updated_at
  before update on public.user_preferences
  for each row execute function set_updated_at();

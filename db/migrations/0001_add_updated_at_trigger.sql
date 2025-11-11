-- Migration: add trigger to update updated_at on row update
-- Run this in Supabase SQL editor (or via your migration tool)

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function set_updated_at();

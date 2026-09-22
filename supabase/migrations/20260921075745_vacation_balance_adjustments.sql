-- Year-specific opening balance corrections; future leave continues to be deducted.
create table attendance_private.vacation_adjustments (
 username text not null references attendance_private.people(username),
 year integer not null check (year between 2000 and 2200),
 adjustment_minutes integer not null,
 note text not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key (username, year)
);
alter table attendance_private.vacation_adjustments enable row level security;
revoke all on attendance_private.vacation_adjustments from public, anon, authenticated;

create or replace function attendance_private.vacation_remaining(p_user text,p_year integer)
returns integer language sql stable set search_path='' as $$
 select p.daily_hours*20*60
 + coalesce((select v.adjustment_minutes from attendance_private.vacation_adjustments v where v.username=p_user and v.year=p_year),0)
 - coalesce((select sum(attendance_private.workdays(greatest(r.date_from,make_date(p_year,1,1)),least(r.date_to,make_date(p_year,12,31)))*p.daily_hours*60) from attendance_private.requests r where r.username=p_user and r.kind='VACATION' and r.status in ('APPROVED','PENDING') and r.date_from<=make_date(p_year,12,31) and r.date_to>=make_date(p_year,1,1)),0)::int
 - coalesce((select sum(a.deducted_minutes) from attendance_private.absences a where a.username=p_user and extract(year from a.day)=p_year),0)::int
 from attendance_private.people p where p.username=p_user;
$$;
revoke all on function attendance_private.vacation_remaining(text,integer) from public,anon,authenticated;

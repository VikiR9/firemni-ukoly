insert into attendance_private.people(username,display_name,role) values ('LUKAS','Lukáš','EMPLOYEE') on conflict(username) do nothing;
do $$ declare definition text; begin
select pg_get_functiondef('public.task_workspace(text,text,uuid,jsonb)'::regprocedure) into definition;
if position('''Viktor'',''Nikola'']' in definition)=0 then raise exception 'Unexpected task roster definition'; end if;
execute replace(definition,'''Viktor'',''Nikola'']','''Viktor'',''Nikola'',''Lukáš'']');
end $$;

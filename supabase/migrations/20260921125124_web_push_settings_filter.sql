-- Supabase safeupdate also checks singleton updates invoked through PostgREST.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('push_private.gateway(text,text,text,jsonb)'::regprocedure);
 definition:=replace(definition,'set last_worker_at=now();','set last_worker_at=now() where id=true;');
 definition:=replace(definition,'worker_token=p_data->>''token'',enabled=true;','worker_token=p_data->>''token'',enabled=true where id=true;');
 definition:=replace(definition,'if p_data->>''url'' !~','if coalesce(p_data->>''url'','''') !~');
 execute definition;
 definition:=pg_get_functiondef('push_private.tick()'::regprocedure);
 definition:=replace(definition,'set last_tick_at=now();','set last_tick_at=now() where id=true;');
 execute definition;
end $$;
notify pgrst,'reload schema';

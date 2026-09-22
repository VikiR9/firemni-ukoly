create function public.account_task_action(p_secret text,p_token text,p_action text,p_task_id uuid,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare identity jsonb; actor_name text; task_id uuid;
begin
 identity:=public.account_gateway(p_secret,p_token,'check','{}');
 if identity->>'username' is null then return identity;end if;
 select display_name into actor_name from attendance_private.people where username=identity->>'username';
 task_id:=public.task_workspace(p_action,actor_name,p_task_id,p_data);
 return jsonb_build_object('ok',true,'task_id',task_id);
end $$;
revoke all on function public.account_task_action(text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.account_task_action(text,text,text,uuid,jsonb) to anon,authenticated;
revoke all on function public.task_workspace(text,text,uuid,jsonb) from public,anon,authenticated;

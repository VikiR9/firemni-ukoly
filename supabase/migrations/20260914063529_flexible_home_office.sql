-- Update existing gateway without changing other attendance actions or grants.
do $migration$
declare body text;
begin
 body:=pg_get_functiondef('attendance_private.gateway(text,text,text,jsonb)'::regprocedure);
 if position('if v_today>=wk then' in body)=0 then raise exception 'Unexpected attendance gateway version'; end if;
 body:=replace(body,$old$if v_today>=wk then raise exception 'Home office je nutné nahlásit nejpozději v neděli před daným týdnem.';end if;$old$,'');
 body:=replace(body,$old$if wk>v_today+370 or coalesce(cardinality(days),0)>4 then raise exception 'Home office může být nejvýše 4 dny v týdnu.';end if;$old$,'');
 body:=replace(body,'''vacation_days'',25','''vacation_days'',20');
 body:=replace(body,'''home_limit'',4','''home_limit'',null');
 body:=replace(body,'p.daily_hours*25*60','p.daily_hours*20*60');
 execute body;
 body:=pg_get_functiondef('attendance_private.vacation_remaining(text,integer)'::regprocedure);
 if position('p.daily_hours*25*60' in body)=0 then raise exception 'Unexpected vacation calculation';end if;
 execute replace(body,'p.daily_hours*25*60','p.daily_hours*20*60');
end $migration$;

create or replace function public.disclosure_calendar_apply(changes jsonb)
returns setof public.disclosure_calendar_entries
language plpgsql security invoker set search_path = '' as $$
declare change jsonb; affected public.disclosure_calendar_entries; owner_id uuid := auth.uid(); expected bigint;
begin
 if owner_id is null or public.disclosure_calendar_access_status()<>'approved' then raise exception 'Approved account required' using errcode = '42501'; end if;
 if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) > 20000 then raise exception 'Invalid changes'; end if;
 for change in select * from jsonb_array_elements(changes) loop
   expected := (change->>'version')::bigint;
   if expected is null or expected < 0 then raise exception 'Invalid version'; end if;
   if expected = 0 then
     insert into public.disclosure_calendar_entries(user_id,kind,item_key,value,version)
     values(owner_id,change->>'kind',change->>'key',nullif(change->'value','null'::jsonb),1)
     on conflict(user_id,kind,item_key) do nothing returning * into affected;
   else
     update public.disclosure_calendar_entries
     set value=nullif(change->'value','null'::jsonb),version=version+1,updated_at=now()
     where user_id=owner_id and kind=change->>'kind' and item_key=change->>'key' and version=expected
     returning * into affected;
   end if;
   if not found then raise exception 'Calendar changed on another device' using errcode='40001'; end if;
   return next affected;
 end loop;
end; $$;

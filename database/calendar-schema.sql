-- Calendar namespace only. Existing application tables and Auth configuration are unchanged.
create table public.disclosure_calendar_entries (
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check (kind in ('settings','overrides','done','custom')),
 item_key text not null check (item_key ~ '^[a-zA-Z0-9_-]{1,150}$' and item_key not in ('__proto__','constructor','prototype')),
 value jsonb,
 version bigint not null default 1 check (version > 0),
 updated_at timestamptz not null default now(),
 primary key (user_id, kind, item_key),
 check (value is null or octet_length(value::text) <= 50000)
);
alter table public.disclosure_calendar_entries enable row level security;
revoke all on public.disclosure_calendar_entries from anon, authenticated;
grant select, insert, update on public.disclosure_calendar_entries to authenticated;
create policy calendar_read_own on public.disclosure_calendar_entries for select to authenticated using ((select auth.uid()) = user_id);
create policy calendar_insert_own on public.disclosure_calendar_entries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy calendar_update_own on public.disclosure_calendar_entries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- Null values are versioned tombstones: stale devices cannot resurrect deletions.
create function public.disclosure_calendar_apply(changes jsonb)
returns setof public.disclosure_calendar_entries
language plpgsql security invoker set search_path = '' as $$
declare change jsonb; affected public.disclosure_calendar_entries; owner_id uuid := auth.uid(); expected bigint;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
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
revoke all on function public.disclosure_calendar_apply(jsonb) from public, anon;
grant execute on function public.disclosure_calendar_apply(jsonb) to authenticated;
comment on table public.disclosure_calendar_entries is 'Private calendar settings and events, per account. Null values are deletion tombstones.';


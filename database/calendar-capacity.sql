-- Bound storage growth even when an approved user calls PostgREST directly.
alter table public.disclosure_calendar_entries add constraint calendar_value_size check(value is null or octet_length(value::text)<=4096);
create function calendar_private.limit_calendar_entries() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,0));
 if (select count(*) from public.disclosure_calendar_entries where user_id=new.user_id)>=12000 then
  raise exception 'Calendar capacity reached' using errcode='54000';
 end if;
 return new;
end; $$;
revoke all on function calendar_private.limit_calendar_entries() from public,anon,authenticated;
create trigger calendar_entry_capacity before insert on public.disclosure_calendar_entries
for each row execute function calendar_private.limit_calendar_entries();

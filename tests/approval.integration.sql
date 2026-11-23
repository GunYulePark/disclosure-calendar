-- Run against the dedicated calendar test/production schema via an administrative connection.
-- All fixtures and decisions are rolled back; no real email or durable account is created.
begin;
select set_config('calendar_test.a',gen_random_uuid()::text,true),set_config('calendar_test.b',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,role,aud)
 values(current_setting('calendar_test.a')::uuid,'qa-a@example.invalid',now(),'authenticated','authenticated'),
 (current_setting('calendar_test.b')::uuid,'qa-b@example.invalid',now(),'authenticated','authenticated');
insert into public.disclosure_calendar_entries(user_id,kind,item_key,value) values(current_setting('calendar_test.b')::uuid,'done','foreign-task','true');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('calendar_test.a'),'role','authenticated','user_metadata',jsonb_build_object('approved',true,'is_admin',true))::text,true);
do $$begin
 if public.disclosure_calendar_access_status()<>'pending' then raise exception 'metadata bypass'; end if;
 if exists(select 1 from public.disclosure_calendar_entries) then raise exception 'pending read bypass'; end if;
 begin perform public.disclosure_calendar_apply('[{"kind":"done","key":"own-task","value":true,"version":0}]');raise exception 'pending write bypass';exception when insufficient_privilege then null;end;
 begin insert into public.disclosure_calendar_members(user_id,status) values(auth.uid(),'approved');raise exception 'self approval bypass';exception when insufficient_privilege then null;end;
 if has_function_privilege('authenticated','public.disclosure_calendar_issue_approval(uuid,text,text)','execute') then raise exception 'service RPC exposed'; end if;
 if has_schema_privilege('authenticated','calendar_private','usage') then raise exception 'private schema exposed'; end if;
end $$;
set local role service_role;
select public.disclosure_calendar_issue_approval(current_setting('calendar_test.a')::uuid,repeat('a',64),'qa-a@example.invalid');
do $$begin
 begin perform public.disclosure_calendar_review_approval(repeat('a',64),'approve');raise exception 'unsent link accepted';exception when insufficient_privilege then null;end;
 begin perform public.disclosure_calendar_issue_approval(current_setting('calendar_test.a')::uuid,repeat('b',64),'qa-a@example.invalid');raise exception 'cooldown bypass';exception when raise_exception then if sqlerrm='cooldown bypass' then raise;end if;end;
end $$;
select public.disclosure_calendar_mark_mail(current_setting('calendar_test.a')::uuid,repeat('a',64),true);
select public.disclosure_calendar_review_approval(repeat('a',64),null);
do $$begin if (select status from public.disclosure_calendar_members where user_id=current_setting('calendar_test.a')::uuid)<>'pending' then raise exception 'inspection mutated approval';end if;end $$;
select public.disclosure_calendar_review_approval(repeat('a',64),'approve');
do $$begin begin perform public.disclosure_calendar_review_approval(repeat('a',64),'approve');raise exception 'replay accepted';exception when insufficient_privilege then null;end;end $$;
set local role authenticated;
select public.disclosure_calendar_apply('[{"kind":"done","key":"own-task","value":true,"version":0}]');
do $$begin
 if (select count(*) from public.disclosure_calendar_entries)<>1 then raise exception 'tenant isolation';end if;
 begin insert into public.disclosure_calendar_entries(user_id,kind,item_key,value) values(current_setting('calendar_test.b')::uuid,'done','attack','true');raise exception 'other user write';exception when insufficient_privilege then null;end;
 begin update public.disclosure_calendar_entries set user_id=current_setting('calendar_test.b')::uuid where item_key='own-task';raise exception 'ownership transfer';exception when insufficient_privilege then null;end;
 begin perform public.disclosure_calendar_apply('[{"kind":"done","key":"own-task","value":false,"version":0}]');raise exception 'stale version accepted';exception when serialization_failure then null;end;
end $$;
set local role service_role;
select public.disclosure_calendar_issue_approval(current_setting('calendar_test.b')::uuid,repeat('b',64),'qa-b@example.invalid');
select public.disclosure_calendar_mark_mail(current_setting('calendar_test.b')::uuid,repeat('b',64),true);
update calendar_private.approval_tickets set expires_at=now()-interval '1 minute',issued_at=now()-interval '16 minutes' where user_id=current_setting('calendar_test.b')::uuid;
do $$begin begin perform public.disclosure_calendar_review_approval(repeat('b',64),'approve');raise exception 'expired accepted';exception when insufficient_privilege then null;end;end $$;
select public.disclosure_calendar_issue_approval(current_setting('calendar_test.b')::uuid,repeat('c',64),'qa-b@example.invalid');
select public.disclosure_calendar_mark_mail(current_setting('calendar_test.b')::uuid,repeat('c',64),true);
select public.disclosure_calendar_review_approval(repeat('c',64),'reject');
update public.disclosure_calendar_members set status='suspended' where user_id=current_setting('calendar_test.a')::uuid;
set local role authenticated;
do $$begin
 if exists(select 1 from public.disclosure_calendar_entries) then raise exception 'revocation read bypass';end if;
 begin perform public.disclosure_calendar_apply('[]');raise exception 'revocation write bypass';exception when insufficient_privilege then null;end;
 if has_function_privilege('anon','public.disclosure_calendar_review_approval(text,text)','execute') then raise exception 'anon review bypass';end if;
end $$;
rollback;
select 'PASS: pending block, forged metadata, self approval, private ACL, mail state, cooldown, inspect safety, approval, replay, own data, cross-user write, ownership transfer, stale version, expiry, rejection, revocation' as result;
